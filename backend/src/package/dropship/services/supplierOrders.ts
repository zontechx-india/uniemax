import { Prisma } from "../../../generated/prisma/client.js";
import type { SupplierOrderStatus as DbStatus } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { newObjectKey, storage, storeUpload, type UploadedFile } from "../../storage/index.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import {
  CLOSED,
  HOLDS_STOCK,
  ORDER_MOVES,
  canMove,
  cantShipText,
  moveRefusal,
  platformFeeFor,
  rollup,
  shipByDate,
  supplierAmounts,
} from "../domain.js";
import type { CantShipReason, OrderActor, OrderMove, SupplierOrderStatus } from "../domain.js";
import type { TrackingInput, Tx } from "../types.js";
import * as resale from "./resale.js";

/**
 * Supplier orders — one supplier's share of one customer order
 * (docs/dropshipping/orders). Placement, payment and expiry run for the
 * system; the supplier ships; every move is a guarded write against the
 * state it was read in, with an event row. The customer order follows
 * through the host's system actions ("Rolling up").
 */

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const log = (what: string) => (err: unknown) => console.error(`Dropship ${what} failed:`, err);

type SoRow = Prisma.SupplierOrderGetPayload<{ include: { lines: true; supplier: true } }>;

// ===========================================================================
// Placement — inside the core's own transactions (hooks.ts)
// ===========================================================================

class LineRefused extends HttpError {}

/**
 * `order.placing`: re-check every supplier line, reserve the supplier's stock,
 * tag the lines and write one supplier order per supplier with the terms in
 * force right now (D-18, T-8). Any refusal rolls the whole placement back.
 */
export async function place(tx: Tx, orderId: string): Promise<void> {
  const order = await deps.host.getPlacingOrder(tx, orderId);
  if (!order) return;
  const productIds = order.lines.flatMap((l) => (l.productId ? [l.productId] : []));
  if (productIds.length === 0) return;
  const copies = await tx.resale.findMany({
    where: { productId: { in: productIds } },
    include: {
      variants: true,
      link: { include: { supplier: true } },
      supplyProduct: { include: { variants: true } },
    },
  });
  if (copies.length === 0) return;
  const copyOf = new Map(copies.map((c) => [c.productId, c]));

  type Group = {
    link: (typeof copies)[number]["link"];
    lines: {
      itemId: string;
      supplierVariantId: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      unitCost: Prisma.Decimal;
    }[];
  };
  const groups = new Map<string, Group>();

  for (const line of order.lines) {
    const copy = line.productId ? copyOf.get(line.productId) : undefined;
    if (!copy) continue; // the seller's own line
    const gone = () =>
      new LineRefused(409, `"${line.productName}" is no longer available — remove it from your cart`);
    const rv = copy.variants.find((v) => v.variantId === line.stockVariantId);
    const offer = rv && copy.supplyProduct.variants.find((v) => v.variantId === rv.supplyVariantId);
    const { link } = copy;
    // K-7: everything the copy depends on, re-read inside this transaction.
    if (
      !rv ||
      !offer ||
      link.status !== "ACTIVE" ||
      link.supplier.status !== "ACTIVE" ||
      !copy.supplyProduct.isOpen ||
      !offer.isOpen ||
      offer.cost.gt(line.unitPrice)
    ) {
      throw gone();
    }
    // T-3: COD turned off for this supplier while the shopper was at checkout.
    if (order.paymentMethod === "COD" && !link.codAllowed) {
      throw HttpError.badRequest(
        `Cash on delivery is no longer available for "${line.productName}". Please pay online.`,
      );
    }
    // K-1, K-2: the supplier's own counter — the one every seller and the
    // supplier's own shop sell from.
    if (!(await deps.host.reserveStock(tx, rv.supplyVariantId, line.quantity))) {
      throw HttpError.conflict(`"${line.productName}" just sold out — refresh your cart`);
    }
    const group = groups.get(link.supplierId) ?? { link, lines: [] };
    group.lines.push({
      itemId: line.itemId,
      supplierVariantId: rv.supplyVariantId,
      productName: line.productName,
      variantName: line.variantName,
      quantity: line.quantity,
      unitCost: offer.cost,
    });
    groups.set(link.supplierId, group);
  }
  if (groups.size === 0) return;

  const all = [...groups.values()].flatMap((g) => g.lines);
  await deps.host.tagItems(tx, all.map((l) => l.itemId));
  const skus = await deps.host.getVariantSkus(tx, all.map((l) => l.supplierVariantId));

  const cod = order.paymentMethod === "COD";
  const live = cod || order.paid; // K-12: paid at placement → straight to NEW
  const now = new Date();
  for (const [supplierId, { link, lines }] of groups) {
    const s = link.supplier;
    const amounts = supplierAmounts(lines, s.shippingFee);
    const linesTotal = lines.reduce(
      (sum, l) => sum.add(order.lines.find((o) => o.itemId === l.itemId)!.lineTotal),
      D(0),
    );
    const status: DbStatus = live ? "NEW" : "AWAITING_PAYMENT";
    await tx.supplierOrder.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerStoreId: link.sellerStoreId,
        supplierId,
        linkId: link.id,
        status,
        paymentMode: cod ? "COD" : "PREPAID",
        // COD orders are always one parcel (D-13), so the parcel collects the order total.
        collectAmount: cod ? order.total : null,
        shipWithinDays: s.shipWithinDays,
        returnDays: s.returnDays,
        returnFeePayer: link.returnFeePayer,
        // D-20, per supplier order: the rate × this supplier's lines.
        platformFee: platformFeeFor(linesTotal, dropshipConfig.platformFeePct),
        settleVia: "DIRECT", // Easy Split is Phase 6 (D-16)
        shipBy: live ? shipByDate(now, s.shipWithinDays) : null,
        costTotal: amounts.costTotal,
        shippingFee: amounts.shippingFee,
        supplierShare: amounts.supplierShare,
        lines: {
          create: lines.map((l) => ({
            orderItemId: l.itemId,
            supplierVariantId: l.supplierVariantId,
            productName: l.productName,
            variantName: l.variantName,
            supplierSku: skus.get(l.supplierVariantId) ?? null,
            quantity: l.quantity,
            unitCost: l.unitCost,
          })),
        },
        events: { create: { from: null, to: status, actor: "SYSTEM" } },
      },
    });
  }
}

/** `order.unplacing` (the gateway refused, K-10): give the stock back and forget the parts. */
export async function unplace(tx: Tx, orderId: string): Promise<void> {
  const parts = await tx.supplierOrder.findMany({ where: { orderId }, include: { lines: true } });
  for (const p of parts) {
    if ((HOLDS_STOCK as readonly string[]).includes(p.status)) await releaseLines(tx, p.lines);
  }
  await tx.supplierOrder.deleteMany({ where: { orderId } });
}

/**
 * `order.cancelling`: close every part that hasn't finished and give its stock
 * back. Refused while a supplier's parcel is on its way (F-4) — once it comes
 * back, the order can be cancelled.
 */
export async function cancelling(tx: Tx, orderId: string): Promise<void> {
  const parts = await tx.supplierOrder.findMany({ where: { orderId }, include: { lines: true } });
  if (parts.some((p) => p.status === "SHIPPED")) {
    throw HttpError.conflict(
      "A supplier's parcel for this order is on its way, so it can't be cancelled now. If it comes back, you can cancel it then.",
    );
  }
  for (const p of parts) {
    if (!canMove("cancel", p.status, "SYSTEM")) continue;
    await guardedMove(tx, p, "cancel", "SYSTEM", null, "Order cancelled", {
      closedAt: new Date(),
      closeReason: "Order cancelled",
      statementState: "VOID",
    });
    if ((HOLDS_STOCK as readonly string[]).includes(p.status)) await releaseLines(tx, p.lines);
  }
}

async function releaseLines(tx: Tx, lines: { supplierVariantId: string; quantity: number }[]) {
  for (const l of lines) await deps.host.releaseStock(tx, l.supplierVariantId, l.quantity);
}

async function reserveLines(tx: Tx, lines: { supplierVariantId: string; quantity: number }[]) {
  for (const l of lines) {
    if (!(await deps.host.reserveStock(tx, l.supplierVariantId, l.quantity))) return false;
  }
  return true;
}

// ===========================================================================
// After commit — events.ts
// ===========================================================================

/** `order.placed`: the supplier hears about parts it can ship now; other copies re-mirror (D-36). */
export async function afterPlaced(orderId: string): Promise<void> {
  const parts = await deps.prisma.supplierOrder.findMany({ where: { orderId }, include: { lines: true, supplier: true } });
  for (const p of parts) if (p.status === "NEW") await tellSupplierNew(p).catch(log("new-order notice"));
  await remirror(parts.flatMap((p) => p.lines));
}

/** `order.cancelled`: tell suppliers who had it to ship; copies re-mirror. */
export async function afterCancelled(orderId: string): Promise<void> {
  const parts = await deps.prisma.supplierOrder.findMany({
    where: { orderId, status: "CANCELLED" },
    include: { lines: true, supplier: true, events: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  for (const p of parts) {
    const last = p.events[0];
    // Only a supplier who saw it as an order to ship needs telling.
    if (last?.to === "CANCELLED" && (last.from === "NEW" || last.from === "ACCEPTED")) {
      const store = await deps.host.getStore(p.supplier.storeId);
      if (store) {
        deps.host.notify(store.ownerId, {
          title: `Order #${p.orderNumber} cancelled — don't ship`,
          body: "The order was cancelled. If you've packed it, put the items back.",
          url: `/mystores/${store.slug}/orders-to-ship`,
        });
      }
    }
  }
  await remirror(parts.flatMap((p) => p.lines));
}

/**
 * `order.paid`: an awaiting part becomes NEW; an expired one is reserved again
 * — or, with the stock gone, rejected and rolled up (K-9). A part already
 * cancelled stays cancelled (K-11: the core's refund alert covers it).
 */
export async function onPaid(orderId: string): Promise<void> {
  const parts = await deps.prisma.supplierOrder.findMany({ where: { orderId }, include: { lines: true, supplier: true } });
  let rejected = false;
  for (const p of parts) {
    const shipBy = shipByDate(new Date(), p.shipWithinDays);
    if (p.status === "AWAITING_PAYMENT") {
      const moved = await deps.prisma
        .$transaction((tx) => guardedMove(tx, p, "paid", "SYSTEM", null, null, { shipBy }))
        .then(() => true, () => false);
      if (moved) await tellSupplierNew({ ...p, shipBy }).catch(log("new-order notice"));
    } else if (p.status === "EXPIRED") {
      const back = await deps.prisma
        .$transaction(async (tx) => {
          if (!(await reserveLines(tx, p.lines))) throw new SoldOut();
          await guardedMove(tx, p, "repaid", "SYSTEM", null, "Paid after the hold ended", { shipBy, closeReason: null });
        })
        .then(
          () => true,
          (err) => {
            if (!(err instanceof SoldOut)) throw err;
            return false;
          },
        );
      if (back) {
        await tellSupplierNew({ ...p, shipBy }).catch(log("new-order notice"));
      } else {
        const reason = "Sold out before the payment came in";
        await deps.prisma.$transaction((tx) =>
          guardedMove(tx, p, "repaidSoldOut", "SYSTEM", null, reason, {
            closedAt: new Date(),
            closeReason: reason,
            statementState: "VOID",
          }),
        );
        rejected = true;
      }
    }
  }
  await remirror(parts.flatMap((p) => p.lines));
  if (rejected) await rollUp(orderId, "cantShip");
}

class SoldOut extends Error {}

/** Hourly: unpaid online parts past the hold give their stock back (K-8). Returns how many. */
export async function expireUnpaid(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - dropshipConfig.unpaidHoldHours * 60 * 60 * 1000);
  const stale = await deps.prisma.supplierOrder.findMany({
    where: { status: "AWAITING_PAYMENT", createdAt: { lt: cutoff } },
    include: { lines: true, supplier: true },
    take: 200,
  });
  let n = 0;
  for (const p of stale) {
    const done = await deps.prisma
      .$transaction(async (tx) => {
        await guardedMove(tx, p, "expire", "SYSTEM", null, "Not paid in time", { closeReason: "Not paid in time" });
        await releaseLines(tx, p.lines);
      })
      .then(() => true, () => false); // paid or cancelled in between: leave it
    if (done) n++;
  }
  await remirror(stale.flatMap((p) => p.lines));
  return n;
}

/** Copies of the supplier variants these lines took re-mirror the supplier's stock (D-36). */
async function remirror(lines: { supplierVariantId: string }[]): Promise<void> {
  for (const id of new Set(lines.map((l) => l.supplierVariantId))) {
    await resale.syncForSupplierVariant(id).catch(log("stock mirror"));
  }
}

async function tellSupplierNew(p: Pick<SoRow, "orderNumber" | "paymentMode" | "collectAmount" | "supplier"> & { shipBy: Date | null }) {
  const store = await deps.host.getStore(p.supplier.storeId);
  if (!store) return;
  const by = p.shipBy ? ` Ship by ${p.shipBy.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : "";
  deps.host.notify(store.ownerId, {
    title: `New order to ship — #${p.orderNumber}`,
    body:
      (p.paymentMode === "COD" && p.collectAmount ? `Cash on delivery: collect ₹${p.collectAmount.toFixed(0)}.` : "Prepaid — don't collect cash.") + by,
    url: `/mystores/${store.slug}/orders-to-ship`,
  });
}

// ===========================================================================
// The supplier's actions
// ===========================================================================

/**
 * One guarded move: `update … where { id, status: from }`. Zero rows → the
 * order changed under us → 409 with the words for what it is now (F-11, F-16).
 */
async function guardedMove(
  tx: Tx,
  p: { id: string; status: SupplierOrderStatus },
  move: OrderMove,
  actor: OrderActor,
  actorId: string | null,
  note: string | null,
  data: Prisma.SupplierOrderUpdateManyMutationInput = {},
): Promise<void> {
  const to = ORDER_MOVES[move].to;
  const updated = await tx.supplierOrder.updateMany({
    where: { id: p.id, status: p.status },
    data: { ...data, status: to },
  });
  if (updated.count === 0) {
    const now = await tx.supplierOrder.findUnique({ where: { id: p.id }, select: { status: true } });
    throw HttpError.conflict(moveRefusal(now?.status ?? p.status));
  }
  await tx.supplierOrderEvent.create({
    data: { supplierOrderId: p.id, from: p.status, to, actor, actorId, note },
  });
}

/** A part of this supplier's, or 404. */
async function ownPart(supplierId: string, id: string): Promise<SoRow> {
  const p = await deps.prisma.supplierOrder.findFirst({
    where: { id, supplierId },
    include: { lines: true, supplier: true },
  });
  if (!p) throw HttpError.notFound("Order not found");
  return p;
}

function allowed(p: SoRow, move: OrderMove, actor: OrderActor) {
  if (!canMove(move, p.status, actor)) throw HttpError.conflict(moveRefusal(p.status));
}

export async function confirm(supplierId: string, id: string, by: string) {
  const p = await ownPart(supplierId, id);
  allowed(p, "confirm", "SUPPLIER");
  await deps.prisma.$transaction((tx) =>
    guardedMove(tx, p, "confirm", "SUPPLIER", by, null, { acceptedAt: new Date() }),
  );
  await rollUp(p.orderId, "moved");
}

/**
 * Ship: the core parcel first (it takes the order's lock and refuses a
 * cancelled order; the customer is told with the tracking, D-4), then the
 * guarded write. A second tap fails at the parcel — its lines are already out.
 */
export async function ship(supplierId: string, id: string, by: string, tracking: TrackingInput) {
  const p = await ownPart(supplierId, id);
  allowed(p, "ship", "SUPPLIER");
  // D-39 / F-5: a supplier parcel always has a real courier and a number.
  if (tracking.carrierCode === "self" || !tracking.trackingNumber?.trim()) {
    throw HttpError.badRequest("Choose the courier and add the tracking number");
  }
  const store = await deps.host.getStore(p.supplier.storeId);
  const shipmentId = await deps.host.createShipment({
    orderId: p.orderId,
    orderItemIds: p.lines.map((l) => l.orderItemId),
    tracking,
    senderName: store?.name ?? "the supplier",
    externalRef: p.id,
  });
  await deps.prisma.$transaction((tx) =>
    guardedMove(tx, p, "ship", "SUPPLIER", by, null, { shipmentId, shippedAt: new Date() }),
  );
  await rollUp(p.orderId, "moved");
}

/** F-6: correct the courier, number or link while it's on its way. The customer is told. */
export async function editTracking(supplierId: string, id: string, by: string, tracking: TrackingInput) {
  const p = await ownPart(supplierId, id);
  if (p.status !== "SHIPPED" || !p.shipmentId) throw HttpError.conflict(moveRefusal(p.status));
  if (tracking.carrierCode === "self" || !tracking.trackingNumber?.trim()) {
    throw HttpError.badRequest("Choose the courier and add the tracking number");
  }
  await deps.host.updateShipmentTracking(p.shipmentId, tracking);
  await deps.prisma.supplierOrderEvent.create({
    data: { supplierOrderId: p.id, from: "SHIPPED", to: "SHIPPED", actor: "SUPPLIER", actorId: by, note: "Tracking updated" },
  });
}

/** F-3: can't ship — the reason is required; the stock goes back; then the rollup. */
export async function cantShip(
  supplierId: string,
  id: string,
  by: string,
  reason: CantShipReason,
  note: string | null,
) {
  const p = await ownPart(supplierId, id);
  allowed(p, "cantShip", "SUPPLIER");
  const text = cantShipText(reason, note);
  await deps.prisma.$transaction(async (tx) => {
    await guardedMove(tx, p, "cantShip", "SUPPLIER", by, text, {
      closedAt: new Date(),
      closeReason: text,
      statementState: "VOID",
    });
    await releaseLines(tx, p.lines);
  });
  await remirror(p.lines);
  await rollUp(p.orderId, "cantShip", text);
}

/**
 * Delivered — by the supplier, or by the seller when the customer confirmed
 * (F-10). The proof photo, if any, is stored first and removed again if the
 * parcel had already moved on.
 */
export async function delivered(p: SoRow, actor: "SUPPLIER" | "SELLER", by: string, photo: UploadedFile | null) {
  allowed(p, "delivered", actor);
  if (!p.shipmentId) throw HttpError.conflict(moveRefusal(p.status));
  let podKey: string | null = null;
  if (photo) {
    podKey = newObjectKey(`pod/${p.sellerStoreId}/${p.orderId}`, photo.contentType);
    await storeUpload("media", podKey, photo);
  }
  try {
    await deps.host.markShipmentDelivered(p.shipmentId, podKey);
  } catch (err) {
    if (podKey) void storage.remove("media", podKey).catch(() => undefined);
    throw err;
  }
  const now = new Date();
  await deps.prisma.$transaction((tx) =>
    guardedMove(tx, p, "delivered", actor, by, null, { deliveredAt: now, closedAt: now }),
  );
}

export async function supplierDelivered(supplierId: string, id: string, by: string, photo: UploadedFile | null) {
  await delivered(await ownPart(supplierId, id), "SUPPLIER", by, photo);
}

/** F-8: the parcel came back. The supplier says whether its stock goes back; then the rollup. */
export async function cameBack(supplierId: string, id: string, by: string, restock: boolean) {
  const p = await ownPart(supplierId, id);
  allowed(p, "cameBack", "SUPPLIER");
  if (!p.shipmentId) throw HttpError.conflict(moveRefusal(p.status));
  await deps.host.markShipmentReturned(p.shipmentId);
  await deps.prisma.$transaction(async (tx) => {
    await guardedMove(tx, p, "cameBack", "SUPPLIER", by, restock ? "Put back in stock" : "Not put back in stock", {
      closedAt: new Date(),
      closeReason: "The parcel came back",
    });
    if (restock) await releaseLines(tx, p.lines);
  });
  if (restock) await remirror(p.lines);
  await rollUp(p.orderId, "cameBack");
}

// ===========================================================================
// Rolling up to the customer order
// ===========================================================================

/**
 * After a part moved: confirm, cancel or ask the seller (domain `rollup`).
 * The customer order never runs ahead of its slowest parcel. Failures here
 * never undo the supplier's own move — admin's list catches what's left.
 */
export async function rollUp(orderId: string, why: "moved" | "cantShip" | "cameBack", reason?: string) {
  const [view] = await deps.host.getOrderViews([orderId]);
  if (!view || view.status === "CANCELLED") return;
  const parts = await deps.prisma.supplierOrder.findMany({ where: { orderId }, include: { lines: true } });
  const hasOwnItems = view.items.some((i) => !i.fulfilledBy);
  const decision = rollup({ hasOwnItems, parts });
  const seller = view.storeId ? await deps.host.getStore(view.storeId) : null;

  if (decision === "confirm") {
    await deps.host.confirmOrder(orderId).catch(log("order confirm"));
    return;
  }
  if (decision === "cancel") {
    const why_ = why === "cameBack" ? "the parcel came back to the supplier" : `the supplier couldn't ship it${reason ? ` (${reason})` : ""}`;
    try {
      await deps.host.cancelOrder(orderId, `Cancelled because ${why_}`);
      if (seller) {
        deps.host.notify(seller.ownerId, {
          title: `Order #${view.orderNumber} was cancelled`,
          body: `Order #${view.orderNumber} was cancelled because ${why_}.${view.paymentStatus === "PAID" ? " The customer's refund is on UnieMax's list." : ""}`,
          url: `/mystores/${seller.slug}/orders/${orderId}`,
        });
      }
    } catch (err) {
      log("auto-cancel")(err);
    }
    return;
  }
  if (decision === "askSeller" && why !== "moved" && seller) {
    const failed = parts.find((p) => p.status === "REJECTED" || p.status === "RETURNED");
    const item = failed?.lines[0];
    const name = item ? `${item.productName}${item.variantName ? ` (${item.variantName})` : ""}` : "an item";
    deps.host.notify(seller.ownerId, {
      title: why === "cameBack" ? `A parcel of order #${view.orderNumber} came back` : `The supplier can't ship ${name}`,
      body: "Open the order to decide whether to cancel it and refund the customer.",
      url: `/mystores/${seller.slug}/orders/${orderId}`,
    });
  }
}

// ===========================================================================
// The seller's actions on a part
// ===========================================================================

async function sellerPart(storeId: string, orderId: string, id: string): Promise<SoRow> {
  const p = await deps.prisma.supplierOrder.findFirst({
    where: { id, orderId, sellerStoreId: storeId },
    include: { lines: true, supplier: true },
  });
  if (!p) throw HttpError.notFound("Order not found");
  return p;
}

/** F-10: the customer told the seller it arrived. */
export async function sellerDelivered(storeId: string, orderId: string, id: string, by: string) {
  await delivered(await sellerPart(storeId, orderId, id), "SELLER", by, null);
}

/** F-9: a ticket to UnieMax with the order attached; the statement line waits (HELD). */
export async function reportProblem(storeId: string, ownerId: string, orderId: string, id: string, note: string) {
  const p = await sellerPart(storeId, orderId, id);
  if (p.issueOpenAt && !p.adminResolvedAt) {
    throw HttpError.conflict("A problem is already reported for this parcel — UnieMax is looking into it");
  }
  const supplier = await deps.host.getStore(p.supplier.storeId);
  const items = p.lines.map((l) => `${l.quantity} × ${l.productName}${l.variantName ? ` (${l.variantName})` : ""}`).join(", ");
  const ticketId = await deps.host.openTicket(
    ownerId,
    storeId,
    `Problem with order #${p.orderNumber}`,
    `${note}\n\nOrder #${p.orderNumber} · supplier ${supplier?.name ?? "—"} · ${items}`,
  );
  await deps.prisma.supplierOrder.update({
    where: { id: p.id },
    data: {
      issueOpenAt: new Date(),
      issueTicketId: ticketId,
      adminResolvedAt: null,
      adminNote: null,
      ...(p.statementState === "VOID" ? {} : { statementState: "HELD" as const }),
    },
  });
  return { ticketId };
}

/** Admin's Needs action → Resolve with a note. A held line goes back to pending. */
export async function resolve(id: string, adminId: string, note: string) {
  const p = await deps.prisma.supplierOrder.findUnique({ where: { id }, include: { supplier: true } });
  if (!p) throw HttpError.notFound("Not found");
  await deps.prisma.supplierOrder.update({
    where: { id },
    data: {
      adminResolvedAt: new Date(),
      adminNote: note,
      ...(p.statementState === "HELD" ? { statementState: "PENDING" as const } : {}),
    },
  });
  await deps.prisma.supplierOrderEvent.create({
    data: { supplierOrderId: id, from: p.status, to: p.status, actor: "ADMIN", actorId: adminId, note: `Resolved: ${note}` },
  });
  if (p.issueOpenAt) {
    const seller = await deps.host.getStore(p.sellerStoreId);
    if (seller) {
      deps.host.notify(seller.ownerId, {
        title: `Problem resolved — order #${p.orderNumber}`,
        body: note,
        url: `/mystores/${seller.slug}/orders/${p.orderId}`,
      });
    }
  }
}

/** Parts the supplier never saw (unpaid, expired) are not its business. */
export const SUPPLIER_VISIBLE: DbStatus[] = ["NEW", "ACCEPTED", "SHIPPED", "DELIVERED", "REJECTED", "RETURNED", "CANCELLED"];
export { CLOSED };
