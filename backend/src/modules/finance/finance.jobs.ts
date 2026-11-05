import type { FastifyBaseLogger } from "fastify";
import { on } from "../../package/events/index.js";
import { postDeliveredOrder, sweep } from "./finance.service.js";

/**
 * Keeps the seller ledger in step with orders and payouts.
 *
 *   - `order.status` DELIVERED → post that order right away;
 *   - every 15 minutes (and 45 s after boot) a sweep posts any delivered
 *     order or payout the event missed — which is also how orders and
 *     payouts from before this feature are backfilled.
 *
 * Every posting is idempotent, so the event and the sweep never double up.
 */
const INTERVAL_MS = 15 * 60_000;

export function startFinance(log: FastifyBaseLogger): () => void {
  on("order.status", async ({ orderId, status }) => {
    if (status !== "DELIVERED") return;
    try {
      await postDeliveredOrder(orderId);
    } catch (err) {
      // The sweep retries it.
      log.error({ err, orderId }, "finance: posting a delivered order failed");
    }
  });

  const run = async () => {
    try {
      const done = await sweep(log);
      if (done.orders || done.payouts) log.info(done, "finance sweep ran");
    } catch (err) {
      log.error(err, "finance sweep failed");
    }
  };
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  setTimeout(run, 45_000).unref();
  return () => clearInterval(timer);
}
