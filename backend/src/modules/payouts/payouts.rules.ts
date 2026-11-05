/**
 * Seller payout rules — pure functions only (no Prisma, no Fastify), so they
 * are unit-testable (test/unit/payouts.test.ts). payouts.service.ts and the
 * PaymentHub webhook both decide with these.
 *
 * Money is handled as integer PAISE (bigint) built by string maths, never as
 * floats: "1250.5" → 125050n.
 */

export type PayoutStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "REVERSED"
  | "CANCELLED";
export type PayoutMethod = "MANUAL" | "GATEWAY";

/** Statuses whose amount counts against the order total. */
export const ACTIVE_STATUSES = ["PENDING", "PROCESSING", "SUCCEEDED"] as const satisfies readonly PayoutStatus[];
/** Statuses where money may still be moving — at most one GATEWAY payout here. */
export const IN_FLIGHT_STATUSES = ["PENDING", "PROCESSING"] as const satisfies readonly PayoutStatus[];
/** Moving to one of these needs a written reason. */
export const NEEDS_REASON: readonly PayoutStatus[] = ["FAILED", "REVERSED", "CANCELLED"];

export const isActive = (status: PayoutStatus) => (ACTIVE_STATUSES as readonly string[]).includes(status);

/**
 * Where each status may go next. MANUAL rows are moved by an admin; GATEWAY
 * rows only by PaymentHub (its answer or its webhooks) and never back.
 * CANCELLED ("recorded by mistake") exists for manual rows only — a gateway
 * payout the hub may have received can't be wished away.
 */
const MOVES: Record<PayoutMethod, Record<PayoutStatus, readonly PayoutStatus[]>> = {
  MANUAL: {
    PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
    PROCESSING: ["SUCCEEDED", "FAILED", "CANCELLED"],
    SUCCEEDED: ["REVERSED", "CANCELLED"],
    FAILED: [],
    REVERSED: [],
    CANCELLED: [],
  },
  GATEWAY: {
    PENDING: ["PROCESSING", "SUCCEEDED", "FAILED"],
    PROCESSING: ["SUCCEEDED", "FAILED"],
    SUCCEEDED: ["REVERSED"],
    FAILED: [],
    REVERSED: [],
    CANCELLED: [],
  },
};

export function nextStatuses(method: PayoutMethod, from: PayoutStatus): readonly PayoutStatus[] {
  return MOVES[method][from];
}

export function canMove(method: PayoutMethod, from: PayoutStatus, to: PayoutStatus): boolean {
  return MOVES[method][from].includes(to);
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface PayoutOrderFacts {
  status: string;
  paymentMethod: string;
  paymentStatus: string;
}

/**
 * Why this order can't be paid out yet — empty when it can. Same rule for
 * manual and gateway payouts: the customer paid online, the payment is
 * complete, and the order reached the customer (DELIVERED also covers a
 * picked-up order). Cash on delivery never needs a payout — the seller
 * already holds the cash.
 */
export function payoutBlockers(order: PayoutOrderFacts): string[] {
  if (order.paymentMethod === "COD") {
    return ["Cash on delivery — the seller collected the money from the customer, so there is nothing to pay out."];
  }
  const blockers: string[] = [];
  if (order.paymentMethod !== "ONLINE") blockers.push("Only orders paid online through UnieMax are paid out.");
  if (order.paymentStatus !== "PAID") {
    blockers.push(
      order.paymentStatus === "REFUNDED"
        ? "The customer was refunded."
        : "The customer's payment is not complete.",
    );
  }
  if (order.status === "CANCELLED") blockers.push("The order is cancelled.");
  else if (order.status !== "DELIVERED") blockers.push("Waiting for delivery — pay the seller once the order is delivered.");
  return blockers;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** "1250", "1250.5", "1250.50" → paise. Null for anything else. */
export function amountToPaise(value: string): bigint | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** A Prisma Decimal (or anything with toFixed) → paise. */
export function decimalToPaise(value: { toFixed(digits: number): string }): bigint {
  const paise = amountToPaise(value.toFixed(2));
  if (paise === null) throw new Error(`Not a money amount: ${value.toFixed(2)}`);
  return paise;
}

/** 125050n → "1250.50" — the API's money format. */
export function paiseToAmount(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const abs = paise < 0n ? -paise : paise;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export interface PayoutTotals {
  /** Grand total the customer paid. */
  orderTotal: bigint;
  /** SUCCEEDED — the seller has it. */
  paidOut: bigint;
  /** PENDING + PROCESSING — on its way. */
  inProgress: bigint;
  /** What may still be paid out: total − paid out − in progress (never < 0). */
  remaining: bigint;
}

export function payoutTotals(
  orderTotal: bigint,
  payouts: { status: PayoutStatus; amountPaise: bigint }[],
): PayoutTotals {
  let paidOut = 0n;
  let inProgress = 0n;
  for (const payout of payouts) {
    if (payout.status === "SUCCEEDED") paidOut += payout.amountPaise;
    else if (payout.status === "PENDING" || payout.status === "PROCESSING") inProgress += payout.amountPaise;
  }
  const left = orderTotal - paidOut - inProgress;
  return { orderTotal, paidOut, inProgress, remaining: left > 0n ? left : 0n };
}

// ---------------------------------------------------------------------------
// Dates and masking
// ---------------------------------------------------------------------------

/**
 * The day (and optional time) an admin typed, read as India time (+05:30,
 * no daylight saving). No time → midnight, flagged as "time unknown".
 */
export function indiaDateTime(day: string, time?: string | null): { at: Date; timeKnown: boolean } {
  const at = new Date(`${day}T${time ?? "00:00"}:00+05:30`);
  if (Number.isNaN(at.getTime())) throw new Error(`Not a date: ${day} ${time ?? ""}`);
  return { at, timeKnown: Boolean(time) };
}

/** Last 4 characters of an account number — the only part ever stored. */
export function last4(accountNumber: string): string {
  return accountNumber.replace(/\s+/g, "").slice(-4);
}

/** PaymentHub's payout status → ours. Unknown words map to null (ignored). */
export function hubPayoutStatus(status: string): PayoutStatus | null {
  switch (status.toUpperCase()) {
    case "CREATED":
    case "QUEUED":
    case "PENDING":
      return "PENDING";
    case "INITIATED":
    case "PROCESSING":
      return "PROCESSING";
    case "SUCCEEDED":
    case "SUCCESS":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "REVERSED":
      return "REVERSED";
    default:
      return null;
  }
}
