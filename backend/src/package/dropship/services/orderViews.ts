import { Prisma } from "../../../generated/prisma/client.js";
import type { SupplierOrderStatus as DbStatus } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { mediaUrl } from "../../storage/index.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { customerDataHidden, isLate, orderEarnings, payoutDate, splitAmounts, splitWindowClosing } from "../domain.js";
import type { OrderView, ParcelRef, StoreRef } from "../types.js";

/**
 * What each side sees of supplier orders. The supplier never gets the
 * customer's email or the seller's prices (F-12); the seller sees its parts,
 * earnings and parcels; admin sees what needs a person.
 */

type Row = Prisma.SupplierOrderGetPayload<{ include: { lines: true; supplier: true } }>;

const money = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

function parcelOf(view: OrderView | undefined, shipmentId: string | null): ParcelRef | null {
  return (shipmentId && view?.parcels.find((p) => p.id === shipmentId)) || null;
}

function shapeParcel(p: ParcelRef | null) {
  if (!p) return null;
  return {
    id: p.id,
    carrierCode: p.carrierCode,
    carrier: p.carrier,
    trackingNumber: p.trackingNumber,
    trackingUrl: p.trackingUrl,
    shippedAt: p.shippedAt,
    deliveredAt: p.deliveredAt,
    returnedAt: p.returnedAt,
  };
}

/** "Terms for this order: …" — the snapshot in words (terms → Where the snapshot is shown). */
function termsLine(r: Row): string {
  const lines = r.lines.map((l) => `supplier price ₹${l.unitCost.toFixed(0)} × ${l.quantity}`).join(" · ");
  return [
    lines,
    `shipping fee ₹${r.shippingFee.toFixed(0)}`,
    r.paymentMode === "COD" ? "cash on delivery" : "prepaid",
    `returned-parcel fee paid by the ${r.returnFeePayer === "SELLER" ? "seller" : "supplier"}`,
    r.settleVia === "SPLIT" ? "paid through UnieMax" : "paid directly",
  ].join(" · ");
}

async function load(where: Prisma.SupplierOrderWhereInput, orderBy: Prisma.SupplierOrderOrderByWithRelationInput[], take = 100) {
  const rows = await deps.prisma.supplierOrder.findMany({ where, orderBy, take, include: { lines: true, supplier: true } });
  const views = new Map((await deps.host.getOrderViews([...new Set(rows.map((r) => r.orderId))])).map((v) => [v.id, v]));
  return { rows, views };
}

async function storesById(ids: string[]): Promise<Map<string, StoreRef>> {
  return new Map((await deps.host.getStores([...new Set(ids)])).map((s) => [s.id, s]));
}

// ===========================================================================
// Supplier: Orders to ship
// ===========================================================================

export type SupplierTab = "new" | "shipped" | "done";

const TAB: Record<SupplierTab, { where: Prisma.SupplierOrderWhereInput; orderBy: Prisma.SupplierOrderOrderByWithRelationInput[] }> = {
  new: { where: { status: { in: ["NEW", "ACCEPTED"] } }, orderBy: [{ shipBy: "asc" }, { createdAt: "asc" }] },
  shipped: { where: { status: "SHIPPED" }, orderBy: [{ shippedAt: "desc" }] },
  // A part cancelled before it was ever to ship (unpaid) was never the supplier's business.
  done: {
    where: { status: { in: ["DELIVERED", "REJECTED", "RETURNED", "CANCELLED"] }, shipBy: { not: null } },
    orderBy: [{ updatedAt: "desc" }],
  },
};

function shapeForSupplier(r: Row, view: OrderView | undefined, seller: StoreRef | undefined) {
  const hidden = customerDataHidden(r.closedAt, dropshipConfig.customerDataDays);
  const image = (itemId: string) => mediaUrl("media", view?.items.find((i) => i.id === itemId)?.imageKey ?? null);
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    status: r.status,
    createdAt: r.createdAt,
    shipBy: r.shipBy,
    late: isLate(r),
    paymentMode: r.paymentMode,
    /** COD: what the courier collects (F-14). Null when prepaid. */
    collectAmount: money(r.collectAmount),
    items: r.lines.map((l) => ({
      id: l.id,
      productName: l.productName,
      variantName: l.variantName,
      sku: l.supplierSku,
      quantity: l.quantity,
      imageUrl: image(l.orderItemId),
    })),
    delivery: hidden
      ? null
      : {
          name: view?.customerName ?? null,
          phone: view?.customerPhone ?? null,
          address: view?.addressLine ?? null,
          pincode: view?.pincode ?? null,
          state: view?.state ?? null,
          notes: view?.deliveryNotes ?? [],
        },
    seller: seller ? { name: seller.name, phone: seller.phone } : null,
    parcel: shapeParcel(parcelOf(view, r.shipmentId)),
    closeReason: r.closeReason,
    amounts: { costTotal: money(r.costTotal), shippingFee: money(r.shippingFee), supplierShare: money(r.supplierShare) },
    /** How this supplier is paid: by UnieMax (Easy Split) or directly by the seller (D-16). */
    paidBy: r.settleVia === "SPLIT" ? "UNIEMAX" : "SELLER",
    split: r.settleVia === "SPLIT" ? { state: r.splitState ?? "WAITING", payoutOn: r.splitAt ? payoutDate(r.splitAt, dropshipConfig.vendorHoldDays) : null } : null,
    terms: termsLine(r),
  };
}

export async function supplierInbox(supplierId: string, tab: SupplierTab) {
  const t = TAB[tab];
  const { rows, views } = await load({ supplierId, ...t.where }, t.orderBy);
  const sellers = await storesById(rows.map((r) => r.sellerStoreId));
  const counts = await deps.prisma.supplierOrder.groupBy({
    by: ["status"],
    where: { supplierId, status: { in: ["NEW", "ACCEPTED", "SHIPPED"] } },
    _count: { _all: true },
  });
  const count = (s: DbStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((n, c) => n + c._count._all, 0);
  return {
    items: rows.map((r) => shapeForSupplier(r, views.get(r.orderId), sellers.get(r.sellerStoreId))),
    counts: { new: count(["NEW", "ACCEPTED"]), shipped: count(["SHIPPED"]) },
  };
}

export async function supplierDetail(supplierId: string, id: string) {
  const { rows, views } = await load({ id, supplierId, shipBy: { not: null } }, [], 1);
  const r = rows[0];
  if (!r) throw HttpError.notFound("Order not found");
  const sellers = await storesById([r.sellerStoreId]);
  return shapeForSupplier(r, views.get(r.orderId), sellers.get(r.sellerStoreId));
}

/** Packing slips (F-13): no prices, the COD amount in large print, the return address. */
export async function slips(supplierId: string, ids: string[]) {
  const { rows, views } = await load(
    { supplierId, id: { in: ids }, status: { in: ["NEW", "ACCEPTED", "SHIPPED"] } },
    [{ shipBy: "asc" }],
    200,
  );
  const stores = await storesById([...rows.map((r) => r.sellerStoreId), ...rows.map((r) => r.supplier.storeId)]);
  return rows.map((r) => {
    const view = views.get(r.orderId);
    const seller = stores.get(r.sellerStoreId);
    const supplier = stores.get(r.supplier.storeId);
    return {
      id: r.id,
      orderNumber: r.orderNumber,
      soldBy: { name: seller?.name ?? "", logoUrl: seller?.logoUrl ?? null },
      shippedBy: { name: supplier?.name ?? "", returnAddress: supplier?.address ?? null, phone: supplier?.phone ?? null },
      items: r.lines.map((l) => ({ productName: l.productName, variantName: l.variantName, sku: l.supplierSku, quantity: l.quantity })),
      delivery: {
        name: view?.customerName ?? null,
        phone: view?.customerPhone ?? null,
        address: view?.addressLine ?? null,
        pincode: view?.pincode ?? null,
        state: view?.state ?? null,
        notes: view?.deliveryNotes ?? [],
      },
      paymentMode: r.paymentMode,
      collectAmount: money(r.collectAmount),
    };
  });
}

// ===========================================================================
// Seller: the parts of one order
// ===========================================================================

export async function sellerParts(storeId: string, orderId: string) {
  const { rows, views } = await load({ sellerStoreId: storeId, orderId }, [{ createdAt: "asc" }]);
  const view = views.get(orderId);
  if (!view) throw HttpError.notFound("Order not found");
  const suppliers = await storesById(rows.map((r) => r.supplier.storeId));
  const hasOwnItems = view.items.some((i) => !i.fulfilledBy);
  const lineTotal = (r: Row) =>
    r.lines.reduce((sum, l) => sum.add(view.items.find((i) => i.id === l.orderItemId)?.lineTotal ?? 0), new Prisma.Decimal(0));
  const parts = rows.map((r, i) => {
    const supplier = suppliers.get(r.supplier.storeId);
    const failed = r.status === "REJECTED" || r.status === "RETURNED";
    return {
      id: r.id,
      status: r.status,
      shipBy: r.shipBy,
      late: isLate(r),
      supplier: { name: supplier?.name ?? "Supplier", phone: supplier?.phone ?? null },
      items: r.lines.map((l) => ({ orderItemId: l.orderItemId, productName: l.productName, variantName: l.variantName, quantity: l.quantity })),
      parcel: shapeParcel(parcelOf(view, r.shipmentId)),
      closeReason: r.closeReason,
      // D-38: the delivery charge counts once, on a supplier-only order's first part.
      youEarn: Number(
        orderEarnings({
          linesTotal: lineTotal(r),
          deliveryCharge: !hasOwnItems && i === 0 ? view.shippingCharge : 0,
          supplierShare: r.supplierShare,
          platformFee: r.platformFee,
        }),
      ),
      supplierShare: money(r.supplierShare),
      terms: termsLine(r),
      problem: r.issueOpenAt ? { openedAt: r.issueOpenAt, ticketId: r.issueTicketId, resolvedAt: r.adminResolvedAt } : null,
      /** The in-place "cancel the whole order?" prompt (mixed orders, Rolling up). */
      needsDecision: failed && hasOwnItems && view.status !== "CANCELLED" && !r.adminResolvedAt,
      canMarkDelivered: r.status === "SHIPPED",
      canReportProblem: ["SHIPPED", "DELIVERED", "RETURNED"].includes(r.status) && (!r.issueOpenAt || !!r.adminResolvedAt),
    };
  });
  return { orderStatus: view.status, hasOwnItems, parts };
}

// ===========================================================================
// Admin: Needs action
// ===========================================================================

export type NeedsKind = "late" | "cant_ship" | "came_back" | "problem" | "refund" | "split" | "vendor_balance";

export const NEEDS_KINDS: NeedsKind[] = ["late", "cant_ship", "came_back", "problem", "refund", "split", "vendor_balance"];

/**
 * One list of everything a person has to look at; each item disappears once
 * resolved with a note. Built from bounded candidate queries — the volumes
 * here are small, and a "Refunds to make" item needs the order's payment.
 */
export async function needsAction(kind: NeedsKind | undefined, page: number) {
  const open = { adminResolvedAt: null };
  const now = new Date();
  const candidates: Record<NeedsKind, Prisma.SupplierOrderWhereInput> = {
    late: { ...open, status: { in: ["NEW", "ACCEPTED"] }, shipBy: { lt: now } },
    cant_ship: { ...open, status: "REJECTED", shipBy: { not: null } },
    came_back: { ...open, status: "RETURNED" },
    problem: { ...open, issueOpenAt: { not: null } },
    refund: { ...open, paymentMode: "PREPAID", status: { in: ["REJECTED", "RETURNED", "CANCELLED"] } },
    // Easy Split (Phase 6): a split that keeps failing, and a COD fee the seller's vendor couldn't cover.
    split: { ...open, settleVia: "SPLIT", splitState: "FAILED", paidAt: { not: null } },
    vendor_balance: { ...open, feeAdjustError: { not: null } },
  };
  const kinds = kind ? [kind] : NEEDS_KINDS;
  const { rows, views } = await load({ OR: kinds.map((k) => candidates[k]) }, [{ updatedAt: "desc" }], 500);
  const stores = await storesById([...rows.map((r) => r.sellerStoreId), ...rows.map((r) => r.supplier.storeId)]);
  const vendorAmounts = await vendorAmountsByOrder(
    rows.filter((r) => r.settleVia === "SPLIT" && r.splitState === "DONE").map((r) => r.orderId),
    views,
  );

  const items = rows.flatMap((r) => {
    const view = views.get(r.orderId);
    const hasOwnItems = !!view?.items.some((i) => !i.fulfilledBy);
    const kindsOf: NeedsKind[] = [];
    if (isLate(r, now) && !r.adminResolvedAt) kindsOf.push("late");
    // Can't ship counts when a person must act: a mixed order, or one the
    // system couldn't cancel (something else was already delivered, F-4).
    if (r.status === "REJECTED" && r.shipBy && view?.status !== "CANCELLED" && (hasOwnItems || view)) kindsOf.push("cant_ship");
    if (r.status === "RETURNED") kindsOf.push("came_back");
    if (r.issueOpenAt) kindsOf.push("problem");
    if (r.paymentMode === "PREPAID" && view?.paymentStatus === "REFUNDED") kindsOf.push("refund");
    if (splitWindowClosing(r, dropshipConfig.splitWindowHours, now)) kindsOf.push("split");
    if (r.feeAdjustError) kindsOf.push("vendor_balance");
    return kindsOf
      .filter((k) => !kind || k === kind)
      .map((k) => ({
        key: `${r.id}:${k}`,
        kind: k,
        supplierOrderId: r.id,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        status: r.status,
        seller: stores.get(r.sellerStoreId)?.name ?? "—",
        supplier: stores.get(r.supplier.storeId)?.name ?? "—",
        shipBy: r.shipBy,
        closeReason: r.closeReason,
        ticketId: r.issueTicketId,
        orderTotal: view ? Number(view.total) : null,
        supplierShare: money(r.supplierShare),
        /** Easy Split: what a Split Refund needs, per vendor (PS-8). */
        vendorAmounts: k === "refund" ? (vendorAmounts.get(r.orderId) ?? null) : null,
        splitError: r.splitError,
        splitAttempts: r.splitAttempts,
        feeAdjustError: r.feeAdjustError,
        platformFee: money(r.platformFee),
        createdAt: r.createdAt,
      }));
  });
  const pageSize = 30;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) },
  };
}

// ===========================================================================
// Easy Split (Phase 6): per-vendor amounts and the Payouts list
// ===========================================================================

/**
 * What each payee of a split order got: the figures a Split Refund needs when
 * the order is refunded (PS-8). Supplier shares, then the seller's remainder;
 * the platform fee stays with UnieMax.
 */
async function vendorAmountsByOrder(orderIds: string[], views: Map<string, OrderView>) {
  const out = new Map<string, { entries: { name: string; role: "SUPPLIER" | "SELLER"; amount: number }[]; fee: number }>();
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return out;
  const parts = await deps.prisma.supplierOrder.findMany({
    where: { orderId: { in: ids }, settleVia: "SPLIT" },
    include: { supplier: true },
  });
  const stores = await storesById([...parts.map((p) => p.sellerStoreId), ...parts.map((p) => p.supplier.storeId)]);
  for (const orderId of ids) {
    const mine = parts.filter((p) => p.orderId === orderId);
    const view = views.get(orderId);
    if (!view || mine.length === 0) continue;
    const r = splitAmounts({
      orderTotal: view.total,
      sellerStoreId: mine[0]!.sellerStoreId,
      parts: mine.map((p) => ({ storeId: p.supplier.storeId, supplierShare: p.supplierShare, platformFee: p.platformFee })),
    });
    if (!r.ok) continue;
    out.set(orderId, {
      entries: r.entries.map((e) => ({ name: stores.get(e.storeId)?.name ?? "—", role: e.role, amount: Number(e.amount.toFixed(2)) })),
      fee: Number(r.fee.toFixed(2)),
    });
  }
  return out;
}

/** Admin → Payouts: every order paid (or meant to be paid) by Easy Split, and where each stands. Read-only. */
export async function adminPayouts(page: number) {
  const pageSize = 30;
  const where: Prisma.SupplierOrderWhereInput = { OR: [{ settleVia: "SPLIT" }, { splitState: "FALLBACK_DIRECT" }] };
  const [total, rows] = await Promise.all([
    deps.prisma.supplierOrder.count({ where }),
    deps.prisma.supplierOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplier: true },
    }),
  ]);
  const views = new Map((await deps.host.getOrderViews([...new Set(rows.map((r) => r.orderId))])).map((v) => [v.id, v]));
  const amounts = await vendorAmountsByOrder(rows.filter((r) => r.settleVia === "SPLIT").map((r) => r.orderId), views);
  const stores = await storesById([...rows.map((r) => r.sellerStoreId), ...rows.map((r) => r.supplier.storeId)]);
  return {
    items: rows.map((r) => ({
      supplierOrderId: r.id,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      seller: stores.get(r.sellerStoreId)?.name ?? "—",
      supplier: stores.get(r.supplier.storeId)?.name ?? "—",
      settleVia: r.settleVia,
      state: r.splitState ?? "WAITING",
      ref: r.splitRef,
      attempts: r.splitAttempts,
      error: r.splitError,
      paidAt: r.paidAt,
      splitAt: r.splitAt,
      payoutOn: r.splitAt ? payoutDate(r.splitAt, dropshipConfig.vendorHoldDays) : null,
      orderTotal: views.get(r.orderId) ? Number(views.get(r.orderId)!.total) : null,
      supplierGets: money(r.supplierShare),
      platformFee: money(r.platformFee),
      /** What the seller's vendor gets from the whole order's split. */
      sellerGets: amounts.get(r.orderId)?.entries.find((e) => e.role === "SELLER")?.amount ?? null,
    })),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
