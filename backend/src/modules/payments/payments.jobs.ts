import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { cashfreeConfigured } from "./cashfree.client.js";
import { reconcilePendingPayment } from "./payments.service.js";

/**
 * Stranded-payment sweep — the webhook's safety net.
 *
 * An ONLINE order is marked PAID by Cashfree's webhook, or when its buyer
 * reopens the order page (`reconcilePendingPayment`). If the webhook is lost
 * AND the buyer never comes back, the seller used to see a paid order as
 * unpaid indefinitely. This asks Cashfree about recent unpaid ONLINE orders
 * every few minutes. It only ever SETTLES real payments — it never cancels,
 * voids or releases stock, so a gateway hiccup costs nothing but a retry.
 */
const INTERVAL_MS = 10 * 60_000;
/** Give the webhook (and a buyer mid-checkout) a head start. */
const MIN_AGE_MS = 5 * 60_000;
/** Cashfree sessions expire well before this; older rows are settled or dead. */
const MAX_AGE_MS = 48 * 60 * 60_000;
const BATCH = 50;

export async function reconcileStrandedPayments(): Promise<number> {
  const now = Date.now();
  const stranded = await prisma.order.findMany({
    where: {
      paymentMethod: "ONLINE",
      paymentStatus: { in: ["PENDING", "FAILED"] },
      cfOrderId: { not: null },
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

export function startPaymentJobs(log: FastifyBaseLogger): () => void {
  if (!cashfreeConfigured) return () => undefined;
  const run = async () => {
    try {
      const checked = await reconcileStrandedPayments();
      if (checked) log.info({ checked }, "stranded-payment sweep ran");
    } catch (err) {
      log.error(err, "stranded-payment sweep failed");
    }
  };
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  setTimeout(run, 30_000).unref();
  return () => clearInterval(timer);
}
