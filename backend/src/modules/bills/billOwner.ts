import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

/**
 * WHOSE order a paid bill becomes (docs/BACKEND_CONTEXT.md → Seller bills).
 *
 * A bill is made FOR a customer — the phone on the bill — but anyone with the
 * link may pay it (a son paying for his mother). The order belongs to the
 * bill's customer, the payer is only recorded ("Paid by"):
 *
 *   1. an account whose VERIFIED phone is the bill's phone owns it;
 *   2. else the payer keeps it when it is the same person (the payer's phone,
 *      or the phone they typed when paying, is the bill's);
 *   3. else it waits with no owner (`customerId` null) and is claimed the
 *      first time someone signs in with that phone (`claimBillOrders`).
 *
 * Kept apart from bills.service so the payments module can use it inside the
 * PAID transaction without an import cycle.
 */

type Db = Prisma.TransactionClient | PrismaClient;

/** The last 10 digits — how Indian numbers are compared (stored as typed). */
export const last10 = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-10);

/** The ways a number may have been saved on an account. */
const variants = (d: string) => [d, `+91${d}`, `91${d}`, `0${d}`, `+91 ${d}`];

/** The account that has proved it owns this phone (OTP), if any. */
export async function verifiedCustomerByPhone(db: Db, phone: string): Promise<{ id: string } | null> {
  const d = last10(phone);
  if (d.length !== 10) return null;
  return db.customer.findFirst({
    where: { phone: { in: variants(d) }, phoneVerifiedAt: { not: null } },
    select: { id: true },
  });
}

/**
 * Move a just-paid BILL order to its rightful owner. Runs inside the PAID
 * transaction (`releaseToSeller`), so the order is never visible under the
 * wrong account. The payer is the order's `customerId` until now.
 */
export async function settleBillOwner(db: Db, orderId: string, billPhone: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, customerPhone: true },
  });
  if (!order) return;
  const payer = order.customerId
    ? await db.customer.findUnique({ where: { id: order.customerId }, select: { id: true, name: true, phone: true, email: true } })
    : null;
  const paidBy = payer ? { paidByName: payer.name ?? payer.email ?? null, paidByPhone: payer.phone } : {};

  const owner = await verifiedCustomerByPhone(db, billPhone);
  if (owner) {
    if (owner.id !== order.customerId) {
      await db.order.update({ where: { id: orderId }, data: { customerId: owner.id, ...paidBy } });
    }
    return;
  }
  const bill = last10(billPhone);
  if (last10(payer?.phone) === bill || last10(order.customerPhone) === bill) return;
  await db.order.update({ where: { id: orderId }, data: { customerId: null, ...paidBy } });
}

/**
 * A customer signed in: bill orders made for their verified phone that no
 * account owned yet become theirs. Safe to run on every sign-in.
 */
export async function claimBillOrders(db: Db, customerId: string): Promise<number> {
  const me = await db.customer.findUnique({ where: { id: customerId }, select: { phone: true, phoneVerifiedAt: true } });
  const d = last10(me?.phone);
  if (!me?.phoneVerifiedAt || d.length !== 10) return 0;
  // Match on the BILL's phone (who it was made for), not the order's contact
  // phone — someone else may have paid and typed theirs.
  const bills = await db.bill.findMany({
    where: { customerPhone: { in: variants(d) }, orderId: { not: null } },
    select: { orderId: true },
  });
  const ids = bills.flatMap((b) => (b.orderId ? [b.orderId] : []));
  if (ids.length === 0) return 0;
  const claimed = await db.order.updateMany({
    where: { id: { in: ids }, source: "BILL", customerId: null },
    data: { customerId },
  });
  return claimed.count;
}
