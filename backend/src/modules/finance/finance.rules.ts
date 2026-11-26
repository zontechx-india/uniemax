/**
 * Seller finance — pure rules (no Prisma, no Fastify), unit-tested in
 * test/unit/finance.test.ts. Money is integer PAISE (bigint); a percent is
 * integer BASIS POINTS (1% = 100 bp) so no float ever touches money.
 */
import { amountToPaise, paiseToAmount, payoutTotals, type PayoutTotals } from "../payouts/payouts.rules.js";

export { amountToPaise, paiseToAmount };

export type FeeKind = "PLATFORM" | "GATEWAY";
export type FeeScope = "GLOBAL" | "STORE" | "CATEGORY";
export type FeeBearer = "SELLER" | "PLATFORM";
/** ONLINE = paid through UnieMax; COD = cash to the courier / at pickup;
 *  OFFLINE = paid to the seller directly on a seller's bill (modules/bills). */
export type Method = "ONLINE" | "COD" | "OFFLINE";

/** The seller already holds the customer's money (COD, OFFLINE): nothing to
 *  pay out, the platform fee is the seller's dues (OWED). */
export const sellerHoldsMoney = (method: string): boolean => method === "COD" || method === "OFFLINE";

export interface RuleLike {
  id: string;
  kind: FeeKind;
  scope: FeeScope;
  storeId: string | null;
  categoryId: string | null;
  paymentMethod: string | null;
  /** "2.50" */
  percent: { toFixed(digits: number): string } | string;
  bearer: FeeBearer;
  effectiveFrom: Date;
  retiredAt: Date | null;
}

/** "2.5" / "2.50" → 250 bp. Null when not a 0–100 percent with ≤ 2 decimals. */
export function percentToBp(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= 10_000 ? bp : null;
}

export function bpToPercent(bp: number): string {
  return `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, "0")}`;
}

const ruleBp = (rule: RuleLike) => {
  const text = typeof rule.percent === "string" ? rule.percent : rule.percent.toFixed(2);
  const bp = percentToBp(text);
  if (bp === null) throw new Error(`Bad fee percent on rule ${rule.id}: ${text}`);
  return bp;
};

/** How specific a rule is — the most specific match wins. */
function specificity(rule: RuleLike): number {
  const scope = rule.scope === "STORE" ? 300 : rule.scope === "CATEGORY" ? 200 : 100;
  return scope + (rule.paymentMethod ? 10 : 0);
}

export interface FeeContext {
  storeId: string | null;
  categoryId: string | null;
  method: Method;
  /** The rule in force at this moment (an order's placement time). */
  at: Date;
}

/**
 * The rule that applies: same kind, in force at `ctx.at`, matching the
 * store / category / payment method when it names one. Most specific wins;
 * among equals, the latest `effectiveFrom`. Null = no rule (fee 0).
 */
export function resolveRule<R extends RuleLike>(rules: R[], kind: FeeKind, ctx: FeeContext): R | null {
  let best: R | null = null;
  for (const rule of rules) {
    if (rule.kind !== kind) continue;
    if (rule.effectiveFrom > ctx.at) continue;
    if (rule.retiredAt && rule.retiredAt <= ctx.at) continue;
    if (rule.scope === "STORE" && rule.storeId !== ctx.storeId) continue;
    if (rule.scope === "CATEGORY" && (!ctx.categoryId || rule.categoryId !== ctx.categoryId)) continue;
    if (rule.paymentMethod && rule.paymentMethod !== ctx.method) continue;
    if (
      !best ||
      specificity(rule) > specificity(best) ||
      (specificity(rule) === specificity(best) && rule.effectiveFrom > best.effectiveFrom)
    ) {
      best = rule;
    }
  }
  return best;
}

/** `base` × `bp`, rounded half up to the paisa. */
export function feeOn(base: bigint, bp: number): bigint {
  return (base * BigInt(bp) + 5_000n) / 10_000n;
}

export interface OrderLineInput {
  orderItemId: string;
  /** lineTotal — product price × quantity. */
  lineTotalPaise: bigint;
  categoryId: string | null;
}

export interface OrderFinancialsInput {
  storeId: string | null;
  method: Method;
  placedAt: Date;
  totalPaise: bigint;
  shippingPaise: bigint;
  lines: OrderLineInput[];
}

export interface ComputedFinancials {
  itemsPaise: bigint;
  platformFeePaise: bigint;
  /** Same rate on every line → that rate; else null. */
  platformFeeBp: number | null;
  gatewayFeePaise: bigint;
  gatewayFeeBp: number;
  gatewayFeeBearer: FeeBearer;
  gatewayFeeRuleId: string | null;
  sellerEarningPaise: bigint;
  lines: { orderItemId: string; base: string; percent: string; fee: string; ruleId: string | null }[];
}

/**
 * An order's fee breakdown. Platform fee: per line, on the product price
 * only (never shipping). Gateway fee: online only, on what the customer
 * paid. Seller earning = total − platform fee − gateway fee if the SELLER
 * bears it (UnieMax bears it today).
 */
export function computeFinancials(input: OrderFinancialsInput, rules: RuleLike[]): ComputedFinancials {
  let itemsPaise = 0n;
  let platformFeePaise = 0n;
  const rates = new Set<number>();
  const lines = input.lines.map((line) => {
    const rule = resolveRule(rules, "PLATFORM", {
      storeId: input.storeId,
      categoryId: line.categoryId,
      method: input.method,
      at: input.placedAt,
    });
    const bp = rule ? ruleBp(rule) : 0;
    const fee = feeOn(line.lineTotalPaise, bp);
    itemsPaise += line.lineTotalPaise;
    platformFeePaise += fee;
    rates.add(bp);
    return {
      orderItemId: line.orderItemId,
      base: paiseToAmount(line.lineTotalPaise),
      percent: bpToPercent(bp),
      fee: paiseToAmount(fee),
      ruleId: rule?.id ?? null,
    };
  });

  const gatewayRule = resolveRule(rules, "GATEWAY", {
    storeId: input.storeId,
    categoryId: null,
    method: input.method,
    at: input.placedAt,
  });
  const gatewayFeeBp = input.method === "ONLINE" && gatewayRule ? ruleBp(gatewayRule) : 0;
  const gatewayFeePaise = feeOn(input.totalPaise, gatewayFeeBp);
  const gatewayFeeBearer: FeeBearer = gatewayRule?.bearer ?? "PLATFORM";

  const sellerEarningPaise =
    input.totalPaise - platformFeePaise - (gatewayFeeBearer === "SELLER" ? gatewayFeePaise : 0n);

  return {
    itemsPaise,
    platformFeePaise,
    platformFeeBp: rates.size <= 1 ? ([...rates][0] ?? 0) : null,
    gatewayFeePaise,
    gatewayFeeBp,
    gatewayFeeBearer,
    gatewayFeeRuleId: input.method === "ONLINE" ? (gatewayRule?.id ?? null) : null,
    sellerEarningPaise,
    lines,
  };
}

// ---------------------------------------------------------------------------
// Ledger legs
// ---------------------------------------------------------------------------

export type Bucket = "PAYABLE" | "IN_PAYOUT" | "OWED" | "ADVANCE";
export type EntryType =
  | "ORDER_SALE"
  | "PLATFORM_FEE"
  | "GATEWAY_FEE"
  | "COD_PLATFORM_FEE"
  | "DUES_SETTLED"
  | "DUES_RESTORED"
  | "PAYOUT_RESERVED"
  | "PAYOUT_PAID"
  | "PAYOUT_RELEASED"
  | "PAYOUT_RETURNED"
  | "ADJUSTMENT"
  | "ADVANCE_PAID"
  | "ADVANCE_SETTLED"
  | "ADVANCE_TO_DUES";

/** One movement to post. `amount` is signed paise: + grows the bucket. */
export interface Leg {
  bucket: Bucket;
  type: EntryType;
  amount: bigint;
  key: string;
  description: string;
  orderId?: string | null;
  payoutId?: string | null;
}

/**
 * What a delivered order posts. Online (paid): the sale and the fees into
 * PAYABLE. COD / OFFLINE: the platform fee into OWED (the seller holds the money).
 * Zero-amount legs are dropped.
 */
export function orderLegs(
  order: { id: string; orderNumber: string; method: Method },
  fin: { totalPaise: bigint; platformFeePaise: bigint; gatewayFeePaise: bigint; gatewayFeeBearer: FeeBearer },
): Leg[] {
  const base = { orderId: order.id };
  const legs: Leg[] =
    order.method === "ONLINE"
      ? [
          {
            ...base,
            bucket: "PAYABLE",
            type: "ORDER_SALE",
            amount: fin.totalPaise,
            key: `order:${order.id}:sale`,
            description: `Online order ${order.orderNumber} delivered`,
          },
          {
            ...base,
            bucket: "PAYABLE",
            type: "PLATFORM_FEE",
            amount: -fin.platformFeePaise,
            key: `order:${order.id}:platform-fee`,
            description: `Platform fee — order ${order.orderNumber}`,
          },
          ...(fin.gatewayFeeBearer === "SELLER"
            ? [
                {
                  ...base,
                  bucket: "PAYABLE" as const,
                  type: "GATEWAY_FEE" as const,
                  amount: -fin.gatewayFeePaise,
                  key: `order:${order.id}:gateway-fee`,
                  description: `Payment gateway fee — order ${order.orderNumber}`,
                },
              ]
            : []),
        ]
      : [
          {
            ...base,
            bucket: "OWED",
            type: "COD_PLATFORM_FEE",
            amount: fin.platformFeePaise,
            key: `order:${order.id}:cod-fee`,
            description:
              order.method === "OFFLINE"
                ? `Platform fee on order ${order.orderNumber} paid to you directly`
                : `Platform fee on cash order ${order.orderNumber}`,
          },
        ];
  return legs.filter((leg) => leg.amount !== 0n);
}

export interface PayoutForLedger {
  id: string;
  orderId: string;
  orderNumber: string;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REVERSED" | "CANCELLED";
  amountPaise: bigint;
  duesPaise: bigint;
  /** It reached SUCCEEDED at some point (from its history). */
  wasPaid: boolean;
  /** Paid before the order was delivered (§9 of the finance README). */
  isAdvance?: boolean;
  /** Advance only — how it was cleared (`nextAdvanceOutcome`); null = not yet. */
  advanceOutcome?: AdvanceOutcome | null;
}

export type AdvanceOutcome = "SETTLED" | "DUES";

const UNDONE: readonly PayoutForLedger["status"][] = ["FAILED", "REVERSED", "CANCELLED"];

/**
 * How an advance payout is cleared — decided once, then kept:
 *   the order was delivered (its sale is on the ledger) → SETTLED
 *   the order ended without delivery (cancelled / refunded) → DUES
 *   still open, or the payout was undone before either → null
 * An advance undone before its order ended is never cleared: undoing it
 * already took it out of the ADVANCE balance.
 */
export function nextAdvanceOutcome(
  current: AdvanceOutcome | null,
  status: PayoutForLedger["status"],
  order: { posted: boolean; ended: boolean },
): AdvanceOutcome | null {
  if (current) return current;
  if (UNDONE.includes(status)) return null;
  if (order.posted) return "SETTLED";
  if (order.ended) return "DUES";
  return null;
}

/**
 * Every leg a payout should have posted for its CURRENT state. Posting is
 * by idempotency key, so calling this after each change (or from the sweep)
 * only ever adds what is missing:
 *   created           → dues settled (if any) + amount reserved
 *   reached SUCCEEDED → paid out of IN_PAYOUT
 *   failed / reversed / cancelled → money back to PAYABLE, dues restored
 */
export function payoutLegs(p: PayoutForLedger): Leg[] {
  if (p.isAdvance) return advanceLegs(p);
  const ref = { orderId: p.orderId, payoutId: p.id };
  const k = (suffix: string) => `payout:${p.id}:${suffix}`;
  const legs: Leg[] = [];
  const dues = (sign: 1n | -1n, type: EntryType, suffix: string, text: string) => {
    legs.push(
      { ...ref, bucket: "PAYABLE", type, amount: sign * -p.duesPaise, key: k(`${suffix}:payable`), description: text },
      { ...ref, bucket: "OWED", type, amount: sign * -p.duesPaise, key: k(`${suffix}:owed`), description: text },
    );
  };

  dues(1n, "DUES_SETTLED", "dues", `COD dues taken from the payout for order ${p.orderNumber}`);
  legs.push(
    { ...ref, bucket: "PAYABLE", type: "PAYOUT_RESERVED", amount: -p.amountPaise, key: k("reserve:payable"), description: `Payout for order ${p.orderNumber}` },
    { ...ref, bucket: "IN_PAYOUT", type: "PAYOUT_RESERVED", amount: p.amountPaise, key: k("reserve:in-payout"), description: `Payout for order ${p.orderNumber}` },
  );

  const paid = p.wasPaid || p.status === "SUCCEEDED" || p.status === "REVERSED";
  if (paid) {
    legs.push({ ...ref, bucket: "IN_PAYOUT", type: "PAYOUT_PAID", amount: -p.amountPaise, key: k("paid"), description: `Paid to the seller — order ${p.orderNumber}` });
  }

  if (p.status === "FAILED" || p.status === "REVERSED" || p.status === "CANCELLED") {
    if (paid) {
      legs.push({ ...ref, bucket: "PAYABLE", type: "PAYOUT_RETURNED", amount: p.amountPaise, key: k("returned"), description: `Payout came back / was cancelled — order ${p.orderNumber}` });
    } else {
      legs.push(
        { ...ref, bucket: "IN_PAYOUT", type: "PAYOUT_RELEASED", amount: -p.amountPaise, key: k("released:in-payout"), description: `Payout did not go out — order ${p.orderNumber}` },
        { ...ref, bucket: "PAYABLE", type: "PAYOUT_RELEASED", amount: p.amountPaise, key: k("released:payable"), description: `Payout did not go out — order ${p.orderNumber}` },
      );
    }
    dues(-1n, "DUES_RESTORED", "dues-restored", `COD dues put back — payout for order ${p.orderNumber} undone`);
  }

  return legs.filter((leg) => leg.amount !== 0n);
}

/**
 * The legs of an ADVANCE payout (paid before delivery) for its current
 * state. Same idea as `payoutLegs`: only ever grows, posted by key.
 *
 *   recorded          → ADVANCE +amount, IN_PAYOUT +amount  (ADVANCE_PAID)
 *   reached SUCCEEDED → IN_PAYOUT −amount                   (PAYOUT_PAID)
 *   order delivered   → ADVANCE −amount, PAYABLE −amount    (ADVANCE_SETTLED)
 *                       — taken out of the order's own earning, so from
 *                       here on it is exactly a normal payout
 *   order cancelled / refunded
 *                     → ADVANCE −amount, OWED +amount       (ADVANCE_TO_DUES)
 *                       — the seller owes it back, taken from later payouts
 *   undone (failed / reversed / cancelled) → the money goes back to where
 *     it sits now: ADVANCE (not cleared), PAYABLE (settled) or OWED (dues)
 *
 * An advance never settles COD dues (`duesPaise` is 0).
 */
function advanceLegs(p: PayoutForLedger): Leg[] {
  const ref = { orderId: p.orderId, payoutId: p.id };
  const k = (suffix: string) => `payout:${p.id}:${suffix}`;
  const n = p.orderNumber;
  const a = p.amountPaise;
  const legs: Leg[] = [
    { ...ref, bucket: "ADVANCE", type: "ADVANCE_PAID", amount: a, key: k("advance:reserve:advance"), description: `Advance for order ${n} (before delivery)` },
    { ...ref, bucket: "IN_PAYOUT", type: "ADVANCE_PAID", amount: a, key: k("advance:reserve:in-payout"), description: `Advance for order ${n} (before delivery)` },
  ];

  const paid = p.wasPaid || p.status === "SUCCEEDED" || p.status === "REVERSED";
  if (paid) {
    legs.push({ ...ref, bucket: "IN_PAYOUT", type: "PAYOUT_PAID", amount: -a, key: k("paid"), description: `Advance paid to the seller — order ${n}` });
  }

  const outcome = p.advanceOutcome ?? null;
  if (outcome === "SETTLED") {
    legs.push(
      { ...ref, bucket: "ADVANCE", type: "ADVANCE_SETTLED", amount: -a, key: k("advance:settled:advance"), description: `Order ${n} delivered — advance taken from its earning` },
      { ...ref, bucket: "PAYABLE", type: "ADVANCE_SETTLED", amount: -a, key: k("advance:settled:payable"), description: `Order ${n} delivered — advance taken from its earning` },
    );
  } else if (outcome === "DUES") {
    legs.push(
      { ...ref, bucket: "ADVANCE", type: "ADVANCE_TO_DUES", amount: -a, key: k("advance:dues:advance"), description: `Order ${n} not delivered — advance to be paid back` },
      { ...ref, bucket: "OWED", type: "ADVANCE_TO_DUES", amount: a, key: k("advance:dues:owed"), description: `Order ${n} not delivered — advance to be paid back` },
    );
  }

  if (UNDONE.includes(p.status)) {
    // Where the money sits now, and the sign that takes it back out.
    const home: { bucket: Bucket; amount: bigint } =
      outcome === "SETTLED" ? { bucket: "PAYABLE", amount: a } : outcome === "DUES" ? { bucket: "OWED", amount: -a } : { bucket: "ADVANCE", amount: -a };
    const where = home.bucket.toLowerCase().replace("_", "-");
    if (paid) {
      legs.push({ ...ref, ...home, type: "PAYOUT_RETURNED", key: k(`advance:returned:${where}`), description: `Advance came back / was cancelled — order ${n}` });
    } else {
      legs.push(
        { ...ref, bucket: "IN_PAYOUT", type: "PAYOUT_RELEASED", amount: -a, key: k("advance:released:in-payout"), description: `Advance did not go out — order ${n}` },
        { ...ref, ...home, type: "PAYOUT_RELEASED", key: k(`advance:released:${where}`), description: `Advance did not go out — order ${n}` },
      );
    }
  }

  return legs.filter((leg) => leg.amount !== 0n);
}

// ---------------------------------------------------------------------------
// Per-order settlement — the seller's Transactions page
// ---------------------------------------------------------------------------

/**
 * Where one order's money stands for the seller — one word per order.
 *   Online: AWAITING_DELIVERY → READY_TO_PAY → ON_ITS_WAY → SETTLED
 *           (ADVANCE_PAID: some was paid before delivery — §9)
 *           (PARTLY_SETTLED when only some of it went out)
 *   COD:    CASH_TO_COLLECT → CASH_COLLECTED (the seller has the cash)
 *   Either: CANCELLED · REFUND_PENDING · REFUNDED
 */
export type Settlement =
  | "AWAITING_DELIVERY"
  | "ADVANCE_PAID"
  | "READY_TO_PAY"
  | "ON_ITS_WAY"
  | "PARTLY_SETTLED"
  | "SETTLED"
  | "CASH_TO_COLLECT"
  | "CASH_COLLECTED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "CANCELLED";

export interface SettlementFacts {
  method: Method;
  /** OrderStatus */
  status: string;
  /** PaymentStatus */
  paymentStatus: string;
  /** What the seller earns on the order (snapshot or computed). */
  earningPaise: bigint;
  payouts: { status: PayoutForLedger["status"]; amountPaise: bigint; duesPaise: bigint; createdAt: Date }[];
  refunds: { status: "PENDING" | "SUCCEEDED" | "FAILED" }[];
}

export interface SettlementResult {
  status: Settlement;
  totals: PayoutTotals;
  /** The newest payout failed or came back and money is still to pay. */
  lastPayoutFailed: boolean;
}

export function settlementStatus(f: SettlementFacts): SettlementResult {
  // REFUNDED only when the refund covered the order — the refunds module sets
  // paymentStatus REFUNDED then. A PART refund (made by hand in the hub
  // dashboard) on a delivered order leaves it PAID: the seller is still owed,
  // so it keeps its normal status (the row shows the refunded amount).
  const refunded =
    f.paymentStatus === "REFUNDED" || (f.status === "CANCELLED" && f.refunds.some((r) => r.status === "SUCCEEDED"));
  // UnieMax owes nothing on a cash order (the seller has the cash) or on one
  // that was cancelled / refunded — so nothing is "remaining" to pay there.
  const owesNothing = sellerHoldsMoney(f.method) || f.status === "CANCELLED" || refunded;
  const totals = payoutTotals(
    owesNothing ? 0n : f.earningPaise,
    f.payouts.map((p) => ({ status: p.status, amountPaise: p.amountPaise, duesPaise: p.duesPaise })),
  );
  const newest = [...f.payouts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastPayoutFailed =
    totals.remaining > 0n && Boolean(newest && (newest.status === "FAILED" || newest.status === "REVERSED"));
  const result = (status: Settlement): SettlementResult => ({ status, totals, lastPayoutFailed });

  if (refunded) return result("REFUNDED");
  if (f.status === "CANCELLED") {
    return result(f.refunds.some((r) => r.status === "PENDING") ? "REFUND_PENDING" : "CANCELLED");
  }
  if (f.method === "COD") return result(f.status === "DELIVERED" ? "CASH_COLLECTED" : "CASH_TO_COLLECT");
  // Paid to the seller when the bill was made — nothing left to collect.
  if (f.method === "OFFLINE") return result("CASH_COLLECTED");
  // Only an advance can be paid (or on its way) before delivery.
  if (f.status !== "DELIVERED") {
    return result(totals.paidOut + totals.inProgress > 0n ? "ADVANCE_PAID" : "AWAITING_DELIVERY");
  }
  if (totals.inProgress > 0n) return result("ON_ITS_WAY");
  if (totals.remaining === 0n) return result("SETTLED");
  if (totals.paidOut + totals.duesDeducted > 0n) return result("PARTLY_SETTLED");
  return result("READY_TO_PAY");
}
