// Unit tests for ADVANCE payouts — money paid to a seller before the order is
// delivered (docs/seller-finance/README.md §9): the ledger legs, how an
// advance is cleared, when one is allowed, and the seller's per-order status.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAdvanceOutcome,
  orderLegs,
  payoutLegs,
  settlementStatus,
  type AdvanceOutcome,
  type Leg,
  type PayoutForLedger,
} from "../../src/modules/finance/finance.rules.js";
import { payoutPlan, payoutTotals } from "../../src/modules/payouts/payouts.rules.js";

/** Sum the legs per bucket — what the four balances end up as. */
function balances(legs: Leg[]) {
  const out = { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 0n, ADVANCE: 0n };
  for (const leg of legs) out[leg.bucket] += leg.amount;
  return out;
}

/** Posting is by key: the same key twice counts once (like postLegs). */
function post(...groups: Leg[][]): Leg[] {
  const seen = new Map<string, Leg>();
  for (const leg of groups.flat()) if (!seen.has(leg.key)) seen.set(leg.key, leg);
  return [...seen.values()];
}

// An online order: ₹1,000 total, ₹100 platform fee → the seller earns ₹900.
const sale = orderLegs(
  { id: "O", orderNumber: "O-1", method: "ONLINE" },
  { totalPaise: 100000n, platformFeePaise: 10000n, gatewayFeePaise: 2000n, gatewayFeeBearer: "PLATFORM" },
);

const advance = (over: Partial<PayoutForLedger> = {}): PayoutForLedger => ({
  id: "a1",
  orderId: "O",
  orderNumber: "O-1",
  status: "SUCCEEDED",
  amountPaise: 90000n,
  duesPaise: 0n,
  wasPaid: true,
  isAdvance: true,
  advanceOutcome: null,
  ...over,
});

const zero = { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 0n, ADVANCE: 0n };

// ---- Ledger legs -------------------------------------------------------------

test("full advance paid before delivery sits in ADVANCE, not in OWED or PAYABLE", () => {
  assert.deepEqual(balances(payoutLegs(advance())), { ...zero, ADVANCE: 90000n });
  // Not sent yet: also on its way.
  assert.deepEqual(balances(payoutLegs(advance({ status: "PENDING", wasPaid: false }))), {
    ...zero,
    ADVANCE: 90000n,
    IN_PAYOUT: 90000n,
  });
});

test("order delivered: the full advance comes out of its earning — nothing left, nothing owed", () => {
  const legs = post(payoutLegs(advance()), sale, payoutLegs(advance({ advanceOutcome: "SETTLED" })));
  assert.deepEqual(balances(legs), zero);
});

test("order delivered after a PART advance: only the rest is left to pay", () => {
  const part = (o: AdvanceOutcome | null) => payoutLegs(advance({ amountPaise: 30000n, advanceOutcome: o }));
  const legs = post(part(null), sale, part("SETTLED"));
  assert.deepEqual(balances(legs), { ...zero, PAYABLE: 60000n });
});

test("two advances on one order, then delivery, then the normal payout for the rest", () => {
  const a1 = (o: AdvanceOutcome | null) => payoutLegs(advance({ id: "a1", amountPaise: 30000n, advanceOutcome: o }));
  const a2 = (o: AdvanceOutcome | null) => payoutLegs(advance({ id: "a2", amountPaise: 20000n, advanceOutcome: o }));
  const rest = payoutLegs({ id: "p3", orderId: "O", orderNumber: "O-1", status: "SUCCEEDED", amountPaise: 40000n, duesPaise: 0n, wasPaid: true });
  assert.deepEqual(balances(post(a1(null), a2(null), sale, a1("SETTLED"), a2("SETTLED"), rest)), zero);
});

test("order cancelled / refunded: the advance becomes the seller's dues (OWED)", () => {
  const legs = post(payoutLegs(advance()), payoutLegs(advance({ advanceOutcome: "DUES" })));
  assert.deepEqual(balances(legs), { ...zero, OWED: 90000n });
});

test("an advance undone before the order ended leaves nothing behind", () => {
  for (const end of [
    { status: "FAILED" as const, wasPaid: false },
    { status: "CANCELLED" as const, wasPaid: false },
    { status: "REVERSED" as const, wasPaid: true },
    { status: "CANCELLED" as const, wasPaid: true },
  ]) {
    const legs = post(payoutLegs(advance({ status: "PENDING", wasPaid: false })), payoutLegs(advance(end)));
    assert.deepEqual(balances(legs), zero, `${end.status} paid=${end.wasPaid}`);
  }
});

test("an advance that comes back AFTER delivery is owed to the seller again (PAYABLE)", () => {
  const legs = post(
    payoutLegs(advance()),
    sale,
    payoutLegs(advance({ advanceOutcome: "SETTLED" })),
    payoutLegs(advance({ advanceOutcome: "SETTLED", status: "REVERSED" })),
  );
  assert.deepEqual(balances(legs), { ...zero, PAYABLE: 90000n });
});

test("an unsent advance that fails AFTER delivery: the earning is payable again", () => {
  const pending = { status: "PENDING" as const, wasPaid: false };
  const legs = post(
    payoutLegs(advance(pending)),
    sale,
    payoutLegs(advance({ ...pending, advanceOutcome: "SETTLED" })),
    payoutLegs(advance({ status: "FAILED", wasPaid: false, advanceOutcome: "SETTLED" })),
  );
  assert.deepEqual(balances(legs), { ...zero, PAYABLE: 90000n });
});

test("an advance that comes back after the order was cancelled clears the dues", () => {
  const legs = post(
    payoutLegs(advance()),
    payoutLegs(advance({ advanceOutcome: "DUES" })),
    payoutLegs(advance({ advanceOutcome: "DUES", status: "REVERSED" })),
  );
  assert.deepEqual(balances(legs), zero);
});

test("advance legs only grow — every earlier state's keys stay included", () => {
  const keys = (p: PayoutForLedger) => new Set(payoutLegs(p).map((l) => l.key));
  const steps = [
    keys(advance({ status: "PENDING", wasPaid: false })),
    keys(advance()),
    keys(advance({ advanceOutcome: "SETTLED" })),
    keys(advance({ advanceOutcome: "SETTLED", status: "REVERSED" })),
  ];
  for (let i = 1; i < steps.length; i += 1) {
    for (const key of steps[i - 1]!) assert.ok(steps[i]!.has(key), `step ${i}: ${key}`);
  }
});

test("advance keys never clash with a normal payout's keys", () => {
  const normal = payoutLegs({ id: "a1", orderId: "O", orderNumber: "O-1", status: "REVERSED", amountPaise: 1n, duesPaise: 0n, wasPaid: true });
  const adv = payoutLegs(advance({ status: "REVERSED", advanceOutcome: "SETTLED" }));
  const shared = adv.filter((leg) => normal.some((n) => n.key === leg.key)).map((l) => l.key);
  // Only "paid" is shared by design — the same money leaving IN_PAYOUT.
  assert.deepEqual(shared, ["payout:a1:paid"]);
});

// ---- Clearing ---------------------------------------------------------------

test("nextAdvanceOutcome: delivered → SETTLED, ended → DUES, kept once set", () => {
  const open = { posted: false, ended: false };
  assert.equal(nextAdvanceOutcome(null, "SUCCEEDED", open), null);
  assert.equal(nextAdvanceOutcome(null, "SUCCEEDED", { posted: true, ended: false }), "SETTLED");
  assert.equal(nextAdvanceOutcome(null, "PENDING", { posted: false, ended: true }), "DUES");
  // Once set it never changes, even if the payout is undone later.
  assert.equal(nextAdvanceOutcome("SETTLED", "REVERSED", open), "SETTLED");
  assert.equal(nextAdvanceOutcome("DUES", "CANCELLED", { posted: true, ended: true }), "DUES");
  // Undone before the order ended: never cleared.
  assert.equal(nextAdvanceOutcome(null, "FAILED", { posted: true, ended: false }), null);
  assert.equal(nextAdvanceOutcome(null, "CANCELLED", { posted: false, ended: true }), null);
});

// ---- When an advance is allowed ----------------------------------------------

const shipped = { status: "SHIPPED", paymentMethod: "ONLINE", paymentStatus: "PAID" };

test("payoutPlan: delivered is a normal payout, switch or not", () => {
  for (const allowed of [true, false]) {
    assert.deepEqual(payoutPlan({ ...shipped, status: "DELIVERED" }, allowed), { advance: false, blockers: [], needsAdvanceSwitch: false });
  }
});

test("payoutPlan: paid online + not delivered → advance, only with the store's switch on", () => {
  for (const status of ["PENDING", "CONFIRMED", "PACKED", "SHIPPED"]) {
    assert.deepEqual(payoutPlan({ ...shipped, status }, true), { advance: true, blockers: [], needsAdvanceSwitch: false }, status);
    const off = payoutPlan({ ...shipped, status }, false);
    assert.equal(off.advance, true);
    assert.equal(off.needsAdvanceSwitch, true);
    assert.match(off.blockers.join(" "), /allow advance payouts/);
  }
});

test("payoutPlan: never an advance on COD, unpaid, refunded or cancelled orders", () => {
  const cases = [
    { ...shipped, paymentMethod: "COD" },
    { ...shipped, paymentMethod: "OFFLINE" },
    { ...shipped, paymentStatus: "PENDING" },
    { ...shipped, status: "AWAITING_PAYMENT", paymentStatus: "PENDING" },
    { ...shipped, paymentStatus: "REFUNDED" },
    { ...shipped, status: "CANCELLED" },
  ];
  for (const order of cases) {
    const plan = payoutPlan(order, true);
    assert.ok(plan.blockers.length > 0, JSON.stringify(order));
    assert.equal(plan.needsAdvanceSwitch, false, JSON.stringify(order));
  }
});

test("an advance counts against what is left to pay on the order", () => {
  const t = payoutTotals(90000n, [{ status: "SUCCEEDED", amountPaise: 30000n }]);
  assert.equal(t.remaining, 60000n);
  const full = payoutTotals(90000n, [{ status: "SUCCEEDED", amountPaise: 90000n }]);
  assert.equal(full.remaining, 0n);
});

// ---- The seller's per-order status ------------------------------------------

test("settlement: ADVANCE_PAID before delivery, then the normal statuses", () => {
  const base = {
    method: "ONLINE" as const,
    paymentStatus: "PAID",
    earningPaise: 90000n,
    refunds: [],
  };
  const p = (status: "SUCCEEDED" | "PENDING", amountPaise: bigint) => ({ status, amountPaise, duesPaise: 0n, createdAt: new Date() });
  assert.equal(settlementStatus({ ...base, status: "SHIPPED", payouts: [] }).status, "AWAITING_DELIVERY");
  assert.equal(settlementStatus({ ...base, status: "SHIPPED", payouts: [p("SUCCEEDED", 30000n)] }).status, "ADVANCE_PAID");
  assert.equal(settlementStatus({ ...base, status: "PACKED", payouts: [p("PENDING", 30000n)] }).status, "ADVANCE_PAID");
  assert.equal(settlementStatus({ ...base, status: "DELIVERED", payouts: [p("SUCCEEDED", 30000n)] }).status, "PARTLY_SETTLED");
  assert.equal(settlementStatus({ ...base, status: "DELIVERED", payouts: [p("SUCCEEDED", 90000n)] }).status, "SETTLED");
  assert.equal(settlementStatus({ ...base, status: "CANCELLED", payouts: [p("SUCCEEDED", 90000n)] }).status, "CANCELLED");
});
