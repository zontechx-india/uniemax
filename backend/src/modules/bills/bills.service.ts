import { randomBytes } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
import { publicWebUrl } from "../../package/mail/index.js";
import type { StoreActor } from "../stores/storeActor.js";
import { storeScope } from "../stores/storeActor.js";
import { resolvePayments, resolveShipping } from "../stores/stores.schema.js";
import { visibleProductWhere } from "../stores/publicStore.service.js";
import {
  expireUnpaidOrder,
  newOrderNumber,
  placeBillOrder,
  priceBillLines,
  type BillLine,
} from "../orders/orders.service.js";
import { getOrCreatePaySession } from "../payments/payments.service.js";
import type {
  AdminBillListQuery,
  BillCatalogQuery,
  BillCreateInput,
  BillListQuery,
  BillPayInput,
} from "./bills.schema.js";

/**
 * Seller bills — an order the SELLER fills in from the store's own products,
 * for a customer who ordered by phone or is in the shop.
 *
 *   seller makes it  → Bill (OPEN): prices + delivery fixed, NO stock held, NO order
 *   seller shares it → from their own WhatsApp (wa.me) or a copied link; we
 *                      record the tap (`sharedAt`, `shares`), not the chat
 *   customer opens   → `/b/{token}` — `openedAt` (first time)
 *   customer pays    → signs in (OTP), adds the address → `placeBillOrder`
 *                      (order AWAITING_PAYMENT, stock taken, payment session)
 *                      → webhook → order CONFIRMED + bill PAID (`releaseToSeller`)
 *
 * "Expired" is not stored: an OPEN bill past `expiresAt` reads EXPIRED and
 * refuses payment. Checkout is untouched — a bill reaches orders only through
 * `priceBillLines` (pricing, once) and `placeBillOrder` (payment).
 */

export type BillState = "OPEN" | "PAID" | "CANCELLED" | "EXPIRED";
export type ShareVia = "WHATSAPP" | "COPY" | "SHARE";
export interface BillShare {
  at: string;
  via: ShareVia;
}

const billSelect = {
  id: true,
  number: true,
  token: true,
  storeId: true,
  customerName: true,
  customerPhone: true,
  fulfilment: true,
  items: true,
  subtotal: true,
  shippingCharge: true,
  discountType: true,
  discountValue: true,
  discount: true,
  total: true,
  note: true,
  status: true,
  expiresAt: true,
  sharedAt: true,
  shares: true,
  openedAt: true,
  paidAt: true,
  cancelledAt: true,
  orderId: true,
  createdAt: true,
  store: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.BillSelect;
type BillRow = Prisma.BillGetPayload<{ select: typeof billSelect }>;

/** OPEN past its time reads EXPIRED. */
export function billState(bill: { status: string; expiresAt: Date }, now = Date.now()): BillState {
  if (bill.status === "OPEN" && bill.expiresAt.getTime() <= now) return "EXPIRED";
  return bill.status as BillState;
}

const linesOf = (bill: { items: Prisma.JsonValue }) => bill.items as unknown as BillLine[];
const sharesOf = (bill: { shares: Prisma.JsonValue }) => (bill.shares as unknown as BillShare[] | null) ?? [];
const billLink = (token: string) => (publicWebUrl ? `${publicWebUrl}/b/${token}` : `/b/${token}`);

function shapeLines(bill: BillRow) {
  return linesOf(bill).map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    variantName: line.variantName,
    sku: line.sku,
    productSlug: line.productSlug,
    imageUrl: mediaUrl("media", line.imageKey),
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
  }));
}

const money = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

/** The bill as the seller (and admin) sees it. */
async function shapeForSeller(bill: BillRow) {
  const order = bill.orderId
    ? await prisma.order.findUnique({
        where: { id: bill.orderId },
        select: { id: true, orderNumber: true, status: true, paymentRef: true },
      })
    : null;
  const shares = sharesOf(bill);
  const state = billState(bill);
  return {
    id: bill.id,
    number: bill.number,
    link: billLink(bill.token),
    state,
    stage: bill.openedAt ? "OPENED" : bill.sharedAt ? "SHARED" : "NEW",
    store: bill.store,
    customerName: bill.customerName,
    customerPhone: bill.customerPhone,
    fulfilment: bill.fulfilment,
    items: shapeLines(bill),
    itemCount: linesOf(bill).reduce((s, l) => s + l.quantity, 0),
    subtotal: money(bill.subtotal),
    shippingCharge: money(bill.shippingCharge),
    discountType: bill.discountType,
    discountValue: money(bill.discountValue),
    discount: money(bill.discount),
    total: money(bill.total),
    note: bill.note,
    expiresAt: bill.expiresAt,
    sharedAt: bill.sharedAt,
    shares,
    openedAt: bill.openedAt,
    paidAt: bill.paidAt,
    cancelledAt: bill.cancelledAt,
    createdAt: bill.createdAt,
    order,
  };
}

/** The owner's store, with what bills need. Someone else's store 404s. */
async function myStore(actor: StoreActor, storeRef: string) {
  const store = await prisma.store.findFirst({
    where: { ...storeScope(actor), OR: [{ id: storeRef }, { slug: storeRef }] },
    select: { id: true, name: true, slug: true, isPublished: true, suspendedAt: true, shipping: true, payments: true, ownerId: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  return store;
}

async function myBill(actor: StoreActor, storeRef: string, billId: string) {
  const store = await myStore(actor, storeRef);
  const bill = await prisma.bill.findFirst({ where: { id: billId, storeId: store.id }, select: billSelect });
  if (!bill) throw HttpError.notFound("Bill not found");
  return { store, bill };
}

/** An 8-digit number used by no bill and no order. */
async function freshBillNumber(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const n = newOrderNumber();
    const [bill, order] = await Promise.all([
      prisma.bill.findUnique({ where: { number: n }, select: { id: true } }),
      prisma.order.findUnique({ where: { orderNumber: n }, select: { id: true } }),
    ]);
    if (!bill && !order) return n;
  }
  throw new Error("Could not find a free bill number");
}

// ---------------------------------------------------------------------------
// Seller
// ---------------------------------------------------------------------------

const TAB_WHERE = (tab: BillListQuery["tab"], now: Date): Prisma.BillWhereInput => {
  switch (tab) {
    case "WAITING":
      return { status: "OPEN", expiresAt: { gt: now } };
    case "PAID":
      return { status: "PAID" };
    case "CLOSED":
      return { OR: [{ status: "CANCELLED" }, { status: "OPEN", expiresAt: { lte: now } }] };
    default:
      return {};
  }
};

export async function listBills(actor: StoreActor, storeRef: string, query: BillListQuery) {
  const store = await myStore(actor, storeRef);
  const now = new Date();
  const where = { storeId: store.id, ...TAB_WHERE(query.tab, now) };
  const [rows, total, waiting, counts] = await Promise.all([
    prisma.bill.findMany({
      where,
      select: billSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.bill.count({ where }),
    prisma.bill.aggregate({
      where: { storeId: store.id, status: "OPEN", expiresAt: { gt: now } },
      _count: true,
      _sum: { total: true },
    }),
    Promise.all(
      (["ALL", "WAITING", "PAID", "CLOSED"] as const).map((tab) =>
        prisma.bill.count({ where: { storeId: store.id, ...TAB_WHERE(tab, now) } }),
      ),
    ),
  ]);
  const notShared = await prisma.bill.count({
    where: { storeId: store.id, status: "OPEN", expiresAt: { gt: now }, sharedAt: null },
  });
  return {
    rows: await Promise.all(rows.map(shapeForSeller)),
    meta: buildListMeta(total, query.page, query.pageSize),
    summary: {
      waiting: waiting._count,
      waitingTotal: money(waiting._sum.total ?? new Prisma.Decimal(0)),
      notShared,
      tabs: { ALL: counts[0], WAITING: counts[1], PAID: counts[2], CLOSED: counts[3] },
    },
  };
}

export async function getBill(actor: StoreActor, storeRef: string, billId: string) {
  const { bill } = await myBill(actor, storeRef, billId);
  return shapeForSeller(bill);
}

/**
 * Make a bill. Prices come from the live catalog (once) through checkout's
 * own pricing; the bill keeps them. The store must be live and take online
 * payment, or the customer could not pay it.
 */
export async function createBill(actor: StoreActor, storeRef: string, input: BillCreateInput) {
  const store = await myStore(actor, storeRef);
  if (store.suspendedAt) throw HttpError.conflict("UnieMax has paused your shop — bills cannot be made right now.");
  if (!store.isPublished) throw HttpError.conflict("Publish your shop first — customers pay bills through it.");
  if (!resolvePayments(store.payments).acceptOnlinePayment) {
    throw HttpError.conflict("Online payment is off for your shop. Turn it on in Payments, then make the bill.");
  }

  const shipping = resolveShipping(store.shipping);
  const fulfilment = shipping.mode === "PICKUP" ? "PICKUP" : "DELIVERY";
  let priced: Awaited<ReturnType<typeof priceBillLines>>;
  try {
    priced = await priceBillLines(store.id, input.items, shipping, fulfilment);
  } catch (err) {
    // Checkout's wording talks to a shopper's cart; this is the seller's bill.
    if (err instanceof HttpError && err.statusCode === 409) {
      throw HttpError.conflict(
        err.message
          .replace(/refresh your cart and try again/i, "take it off the bill and add it again")
          .replace(/— refresh your cart/i, "— take it off the bill")
          .replace(/in your order/i, "on this bill"),
      );
    }
    throw err;
  }

  const subtotal = priced.subtotal;
  const shippingCharge =
    fulfilment === "PICKUP"
      ? new Prisma.Decimal(0)
      : input.shippingCharge === null
        ? priced.shippingCharge
        : new Prisma.Decimal(input.shippingCharge).toDecimalPlaces(2);
  const rawDiscount =
    input.discountType === "PERCENT"
      ? subtotal.mul(input.discountValue).div(100).toDecimalPlaces(0)
      : new Prisma.Decimal(input.discountValue).toDecimalPlaces(2);
  if (rawDiscount.gt(subtotal)) {
    throw HttpError.badRequest(`A discount cannot be more than the items (₹${subtotal.toFixed(0)})`);
  }
  const total = subtotal.sub(rawDiscount).add(shippingCharge);
  if (total.lte(0)) throw HttpError.badRequest("The bill total must be more than ₹0");

  const bill = await prisma.bill.create({
    data: {
      number: await freshBillNumber(),
      token: randomBytes(9).toString("base64url"),
      storeId: store.id,
      createdById: actor.kind === "owner" ? actor.customerId : null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      fulfilment,
      items: priced.lines as unknown as Prisma.InputJsonValue,
      subtotal,
      shippingCharge,
      discountType: rawDiscount.gt(0) ? input.discountType : null,
      discountValue: rawDiscount.gt(0) ? new Prisma.Decimal(input.discountValue) : null,
      discount: rawDiscount,
      total,
      note: input.note,
      expiresAt: new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000),
    },
    select: billSelect,
  });
  return shapeForSeller(bill);
}

/** The seller sent or copied the link. Recorded; the chat itself is theirs. */
export async function shareBill(actor: StoreActor, storeRef: string, billId: string, via: ShareVia) {
  const { bill } = await myBill(actor, storeRef, billId);
  const state = billState(bill);
  if (state === "CANCELLED" || state === "EXPIRED") throw HttpError.conflict("This bill is closed — make a new one.");
  const now = new Date();
  const shares = [...sharesOf(bill), { at: now.toISOString(), via }].slice(-50);
  const row = await prisma.bill.update({
    where: { id: bill.id },
    data: { shares: shares as unknown as Prisma.InputJsonValue, sharedAt: bill.sharedAt ?? now },
    select: billSelect,
  });
  return shapeForSeller(row);
}

/**
 * Cancel an open bill. A payment the customer has open right now is closed
 * too (its stock goes back) — a payment that lands anyway is refunded by the
 * same path as any order paid after cancellation.
 */
export async function cancelBill(actor: StoreActor, storeRef: string, billId: string) {
  const { bill } = await myBill(actor, storeRef, billId);
  if (billState(bill) !== "OPEN") throw HttpError.conflict("Only a bill waiting for payment can be cancelled.");
  const updated = await prisma.bill.updateMany({
    where: { id: bill.id, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (updated.count === 0) throw HttpError.conflict("This bill was just paid.");
  const attempts = await prisma.order.findMany({
    where: { billId: bill.id, status: "AWAITING_PAYMENT" },
    select: { id: true },
  });
  for (const attempt of attempts) await expireUnpaidOrder(attempt.id);
  return getBill(actor, storeRef, billId);
}

// ---------------------------------------------------------------------------
// The item picker — paged search over the store's sellable products
// ---------------------------------------------------------------------------

const catalogProductSelect = {
  id: true,
  name: true,
  categoryId: true,
  category: { select: { name: true, parent: { select: { name: true } } } },
  optionTypes: true,
  priceMin: true,
  stockTotal: true,
  media: {
    where: { type: "IMAGE" as const },
    orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: { key: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      name: true,
      optionValues: true,
      price: true,
      stockQuantity: true,
      isDefault: true,
      sku: true,
      media: { select: { key: true } },
    },
  },
} satisfies Prisma.StoreProductSelect;
type CatalogRow = Prisma.StoreProductGetPayload<{ select: typeof catalogProductSelect }>;

function shapeCatalogProduct(p: CatalogRow) {
  const image = p.media[0]?.key ?? null;
  return {
    id: p.id,
    name: p.name,
    category: p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name,
    imageUrl: mediaUrl("media", image),
    optionTypes: (p.optionTypes as { name: string; values: string[] }[] | null) ?? [],
    priceMin: p.priceMin?.toFixed(2) ?? null,
    stock: p.stockTotal,
    variants: p.variants.map((v) => ({
      // The default variant travels as null, like checkout's cart lines.
      id: v.isDefault ? null : v.id,
      name: v.isDefault ? null : v.name,
      optionValues: (v.optionValues as Record<string, string> | null) ?? null,
      price: v.price.toFixed(2),
      stock: v.stockQuantity,
      sku: v.sku,
      imageUrl: mediaUrl("media", v.media?.key ?? image),
    })),
  };
}

/** A category and every category below it (the tree is shallow; walk it). */
async function categoryWithChildren(storeId: string, categoryId: string): Promise<string[]> {
  const all = await prisma.storeCategory.findMany({ where: { storeId }, select: { id: true, parentId: true } });
  const ids = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/**
 * Every word must match the product name, a variant's name (its size /
 * colour) or SKU, or the category. Sellable products only — the same set
 * checkout can price.
 */
export async function billCatalog(actor: StoreActor, storeRef: string, query: BillCatalogQuery) {
  const store = await myStore(actor, storeRef);
  const words = query.q.split(/\s+/).filter(Boolean).slice(0, 6);
  const where: Prisma.StoreProductWhereInput = {
    ...visibleProductWhere(store.id),
    ...(query.categoryId ? { categoryId: { in: await categoryWithChildren(store.id, query.categoryId) } } : {}),
    AND: words.map((w) => ({
      OR: [
        { name: { contains: w, mode: "insensitive" as const } },
        { category: { name: { contains: w, mode: "insensitive" as const } } },
        { variants: { some: { isActive: true, OR: [{ name: { contains: w, mode: "insensitive" as const } }, { sku: { contains: w, mode: "insensitive" as const } }] } } },
      ],
    })),
  };
  const [rows, total] = await Promise.all([
    prisma.storeProduct.findMany({
      where,
      select: catalogProductSelect,
      // In stock first, then newest — what a seller is most likely to bill.
      orderBy: [{ stockTotal: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.storeProduct.count({ where }),
  ]);
  return { rows: rows.map(shapeCatalogProduct), meta: buildListMeta(total, query.page, query.pageSize) };
}

/** Categories with how many sellable products each holds (children included in the parent). */
export async function billCatalogCategories(actor: StoreActor, storeRef: string) {
  const store = await myStore(actor, storeRef);
  const [cats, counts] = await Promise.all([
    prisma.storeCategory.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.storeProduct.groupBy({ by: ["categoryId"], where: visibleProductWhere(store.id), _count: true }),
  ]);
  const own = new Map(counts.map((c) => [c.categoryId, c._count]));
  const total = (id: string): number => (own.get(id) ?? 0) + cats.filter((c) => c.parentId === id).reduce((s, c) => s + total(c.id), 0);
  return cats
    .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, count: total(c.id) }))
    .filter((c) => c.count > 0);
}

/**
 * "Often billed": the variants this store billed or sold most recently, with
 * today's price and stock. Most bills reuse a handful of items.
 */
export async function oftenBilled(actor: StoreActor, storeRef: string) {
  const store = await myStore(actor, storeRef);
  const [bills, items] = await Promise.all([
    prisma.bill.findMany({ where: { storeId: store.id }, select: { items: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.orderItem.findMany({
      where: { order: { storeId: store.id, status: { notIn: ["AWAITING_PAYMENT", "CANCELLED"] } }, productId: { not: null } },
      select: { productId: true, variantId: true },
      orderBy: { order: { placedAt: "desc" } },
      take: 60,
    }),
  ]);
  const seen = new Map<string, { productId: string; variantId: string | null }>();
  for (const ref of [...bills.flatMap((b) => linesOf(b)), ...items]) {
    if (!ref.productId) continue;
    const key = `${ref.productId}:${ref.variantId ?? ""}`;
    if (!seen.has(key)) seen.set(key, { productId: ref.productId, variantId: ref.variantId ?? null });
    if (seen.size >= 8) break;
  }
  if (seen.size === 0) return [];
  const products = await prisma.storeProduct.findMany({
    where: { ...visibleProductWhere(store.id), id: { in: [...new Set([...seen.values()].map((r) => r.productId))] } },
    select: catalogProductSelect,
  });
  const byId = new Map(products.map((p) => [p.id, shapeCatalogProduct(p)]));
  return [...seen.values()]
    .map(({ productId, variantId }) => {
      const product = byId.get(productId);
      const variant = product?.variants.find((v) => v.id === variantId);
      return product && variant ? { product, variant } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6);
}

// ---------------------------------------------------------------------------
// Public — the customer's bill page
// ---------------------------------------------------------------------------

async function billByToken(token: string) {
  const bill = await prisma.bill.findUnique({ where: { token }, select: billSelect });
  if (!bill) throw HttpError.notFound("This bill does not exist");
  return bill;
}

/** "+91 98400 •••23" — the link may be forwarded; the full number is not needed to pay. */
const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} •••${d.slice(8)}` : phone;
};

/** What the customer sees. Opening it the first time marks the bill opened. */
export async function getPublicBill(token: string, viewerCustomerId: string | null) {
  const bill = await billByToken(token);
  if (!bill.openedAt && billState(bill) === "OPEN") {
    await prisma.bill.updateMany({ where: { id: bill.id, openedAt: null }, data: { openedAt: new Date() } });
  }
  // The paid order is shown only to the account that paid it.
  const order = bill.orderId
    ? await prisma.order.findUnique({ where: { id: bill.orderId }, select: { id: true, orderNumber: true, customerId: true } })
    : null;
  return {
    number: bill.number,
    state: billState(bill),
    store: { name: bill.store.name, slug: bill.store.slug },
    customerName: bill.customerName,
    customerPhone: maskPhone(bill.customerPhone),
    fulfilment: bill.fulfilment,
    items: shapeLines(bill).map(({ productId: _p, productSlug: _s, ...line }) => line),
    subtotal: money(bill.subtotal),
    shippingCharge: money(bill.shippingCharge),
    discount: money(bill.discount),
    total: money(bill.total),
    note: bill.note,
    expiresAt: bill.expiresAt,
    createdAt: bill.createdAt,
    paidAt: bill.paidAt,
    order: order && viewerCustomerId && order.customerId === viewerCustomerId ? { id: order.id, orderNumber: order.orderNumber } : null,
  };
}

/**
 * Pay a bill: re-uses the customer's own payment still in progress for it,
 * otherwise places the bill's order and opens a payment session. One live
 * attempt per bill — a second account paying at the same moment waits.
 */
export async function payBill(token: string, customerId: string, input: BillPayInput) {
  const bill = await billByToken(token);
  const state = billState(bill);
  if (state === "PAID") throw HttpError.conflict("This bill is already paid.");
  if (state === "EXPIRED") throw HttpError.conflict("This bill has expired. Ask the shop for a new one.");
  if (state === "CANCELLED") throw HttpError.conflict("The shop cancelled this bill.");

  const store = await prisma.store.findFirst({
    where: { id: bill.storeId, isPublished: true, suspendedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!store) throw HttpError.conflict("This shop is not taking payments right now.");

  const delivery = bill.fulfilment === "DELIVERY";
  if (delivery) {
    if (input.address.length < 10) throw HttpError.badRequest("Enter your house, street and area");
    if (!input.pincode) throw HttpError.badRequest("Enter your 6-digit PIN code");
    if (!input.state) throw HttpError.badRequest("Choose your state");
  }

  const live = await prisma.order.findFirst({
    where: { billId: bill.id, status: "AWAITING_PAYMENT" },
    select: { id: true, customerId: true, storeSlug: true, orderNumber: true },
  });
  if (live && live.customerId !== customerId) {
    throw HttpError.conflict("Someone is paying this bill right now. Try again in a few minutes.");
  }
  if (live) {
    const session = await getOrCreatePaySession(live.storeSlug, live.id, customerId);
    return {
      orderId: live.id,
      orderNumber: live.orderNumber,
      storeSlug: live.storeSlug,
      paid: session.paymentStatus === "PAID",
      payment: session.paymentStatus === "PENDING" ? session.payment : null,
    };
  }

  return placeBillOrder(
    {
      id: bill.id,
      number: bill.number,
      fulfilment: bill.fulfilment,
      lines: linesOf(bill),
      subtotal: bill.subtotal,
      shippingCharge: bill.shippingCharge,
      discount: bill.discount,
      total: bill.total,
      store,
    },
    customerId,
    {
      name: input.name,
      phone: input.phone,
      email: null,
      address: delivery ? input.address : null,
      pincode: delivery ? input.pincode : null,
      state: delivery ? input.state : null,
      country: delivery ? "India" : null,
    },
  );
}

// ---------------------------------------------------------------------------
// Admin — read-only
// ---------------------------------------------------------------------------

export async function adminListBills(query: AdminBillListQuery) {
  const now = new Date();
  const stateWhere: Prisma.BillWhereInput =
    query.state === "OPEN"
      ? { status: "OPEN", expiresAt: { gt: now } }
      : query.state === "EXPIRED"
        ? { status: "OPEN", expiresAt: { lte: now } }
        : query.state
          ? { status: query.state }
          : {};
  const q = query.q.replace(/^#/, "");
  const where: Prisma.BillWhereInput = {
    ...stateWhere,
    ...(query.storeId ? { storeId: query.storeId } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q.replace(/\s/g, "") } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q.replace(/\D/g, "") || q } },
          ],
        }
      : {}),
  };
  const [rows, total, summary] = await Promise.all([
    prisma.bill.findMany({
      where,
      select: billSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.bill.count({ where }),
    Promise.all([
      prisma.bill.aggregate({ where: { status: "OPEN", expiresAt: { gt: now } }, _count: true, _sum: { total: true } }),
      prisma.bill.aggregate({ where: { status: "PAID" }, _count: true, _sum: { total: true } }),
      prisma.bill.count({ where: { OR: [{ status: "CANCELLED" }, { status: "OPEN", expiresAt: { lte: now } }] } }),
    ]),
  ]);
  return {
    rows: await Promise.all(rows.map(shapeForSeller)),
    meta: buildListMeta(total, query.page, query.pageSize),
    summary: {
      open: summary[0]._count,
      openTotal: money(summary[0]._sum.total ?? new Prisma.Decimal(0)),
      paid: summary[1]._count,
      paidTotal: money(summary[1]._sum.total ?? new Prisma.Decimal(0)),
      closed: summary[2],
    },
  };
}

export async function adminGetBill(billId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: billSelect });
  if (!bill) throw HttpError.notFound("Bill not found");
  return shapeForSeller(bill);
}
