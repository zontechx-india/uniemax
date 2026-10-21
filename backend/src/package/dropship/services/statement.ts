import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { deps } from "../deps.js";
import { balanceWords, lineStateWords, rupee, statementBalance, statementLine, validatePayment } from "../domain.js";
import type { StatementViewer } from "../domain.js";
import type { PaymentInput } from "../schema.js";
import type { StoreRef } from "../types.js";

/**
 * The account of one seller–supplier link: who owes whom, line by line, and
 * the payments either side recorded (docs/dropshipping/money). Computed on
 * read from the supplier orders and the live payments (D-40): both sides call
 * the same `statementLine`, so they always see the same numbers.
 */

/** The most recent orders listed on the account; the balance always counts every one. */
const SHOWN_LINES = 200;

const num = (v: Prisma.Decimal) => Number(v.toFixed(2));
/** The `recordedAs` value for a viewer. */
const actorOf = (viewer: StatementViewer) => (viewer === "seller" ? "SELLER" : "SUPPLIER");

interface Ctx {
  link: { id: string; sellerStoreId: string; supplier: { storeId: string } };
  seller: StoreRef;
  supplier: StoreRef;
  viewer: StatementViewer;
}

/** The link, as seen by the seller (by store) or the supplier (by supplier id). Anyone else gets a 404. */
async function context(viewer: StatementViewer, anchor: string, linkId: string): Promise<Ctx> {
  const link = await deps.prisma.supplierLink.findFirst({
    where: viewer === "seller" ? { id: linkId, sellerStoreId: anchor } : { id: linkId, supplierId: anchor },
    include: { supplier: true },
  });
  if (!link) throw HttpError.notFound(viewer === "seller" ? "Supplier not found" : "Seller not found");
  const stores = await deps.host.getStores([link.sellerStoreId, link.supplier.storeId]);
  const seller = stores.find((s) => s.id === link.sellerStoreId);
  const supplier = stores.find((s) => s.id === link.supplier.storeId);
  if (!seller || !supplier) throw HttpError.notFound("Not found");
  return { link, seller, supplier, viewer };
}

export const sellerContext = (storeId: string, linkId: string) => context("seller", storeId, linkId);
export const supplierContext = (supplierId: string, linkId: string) => context("supplier", supplierId, linkId);

export async function getAccount(ctx: Ctx, customerId: string) {
  const { link, viewer } = ctx;
  const other = viewer === "seller" ? ctx.supplier : ctx.seller;

  // Orders the supplier ever saw: not the ones that never got paid.
  const where = { linkId: link.id, shipBy: { not: null }, status: { notIn: ["AWAITING_PAYMENT", "EXPIRED"] } } satisfies Prisma.SupplierOrderWhereInput;
  // The balance is built from EVERY order (a narrow read); only the list shown is capped.
  const everyOrder = await deps.prisma.supplierOrder.findMany({
    where,
    select: { status: true, statementState: true, paymentMode: true, supplierShare: true, collectAmount: true, shippingFee: true, returnFeePayer: true },
  });
  const orders = await deps.prisma.supplierOrder.findMany({ where, orderBy: { createdAt: "desc" }, take: SHOWN_LINES });
  const views = new Map((await deps.host.getOrderViews([...new Set(orders.map((o) => o.orderId))])).map((v) => [v.id, v]));
  const payments = await deps.prisma.settlement.findMany({
    where: { linkId: link.id, deletedAt: null },
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
  });

  const lines = orders.map((o) => {
    const l = statementLine(o);
    // From the viewer's side: positive = you get, negative = you owe.
    const forYou = viewer === "seller" ? l.amount.neg() : l.amount;
    return {
      supplierOrderId: o.id,
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      date: o.createdAt,
      paymentMode: o.paymentMode,
      status: o.status,
      state: o.statementState,
      stateText: lineStateWords(o.statementState, o.status),
      counts: l.counts,
      customerPaid: views.get(o.orderId) ? num(views.get(o.orderId)!.total) : null,
      supplierGets: num(o.supplierShare),
      forYou: num(forYou),
      // Cash the courier collected (COD) — the supplier holds it until paid over.
      collected: o.paymentMode === "COD" && o.collectAmount ? num(o.collectAmount) : null,
    };
  });

  const balance = statementBalance(everyOrder.map((o) => statementLine(o)), payments);
  // Positive = the seller owes the supplier. For the viewer: positive = they owe you.
  const theyOweYou = viewer === "seller" ? balance.neg() : balance;

  return {
    linkId: link.id,
    viewer,
    other: { name: other.name, phone: other.phone },
    balance: num(theyOweYou),
    words: balanceWords(balance, viewer, other.name),
    lines,
    /** More orders than the list shows — they are all in the balance. */
    moreLines: everyOrder.length > orders.length,
    payments: payments.map((p) => {
      const paidByViewer = (p.direction === "SELLER_TO_SUPPLIER") === (viewer === "seller");
      return {
        id: p.id,
        text: paidByViewer ? `You paid ${other.name}` : `${other.name} paid you`,
        amount: num(p.amount),
        paidOn: p.paidOn,
        reference: p.reference,
        note: p.note,
        recordedByYou: p.recordedAs === actorOf(viewer),
        // Only the person who recorded it can delete it.
        canDelete: p.recordedBy === customerId && p.recordedAs === actorOf(viewer),
        createdAt: p.createdAt,
      };
    }),
  };
}

const accountUrl = (store: StoreRef, side: StatementViewer, linkId: string) =>
  `/mystores/${store.slug}/${side === "seller" ? "suppliers" : "sellers"}/${linkId}/account`;

/** "I paid {name}" or "{name} paid me": either side records what moved outside UnieMax. */
export async function recordPayment(ctx: Ctx, customerId: string, input: PaymentInput) {
  const problem = validatePayment({ amount: input.amount, paidOn: input.paidOn });
  if (problem) throw HttpError.badRequest(problem);
  const { viewer, link } = ctx;
  const sellerPays = (viewer === "seller") === (input.paid === "me");
  await deps.prisma.settlement.create({
    data: {
      linkId: link.id,
      direction: sellerPays ? "SELLER_TO_SUPPLIER" : "SUPPLIER_TO_SELLER",
      amount: input.amount,
      paidOn: input.paidOn,
      reference: input.reference,
      note: input.note,
      recordedBy: customerId,
      recordedAs: actorOf(viewer),
    },
  });

  const mine = viewer === "seller" ? ctx.seller : ctx.supplier;
  const other = viewer === "seller" ? ctx.supplier : ctx.seller;
  const amount = rupee(input.amount);
  deps.host.notify(other.ownerId, {
    title: `${mine.name} recorded a payment`,
    body: input.paid === "me" ? `${mine.name} says they paid you ${amount}.` : `${mine.name} says you paid them ${amount}.`,
    url: accountUrl(other, viewer === "seller" ? "supplier" : "seller", link.id),
  });
  return getAccount(ctx, customerId);
}

/** The recorder deletes their own entry (a mistake or a duplicate, M-7). It is kept for audit and the other side is told. */
export async function deletePayment(ctx: Ctx, customerId: string, paymentId: string) {
  const { viewer, link } = ctx;
  const p = await deps.prisma.settlement.findFirst({ where: { id: paymentId, linkId: link.id, deletedAt: null } });
  if (!p) throw HttpError.notFound("Payment not found");
  if (p.recordedBy !== customerId || p.recordedAs !== actorOf(viewer)) {
    throw HttpError.forbidden("Only the person who recorded a payment can delete it");
  }
  const done = await deps.prisma.settlement.updateMany({ where: { id: p.id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (done.count === 0) throw HttpError.conflict("This payment was just removed — refresh");

  const mine = viewer === "seller" ? ctx.seller : ctx.supplier;
  const other = viewer === "seller" ? ctx.supplier : ctx.seller;
  deps.host.notify(other.ownerId, {
    title: `${mine.name} removed a recorded payment`,
    body: `The ${rupee(p.amount)} payment dated ${p.paidOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} was removed from your account.`,
    url: accountUrl(other, viewer === "seller" ? "supplier" : "seller", link.id),
  });
  return getAccount(ctx, customerId);
}
