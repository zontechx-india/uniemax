import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { gatewayConfigured, reconcilePendingPayment } from "./payments.service.js";
import { expireUnpaidOrder } from "../orders/orders.service.js";

/**
 * Stranded-payment sweep — the webhook's safety net.
 *
 * An ONLINE order is marked PAID by Cashfree's webhook, or when its buyer
 * reopens the order page (`reconcilePendingPayment`). If the webhook is lost
 * AND the buyer never comes back, the seller used to see a paid order as
 * unpaid indefinitely. Every few minutes this asks the provider (Cashfree or
 * PaymentHub) about recent unpaid ONLINE orders.
 * It only ever SETTLES real payments — it never cancels,
 * voids or releases stock, so a gateway hiccup costs nothing but a retry.
 */
const INTERVAL_MS = 10 * 60_000;
/** Give the webhook (and a buyer mid-checkout) a head start. */
const MIN_AGE_MS = 5 * 60_000;
/** Cashfree sessions expire well before this; older rows are settled or dead. */
const MAX_AGE_MS = 48 * 60 * 60_000;
const BATCH = 50;
/**
 * The payment window: how long an ONLINE order may sit AWAITING_PAYMENT
 * (holding its stock, the customer free to retry) before it is closed.
 */
export const PAYMENT_WINDOW_MS = 60 * 60_000;

export async function reconcileStrandedPayments(): Promise<number> {
  const now = Date.now();
  const stranded = await prisma.order.findMany({
    where: {
      paymentMethod: "ONLINE",
      paymentStatus: { in: ["PENDING", "FAILED"] },
      OR: [{ cfOrderId: { not: null } }, { paymentIntentId: { not: null } }],
      status: { not: "CANCELLED" },
      placedAt: { gte: new Date(now - MAX_AGE_MS), lte: new Date(now - MIN_AGE_MS) },
    },
    orderBy: { placedAt: "desc" },
    take: BATCH,
    select: { id: true },
  });
  // Sequential on purpose: a handful of gateway calls every ten minutes, not
  // a burst against Cashfree's rate limits.
  for (const { id } of stranded) await reconcilePendingPayment(id);
  return stranded.length;
}

/**
 * Close ONLINE orders still unpaid after the payment window: one last look
 * at the gateway (a payment that landed is settled, never cancelled), then
 * cancel — stock back on sale, checkout closed, no message to anyone. The
 * seller never saw these orders, so nothing changes for them.
 */
export async function expireUnpaidOrders(): Promise<number> {
  const due = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      placedAt: { lte: new Date(Date.now() - PAYMENT_WINDOW_MS) },
    },
    orderBy: { placedAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  let closed = 0;
  for (const { id } of due) {
    await reconcilePendingPayment(id);
    if (await expireUnpaidOrder(id)) closed++;
  }
  return closed;
}

export function startPaymentJobs(log: FastifyBaseLogger): () => void {
  const run = async () => {
    if (gatewayConfigured) {
      try {
        const checked = await reconcileStrandedPayments();
        if (checked) log.info({ checked }, "stranded-payment sweep ran");
      } catch (err) {
        log.error(err, "stranded-payment sweep failed");
      }
    }
    try {
      const closed = await expireUnpaidOrders();
      if (closed) log.info({ closed }, "unpaid orders closed after the payment window");
    } catch (err) {
      log.error(err, "closing unpaid orders failed");
    }
  };
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  setTimeout(run, 30_000).unref();
  return () => clearInterval(timer);
}
