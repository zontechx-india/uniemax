import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { afterOrderPaid, gatewayConfigured, reconcilePendingPayment } from "./payments.service.js";
import { expireUnpaidOrder } from "../orders/orders.service.js";
import { retryRefunds } from "./refunds.service.js";

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
/** Most orders one run asks the gateway about — a cap, not a normal load. */
const SWEEP_MAX = 500;
/**
 * A cancelled order is still asked about for this long: a customer who was
 * on the checkout when it closed can pay a little later, and that money
 * must be seen (it is then refunded).
 */
const CANCELLED_WATCH_MS = 3 * 60 * 60_000;
/**
 * The payment window: how long an ONLINE order may sit AWAITING_PAYMENT
 * (holding its stock, the customer free to retry) before it is closed.
 */
export const PAYMENT_WINDOW_MS = 60 * 60_000;

export async function reconcileStrandedPayments(): Promise<number> {
  const now = Date.now();
  const where = {
    paymentMethod: "ONLINE",
    paymentStatus: { in: ["PENDING", "FAILED"] },
    placedAt: { gte: new Date(now - MAX_AGE_MS), lte: new Date(now - MIN_AGE_MS) },
    AND: [
      { OR: [{ cfOrderId: { not: null } }, { paymentIntentId: { not: null } }] },
      {
        OR: [
          { status: { not: "CANCELLED" } },
          { status: "CANCELLED", cancelledAt: { gte: new Date(now - CANCELLED_WATCH_MS) } },
        ],
      },
    ],
  } satisfies Prisma.OrderWhereInput;
  // Page through ALL of them (by id), so a busy day can't leave the older
  // ones unchecked. Sequential on purpose: steady gateway calls, not a burst
  // against the rate limits.
  let checked = 0;
  let after: string | undefined;
  while (checked < SWEEP_MAX) {
    const page = await prisma.order.findMany({
      where,
      orderBy: { id: "asc" },
      take: BATCH,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const { id } of page) await reconcilePendingPayment(id);
    checked += page.length;
    if (page.length < BATCH) break;
    after = page[page.length - 1]!.id;
  }
  return checked;
}

/** A paid order's follow-up is left alone this long — its own request may still be running. */
const FOLLOW_UP_AFTER_MS = 3 * 60_000;

/**
 * Paid gateway orders whose follow-up never finished (the server stopped
 * between "mark paid" and the messages): run it again, so the seller and the
 * customer still hear about the order. `afterOrderPaid` stamps the order
 * when it is done, so each one is picked up here at most until it succeeds.
 */
export async function finishPaidFollowUps(): Promise<number> {
  const now = Date.now();
  const missed = await prisma.order.findMany({
    where: {
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
      paidNotifiedAt: null,
      OR: [{ cfOrderId: { not: null } }, { paymentIntentId: { not: null } }],
      placedAt: { gte: new Date(now - MAX_AGE_MS) },
      updatedAt: { lte: new Date(now - FOLLOW_UP_AFTER_MS) },
    },
    take: BATCH,
    select: { id: true },
  });
  for (const { id } of missed) await afterOrderPaid(id);
  return missed.length;
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
    try {
      const finished = await finishPaidFollowUps();
      if (finished) log.warn({ finished }, "paid orders whose messages were never sent — sent now");
    } catch (err) {
      log.error(err, "paid follow-up step failed");
    }
    try {
      // Refunds not sent yet, or sent and never reported on (refunds.service.ts).
      const refunds = await retryRefunds();
      if (refunds) log.info({ refunds }, "pending refunds checked");
    } catch (err) {
      log.error(err, "refund retry failed");
    }
  };
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  setTimeout(run, 30_000).unref();
  return () => clearInterval(timer);
}
