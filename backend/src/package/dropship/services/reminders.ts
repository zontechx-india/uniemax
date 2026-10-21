import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { confirmDue, deliveredDue, lateDue } from "../domain.js";

/**
 * The hourly job's reminders (docs/dropshipping/orders → F-1, F-2, F-10). Each
 * goes out once: the order carries a timestamp for it (D-41), set in the same
 * guarded write that wins the right to send it, so two workers or a repeated
 * run never send twice. Returns how many were sent.
 */
export async function sendReminders(now = new Date()): Promise<number> {
  let sent = 0;

  // F-1: a new order the supplier hasn't opened. The supplier only.
  const unopened = await deps.prisma.supplierOrder.findMany({
    where: { status: "NEW", confirmRemindedAt: null, shipBy: { not: null } },
    include: { supplier: true },
    take: 200,
  });
  for (const o of unopened) {
    if (!confirmDue(o, dropshipConfig.confirmReminderHours, now)) continue;
    const won = await deps.prisma.supplierOrder.updateMany({
      where: { id: o.id, status: "NEW", confirmRemindedAt: null },
      data: { confirmRemindedAt: now },
    });
    if (won.count === 0) continue;
    const store = await deps.host.getStore(o.supplier.storeId);
    if (!store) continue;
    deps.host.notify(store.ownerId, {
      title: `Order #${o.orderNumber} is waiting for you`,
      body: "Open it and ship it, or confirm it so the seller knows you have it.",
      url: `/mystores/${store.slug}/orders-to-ship`,
    });
    sent++;
  }

  // F-2: past "Ship by" and not shipped. The seller is told once; it also sits on admin's list.
  const overdue = await deps.prisma.supplierOrder.findMany({
    where: { status: { in: ["NEW", "ACCEPTED"] }, shipBy: { lt: now }, lateNotifiedAt: null },
    include: { supplier: true },
    take: 200,
  });
  for (const o of overdue) {
    if (!lateDue(o, now)) continue;
    const won = await deps.prisma.supplierOrder.updateMany({
      where: { id: o.id, status: { in: ["NEW", "ACCEPTED"] }, lateNotifiedAt: null },
      data: { lateNotifiedAt: now },
    });
    if (won.count === 0) continue;
    const [seller, supplier] = await Promise.all([deps.host.getStore(o.sellerStoreId), deps.host.getStore(o.supplier.storeId)]);
    if (!seller) continue;
    deps.host.notify(seller.ownerId, {
      title: `Order #${o.orderNumber} is late`,
      body: `${supplier?.name ?? "The supplier"} hasn't shipped it yet — it was due ${o.shipBy!.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. You can wait, or cancel the order.`,
      url: `/mystores/${seller.slug}/orders/${o.orderId}`,
    });
    sent++;
  }

  // F-10: shipped a while ago and nobody marked it delivered. The supplier only.
  const cutoff = new Date(now.getTime() - dropshipConfig.deliveredReminderDays * 24 * 60 * 60 * 1000);
  const unconfirmed = await deps.prisma.supplierOrder.findMany({
    where: { status: "SHIPPED", deliveredRemindedAt: null, shippedAt: { lte: cutoff } },
    include: { supplier: true },
    take: 200,
  });
  for (const o of unconfirmed) {
    if (!deliveredDue(o, dropshipConfig.deliveredReminderDays, now)) continue;
    const won = await deps.prisma.supplierOrder.updateMany({
      where: { id: o.id, status: "SHIPPED", deliveredRemindedAt: null },
      data: { deliveredRemindedAt: now },
    });
    if (won.count === 0) continue;
    const store = await deps.host.getStore(o.supplier.storeId);
    if (!store) continue;
    deps.host.notify(store.ownerId, {
      title: `Did order #${o.orderNumber} arrive?`,
      body: "If the customer has it, mark it delivered so it counts on your account.",
      url: `/mystores/${store.slug}/orders-to-ship`,
    });
    sent++;
  }
  return sent;
}
