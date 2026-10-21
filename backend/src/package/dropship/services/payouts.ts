import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { codFeeDue, payoutDate, rupee, splitAmounts, splitDue, splitWindowClosing } from "../domain.js";
import type { SplitPart } from "../domain.js";
import { HostSplitError } from "../types.js";
import type { SplitEntry } from "../types.js";

/**
 * Easy Split payouts (Phase 6, docs/dropshipping/money → Easy Split). The package
 * decides who is paid what and keeps the books; the host's provider (the sandbox
 * today, PaymentHub later — D-44) is the only thing that actually pays.
 *
 * One request per customer order. It waits a couple of minutes after the
 * payment (Cashfree needs that), is retried until it works, and goes on admin's
 * Needs action when the split window is about to close (PS-3). Anything that
 * can't be split is paid directly instead, and both sides are told (PS-2).
 */

const log = (what: string) => (err: unknown) => console.error(`Dropship ${what} failed:`, err);

type Part = Prisma.SupplierOrderGetPayload<{ include: { supplier: true; lines: true } }>;

const OPEN_FOR_SPLIT = ["NEW", "ACCEPTED", "SHIPPED", "DELIVERED"] as const;

/** A part leaves Easy Split for direct payment (T-10): logged, and both sides are told. */
async function fallbackToDirect(p: Part, reason: string, tell: "both" | "none" = "both"): Promise<void> {
  const delivered = p.status === "DELIVERED" || p.status === "RETURNED";
  await deps.prisma.supplierOrder.update({
    where: { id: p.id },
    data: {
      settleVia: "DIRECT",
      splitState: "FALLBACK_DIRECT",
      splitError: reason.slice(0, 200),
      // From here it is an ordinary line between the two: counted once delivered.
      ...(p.statementState === "SPLIT" || p.statementState === "PENDING"
        ? delivered
          ? { statementState: "OWED" as const, owedAt: p.owedAt ?? new Date() }
          : { statementState: "PENDING" as const }
        : {}),
    },
  });
  await deps.prisma.supplierOrderEvent.create({
    data: { supplierOrderId: p.id, from: p.status, to: p.status, actor: "SYSTEM", note: `Paid directly instead of by UnieMax — ${reason}` },
  });
  if (tell === "none") return;
  const [seller, supplier] = await Promise.all([deps.host.getStore(p.sellerStoreId), deps.host.getStore(p.supplier.storeId)]);
  if (seller) {
    deps.host.notify(seller.ownerId, {
      title: `Order #${p.orderNumber}: pay ${supplier?.name ?? "the supplier"} directly`,
      body: `UnieMax couldn't pay ${supplier?.name ?? "the supplier"} for this order (${reason}), so it is on your account with them.`,
      url: `/mystores/${seller.slug}/suppliers/${p.linkId}/account`,
    });
  }
  if (supplier) {
    deps.host.notify(supplier.ownerId, {
      title: `Order #${p.orderNumber}: you'll be paid directly`,
      body: `UnieMax couldn't pay you for this order (${reason}). The seller pays you directly. Add your bank account to be paid by UnieMax next time.`,
      url: `/mystores/${supplier.slug}/sellers/${p.linkId}/account`,
    });
  }
}

const keyOf = (orderId: string, entries: SplitEntry[]) =>
  `split:${orderId}:${createHash("sha1")
    .update(JSON.stringify(entries.map((e) => [e.storeId, e.amount.toFixed(2)]).sort()))
    .digest("hex")
    .slice(0, 10)}`;

/**
 * The split step of the hourly job (and the one-shot timer after payment).
 * Idempotent: a split that is done is never asked for again (PS-7).
 */
export async function runSplits(now = new Date()): Promise<{ done: number; failed: number; direct: number }> {
  const tally = { done: 0, failed: 0, direct: 0 };
  if (!deps.host.splitLive()) return tally;

  const waiting = await deps.prisma.supplierOrder.findMany({
    where: {
      settleVia: "SPLIT",
      splitState: { in: ["REQUESTED", "FAILED"] },
      paidAt: { not: null },
      adminResolvedAt: null,
    },
    select: { orderId: true },
    take: 300,
  });
  const untried = await deps.prisma.supplierOrder.findMany({
    where: { settleVia: "SPLIT", splitState: null, paidAt: { not: null }, adminResolvedAt: null },
    select: { orderId: true },
    take: 300,
  });
  const orderIds = [...new Set([...waiting, ...untried].map((o) => o.orderId))];

  for (const orderId of orderIds) {
    try {
      await splitOrder(orderId, now, tally);
    } catch (err) {
      log("split")(err);
    }
  }
  return tally;
}

async function splitOrder(orderId: string, now: Date, tally: { done: number; failed: number; direct: number }): Promise<void> {
  const all = await deps.prisma.supplierOrder.findMany({ where: { orderId }, include: { supplier: true, lines: true } });
  const waiting = all.filter((p) => splitDue(p, dropshipConfig.splitDelayMinutes, now));
  if (waiting.length === 0) return; // the payment is too fresh, or everything is already settled
  const [view] = await deps.host.getOrderViews([orderId]);

  // PS-4 / PS-10: a cancelled (or unpaid) order is never split; its refund is the core's.
  if (!view || view.status === "CANCELLED" || view.paymentStatus !== "PAID") {
    if (view?.status === "CANCELLED") {
      for (const p of waiting) await fallbackToDirect(p, "the order was cancelled before the split", "none");
    }
    return;
  }

  // A part that was closed before the split (couldn't ship, came back) isn't paid out.
  let parts: Part[] = [];
  for (const p of waiting) {
    if ((OPEN_FOR_SPLIT as readonly string[]).includes(p.status)) parts.push(p);
    else await fallbackToDirect(p, "it was closed before the split", "none");
  }
  if (parts.length === 0) return;

  // Re-check who can be paid out to — an account can fail between placement and now (PS-2).
  const accounts = await deps.host.getPayoutAccounts([...new Set([parts[0]!.sellerStoreId, ...parts.map((p) => p.supplier.storeId)])]);
  if (!accounts.get(parts[0]!.sellerStoreId)?.active) {
    for (const p of parts) await fallbackToDirect(p, "the seller has no active payout account");
    tally.direct += parts.length;
    return;
  }
  const stillSplit: Part[] = [];
  for (const p of parts) {
    if (accounts.get(p.supplier.storeId)?.active) stillSplit.push(p);
    else {
      await fallbackToDirect(p, "the supplier has no active payout account");
      tally.direct++;
    }
  }
  parts = stillSplit;
  if (parts.length === 0) return;

  const amounts = splitAmounts({
    orderTotal: view.total,
    sellerStoreId: parts[0]!.sellerStoreId,
    parts: parts.map<SplitPart>((p) => ({ storeId: p.supplier.storeId, supplierShare: p.supplierShare, platformFee: p.platformFee })),
  });
  if (!amounts.ok) {
    for (const p of parts) await fallbackToDirect(p, amounts.reason);
    tally.direct += parts.length;
    return;
  }

  const entries: SplitEntry[] = amounts.entries;
  try {
    const { ref } = await deps.host.requestSplit(orderId, entries, keyOf(orderId, entries));
    for (const p of parts) {
      await deps.prisma.supplierOrder.update({
        where: { id: p.id },
        data: {
          splitState: "DONE",
          splitRef: ref,
          splitAt: now,
          splitError: null,
          splitAttempts: { increment: 1 },
          // The supplier's share went straight to its vendor: nothing is owed between the two.
          ...(p.status !== "RETURNED" && (p.statementState === "PENDING" || p.statementState === "OWED") ? { statementState: "SPLIT" as const } : {}),
        },
      });
      await deps.prisma.supplierOrderEvent.create({
        data: { supplierOrderId: p.id, from: p.status, to: p.status, actor: "SYSTEM", note: `Paid by UnieMax: ${rupee(p.supplierShare)} to the supplier` },
      });
      tally.done++;
    }
  } catch (err) {
    const message = err instanceof HostSplitError || err instanceof Error ? err.message : String(err);
    for (const p of parts) {
      await deps.prisma.supplierOrder.update({
        where: { id: p.id },
        data: { splitState: "FAILED", splitError: message.slice(0, 200), splitAttempts: { increment: 1 } },
      });
      tally.failed++;
    }
  }
}

/** After a prepaid order is paid: try again once the couple of minutes have passed, without waiting for the hourly job. */
export function scheduleSplit(): void {
  if (!deps.host.splitLive()) return;
  const t = setTimeout(() => void runSplits().catch(log("scheduled split")), dropshipConfig.splitDelayMinutes * 60 * 1000 + 1000);
  t.unref();
}

/**
 * A delivered COD order's platform fee comes out of the seller's vendor balance, once (D-20).
 * A balance too low isn't an error of ours: it is flagged for admin (PS-5) and tried again.
 */
export async function collectCodFees(): Promise<number> {
  if (!deps.host.splitLive()) return 0;
  const due = await deps.prisma.supplierOrder.findMany({
    where: { paymentMode: "COD", status: "DELIVERED", platformFee: { gt: 0 }, feeAdjustedAt: null },
    take: 200,
  });
  let n = 0;
  for (const p of due) {
    if (!codFeeDue(p)) continue;
    const accounts = await deps.host.getPayoutAccounts([p.sellerStoreId]);
    if (!accounts.get(p.sellerStoreId)?.active) continue; // recorded and shown, not collected yet
    try {
      await deps.host.adjustPayout(p.sellerStoreId, "DEBIT", p.platformFee, `fee:${p.id}`);
      await deps.prisma.supplierOrder.update({ where: { id: p.id }, data: { feeAdjustedAt: new Date(), feeAdjustError: null } });
      n++;
    } catch (err) {
      const insufficient = err instanceof HostSplitError && err.code === "INSUFFICIENT";
      await deps.prisma.supplierOrder.update({
        where: { id: p.id },
        data: { feeAdjustError: insufficient ? "INSUFFICIENT" : (err instanceof Error ? err.message : "FAILED").slice(0, 120) },
      });
    }
  }
  return n;
}

/** When a split part's money reaches the supplier's bank: the hold after the split (D-21). */
export const payoutOn = (splitAt: Date | null): Date | null => (splitAt ? payoutDate(splitAt, dropshipConfig.vendorHoldDays) : null);

export { splitWindowClosing };
