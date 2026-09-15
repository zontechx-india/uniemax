import type { FastifyBaseLogger } from "fastify";
import { on } from "../events/index.js";
import { affiliateConfig } from "./config.js";
import { deps } from "./deps.js";
import { daysFromNow } from "./domain.js";
import * as commissions from "./services/commissions.js";

/** Subscribes to the order events the commission lifecycle is driven by. */
export function subscribe(): void {
  on("order.placed", ({ orderId }) => commissions.createForOrder(orderId));
  on("order.status", ({ orderId, status }) => {
    if (status === "DELIVERED") return commissions.onDelivered(orderId);
  });
  on("order.cancelled", ({ orderId }) => commissions.onCancelled(orderId));
  // order.paid needs nothing: approval re-checks payment once the hold period ends.
}

/** Hourly: approve matured commissions, prune old click rows. */
export function startJobs(log: FastifyBaseLogger): () => void {
  const run = async () => {
    try {
      const approved = await commissions.approveMatured();
      const pruned = await deps.prisma.affiliateClick.deleteMany({
        where: { createdAt: { lt: daysFromNow(-affiliateConfig.clickRetentionDays) } },
      });
      if (approved || pruned.count) {
        log.info({ approved, pruned: pruned.count }, "affiliate jobs ran");
      }
    } catch (err) {
      log.error(err, "affiliate jobs failed");
    }
  };

  const timer = setInterval(run, affiliateConfig.jobIntervalMs);
  timer.unref();
  setTimeout(run, 10_000).unref();
  return () => clearInterval(timer);
}
