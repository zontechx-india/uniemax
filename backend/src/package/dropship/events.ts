import type { FastifyBaseLogger } from "fastify";
import { on } from "../events/index.js";
import { dropshipConfig } from "./config.js";
import { deps } from "./deps.js";
import * as reconcile from "./services/reconcile.js";
import * as reminders from "./services/reminders.js";
import * as resale from "./services/resale.js";
import * as supplierOrders from "./services/supplierOrders.js";

const log = (what: string) => (err: unknown) => console.error(`Dropship ${what} failed:`, err);

/**
 * The async subscribers. Every one is idempotent (sync is), so a repeated or
 * late event is harmless, and the hourly job repairs a lost one (S-1, C-13).
 * Our own writes to copies emit no catalog events, so nothing loops.
 */
export function subscribe(): void {
  on("catalog.product.changed", async ({ productId, deleted }) => {
    // The supplier's own product changed → its copies follow.
    await resale.syncForSupplierProduct(productId).catch(log("product sync"));
    // A copy changed in the seller's editor (or was deleted).
    const copy = await deps.prisma.resale.findUnique({ where: { productId }, select: { id: true } });
    if (!copy) return;
    if (deleted) {
      await deps.prisma.resale.delete({ where: { id: copy.id } }).catch(() => {});
    } else {
      await resale.syncResale(copy.id).catch(log("copy sync"));
    }
  });

  on("catalog.variant.changed", async ({ variantId }) => {
    await resale.syncForSupplierVariant(variantId).catch(log("variant sync"));
    // A seller's price edit on a copy: that price is the new base for the
    // margin (the paused note's fix), and the copy may resume (C-1).
    const rv = await deps.prisma.resaleVariant.findUnique({
      where: { variantId },
      include: { resale: { include: { supplyProduct: { include: { variants: true } } } } },
    });
    if (!rv) return;
    const cost = rv.resale.supplyProduct.variants.find((v) => v.variantId === rv.supplyVariantId)?.cost;
    if (cost) await deps.prisma.resaleVariant.update({ where: { id: rv.id }, data: { lastCost: cost } });
    await resale.syncResale(rv.resaleId).catch(log("copy sync"));
  });

  on("catalog.store.changed", async ({ storeId }) => {
    // A supplier store suspended or restored by an admin (C-7).
    const supplier = await deps.prisma.supplier.findUnique({ where: { storeId }, select: { id: true } });
    if (supplier) await resale.syncForSupplier(supplier.id).catch(log("store sync"));
  });

  // A sale in the supplier's own shop moves its stock without a catalog event.
  const stockMoved = async ({ orderId }: { orderId: string }) => {
    const order = await deps.host.getOrderLines(orderId);
    if (!order?.storeId || order.productIds.length === 0) return;
    const supplier = await deps.prisma.supplier.findUnique({ where: { storeId: order.storeId }, select: { id: true } });
    if (!supplier) return;
    for (const productId of order.productIds) {
      await resale.syncForSupplierProduct(productId).catch(log("stock sync"));
    }
  };
  on("order.placed", async (e) => {
    await stockMoved(e);
    await supplierOrders.afterPlaced(e.orderId).catch(log("placed"));
  });
  on("order.cancelled", async (e) => {
    await stockMoved(e);
    await supplierOrders.afterCancelled(e.orderId).catch(log("cancelled"));
  });
  // The customer paid: the supplier's part is now something to ship (K-9 too).
  on("order.paid", ({ orderId }) => supplierOrders.onPaid(orderId).catch(log("paid")));
}

/**
 * Hourly (and 10 s after boot), each step on its own so one failure never
 * stops the rest: expire unpaid supplier orders, send reminders, count shipped
 * lines as owed, reconcile lost events, re-sync every copy.
 */
export function startJobs(logger: FastifyBaseLogger): () => void {
  const run = async () => {
    try {
      const expired = await supplierOrders.expireUnpaid();
      if (expired > 0) logger.info({ orders: expired }, "dropship: unpaid supplier orders expired");
    } catch (err) {
      logger.error({ err }, "dropship: expiring unpaid orders failed");
    }
    try {
      const sent = await reminders.sendReminders();
      if (sent > 0) logger.info({ reminders: sent }, "dropship: reminders sent");
    } catch (err) {
      logger.error({ err }, "dropship: reminders failed");
    }
    try {
      const counted = await reconcile.promoteOwed();
      if (counted > 0) logger.info({ lines: counted }, "dropship: statement lines now count as owed");
    } catch (err) {
      logger.error({ err }, "dropship: statement step failed");
    }
    try {
      const fixed = await reconcile.reconcile();
      if (fixed.paid + fixed.cancelled + fixed.shipped > 0) logger.info(fixed, "dropship: reconciled supplier orders");
    } catch (err) {
      logger.error({ err }, "dropship: reconcile failed");
    }
    try {
      const n = await resale.syncAll();
      if (n > 0) logger.info({ copies: n }, "dropship: copies re-synced");
    } catch (err) {
      logger.error({ err }, "dropship: hourly sync failed");
    }
  };
  const first = setTimeout(run, 10_000);
  const timer = setInterval(run, dropshipConfig.jobIntervalMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
