import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { owedFallbackDue } from "../domain.js";
import * as supplierOrders from "./supplierOrders.js";

/**
 * The hourly job's statement step and its self-healing (docs/dropshipping/
 * architecture → Hourly job, S-1). Every step is idempotent and bounded, so a
 * repeat or a crash halfway is harmless.
 */

/**
 * Lines that should count on the account but don't yet:
 * - shipped long enough ago, never marked delivered, no open problem (F-10);
 * - delivered or came back with the line still pending (a lost event).
 */
export async function promoteOwed(now = new Date()): Promise<number> {
  let n = 0;
  const shipped = await deps.prisma.supplierOrder.findMany({
    where: { status: "SHIPPED", statementState: "PENDING", issueOpenAt: null, shippedAt: { not: null } },
    take: 500,
  });
  for (const o of shipped) {
    if (!owedFallbackDue(o, dropshipConfig.owedFallbackDays, now)) continue;
    const won = await deps.prisma.supplierOrder.updateMany({
      where: { id: o.id, status: "SHIPPED", statementState: "PENDING" },
      data: { statementState: "OWED", owedAt: now },
    });
    if (won.count === 0) continue;
    await deps.prisma.supplierOrderEvent.create({
      data: { supplierOrderId: o.id, from: "SHIPPED", to: "SHIPPED", actor: "SYSTEM", note: "Counted as owed — never marked delivered" },
    });
    n++;
  }
  const stuck = await deps.prisma.supplierOrder.updateMany({
    where: { status: { in: ["DELIVERED", "RETURNED"] }, statementState: "PENDING" },
    data: { statementState: "OWED", owedAt: now },
  });
  return n + stuck.count;
}

/** Orders younger than this are left alone: their own request is probably still finishing. */
const SETTLE_MS = 10 * 60 * 1000;

/**
 * S-1: repair what a lost event left behind.
 * - A paid order whose supplier part still awaits payment (or expired): run the paid step.
 * - A cancelled order whose supplier part is still open: close it and give the stock back.
 */
export async function reconcile(now = new Date()): Promise<{ paid: number; cancelled: number }> {
  const quiet = new Date(now.getTime() - SETTLE_MS);
  const open = await deps.prisma.supplierOrder.findMany({
    where: { status: { in: ["AWAITING_PAYMENT", "EXPIRED", "NEW", "ACCEPTED"] }, updatedAt: { lt: quiet } },
    select: { orderId: true, status: true },
    take: 300,
  });
  if (open.length === 0) return { paid: 0, cancelled: 0 };
  const orderIds = [...new Set(open.map((o) => o.orderId))];
  const views = new Map((await deps.host.getOrderViews(orderIds)).map((v) => [v.id, v]));

  let paid = 0;
  let cancelled = 0;
  for (const orderId of orderIds) {
    const view = views.get(orderId);
    if (!view) continue;
    const statuses = open.filter((o) => o.orderId === orderId).map((o) => o.status);
    if (view.status === "CANCELLED") {
      // A part still open on a cancelled order: the same close the cancel hook does.
      await deps.prisma
        .$transaction((tx) => supplierOrders.cancelling(tx, orderId))
        .then(() => cancelled++, () => undefined); // a parcel on its way refuses it; leave it
    } else if (view.paymentStatus === "PAID" && statuses.some((s) => s === "AWAITING_PAYMENT" || s === "EXPIRED")) {
      await supplierOrders.onPaid(orderId).then(() => paid++, () => undefined);
    }
  }
  return { paid, cancelled };
}
