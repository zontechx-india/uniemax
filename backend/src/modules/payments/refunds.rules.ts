/**
 * Pure refund rules — no Prisma, no network, so they are unit-tested
 * (test/unit/refunds.test.ts). The I/O lives in refunds.service.ts.
 */

/** Hub calls made for one refund before it is given to a person. */
export const MAX_REFUND_ATTEMPTS = 5;

/** Hub intent states that still hold money we can send back. */
const REFUNDABLE = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED"]);

export interface IntentFacts {
  id: string;
  status: string;
}

export type IntentChoice =
  | { kind: "refund"; intentId: string }
  /** The hub already sent everything back — nothing left to ask for. */
  | { kind: "alreadyRefunded"; intentId: string }
  /** No intent of this order holds a payment (yet). */
  | { kind: "none" };

/**
 * Which of an order's intents to refund. `preferredId` is the order's latest
 * intent; a payment can also sit on an older one (paid late, after a retry
 * replaced it), so the others are looked at too.
 */
export function pickIntentToRefund(intents: IntentFacts[], preferredId: string | null): IntentChoice {
  const ordered = [...intents].sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  const paid = ordered.find((i) => REFUNDABLE.has(i.status));
  if (paid) return { kind: "refund", intentId: paid.id };
  const done = ordered.find((i) => i.status === "REFUNDED");
  if (done) return { kind: "alreadyRefunded", intentId: done.id };
  return { kind: "none" };
}

/**
 * A hub refusal that a retry can't fix (wrong state, more than was paid, bad
 * request). Timeouts, 5xx and rate limits are worth another try.
 */
export function isPermanentHubRefusal(hubStatus: number): boolean {
  return hubStatus >= 400 && hubStatus < 500 && hubStatus !== 408 && hubStatus !== 429;
}

/** What a failed hub call does to the refund row. */
export function afterFailedAttempt(
  attemptsSoFar: number,
  permanent: boolean,
): { attempts: number; giveUp: boolean } {
  const attempts = attemptsSoFar + 1;
  return { attempts, giveUp: permanent || attempts >= MAX_REFUND_ATTEMPTS };
}

/** The hub's refund status → ours. Anything unknown stays pending. */
export function refundStatusFromHub(status: string): "PENDING" | "SUCCEEDED" | "FAILED" {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}

/** A refund this large means the whole order was paid back. */
export function coversOrder(refundPaise: bigint, orderTotalPaise: bigint): boolean {
  return refundPaise >= orderTotalPaise;
}
