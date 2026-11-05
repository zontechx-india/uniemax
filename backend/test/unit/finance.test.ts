// Unit tests for seller finance's pure rules (modules/finance/finance.rules.ts):
// percent maths, rule resolution, per-order fees and the ledger legs.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFinancials,
  feeOn,
  orderLegs,
  payoutLegs,
  percentToBp,
  resolveRule,
  type Leg,
  type RuleLike,
} from "../../src/modules/finance/finance.rules.js";
import { payoutTotals } from "../../src/modules/payouts/payouts.rules.js";

const rule = (over: Partial<RuleLike> & Pick<RuleLike, "id" | "kind" | "percent">): RuleLike => ({
  scope: "GLOBAL",
  storeId: null,
  categoryId: null,
  paymentMethod: null,
  bearer: over.kind === "PLATFORM" ? "SELLER" : "PLATFORM",
  effectiveFrom: new Date("2020-01-01T00:00:00Z"),
  retiredAt: null,
  ...over,
});

const at = new Date("2026-11-05T10:00:00Z");
const ctx = { storeId: "s1", categoryId: null, method: "ONLINE" as const, at };

/** Sum the legs per bucket — what the balances end up as. */
function balances(legs: Leg[]) {
  const out = { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 0n };
  for (const leg of legs) out[leg.bucket] += leg.amount;
  return out;
}

// ---- Percent maths ---------------------------------------------------------

test("percentToBp reads 0–100 with up to 2 decimals", () => {
  assert.equal(percentToBp("10"), 1000);
  assert.equal(percentToBp("2.5"), 250);
  assert.equal(percentToBp("0.05"), 5);
  assert.equal(percentToBp("100"), 10_000);
  assert.equal(percentToBp("100.01"), null);
  assert.equal(percentToBp("1.234"), null);
});

test("feeOn rounds half up to the paisa", () => {
  assert.equal(feeOn(10000n, 1000), 1000n); // 10% of ₹100 = ₹10
  assert.equal(feeOn(999n, 250), 25n); // 2.5% of ₹9.99 = 24.975 paise → 25
  assert.equal(feeOn(12345n, 0), 0n);
});

// ---- Rule resolution -------------------------------------------------------

test("the latest rule in force wins; a future rule is not used yet", () => {
  const rules = [
    rule({ id: "old", kind: "PLATFORM", percent: "0.00" }),
    rule({ id: "now", kind: "PLATFORM", percent: "5.00", effectiveFrom: new Date("2026-11-01T00:00:00Z") }),
    rule({ id: "later", kind: "PLATFORM", percent: "8.00", effectiveFrom: new Date("2026-12-01T00:00:00Z") }),
  ];
  assert.equal(resolveRule(rules, "PLATFORM", ctx)?.id, "now");
  // An order placed before the 5% rule keeps 0%.
  assert.equal(resolveRule(rules, "PLATFORM", { ...ctx, at: new Date("2026-10-01T00:00:00Z") })?.id, "old");
});

test("most specific rule wins: store > category > global", () => {
  const rules = [
    rule({ id: "global", kind: "PLATFORM", percent: "5.00" }),
    rule({ id: "cat", kind: "PLATFORM", percent: "3.00", scope: "CATEGORY", categoryId: "c1" }),
    rule({ id: "store", kind: "PLATFORM", percent: "1.00", scope: "STORE", storeId: "s1" }),
    rule({ id: "other-store", kind: "PLATFORM", percent: "9.00", scope: "STORE", storeId: "s2" }),
  ];
  assert.equal(resolveRule(rules, "PLATFORM", { ...ctx, categoryId: "c1" })?.id, "store");
  assert.equal(resolveRule(rules, "PLATFORM", { ...ctx, storeId: "s3", categoryId: "c1" })?.id, "cat");
  assert.equal(resolveRule(rules, "PLATFORM", { ...ctx, storeId: "s3" })?.id, "global");
});

test("a retired or other-method rule doesn't apply", () => {
  const rules = [
    rule({ id: "global", kind: "PLATFORM", percent: "5.00" }),
    rule({ id: "cod-only", kind: "PLATFORM", percent: "7.00", paymentMethod: "COD" }),
    rule({ id: "retired", kind: "PLATFORM", percent: "1.00", scope: "STORE", storeId: "s1", retiredAt: new Date("2026-11-01T00:00:00Z") }),
  ];
  assert.equal(resolveRule(rules, "PLATFORM", ctx)?.id, "global");
  assert.equal(resolveRule(rules, "PLATFORM", { ...ctx, method: "COD" })?.id, "cod-only");
});

// ---- Order fees ------------------------------------------------------------

const order = (method: "ONLINE" | "COD") => ({
  storeId: "s1",
  method,
  placedAt: at,
  totalPaise: 15000n, // ₹100 items + ₹50 shipping
  shippingPaise: 5000n,
  lines: [{ orderItemId: "i1", lineTotalPaise: 10000n, categoryId: null }],
});

test("platform fee is on the product price only, never shipping", () => {
  const fin = computeFinancials(order("ONLINE"), [rule({ id: "p", kind: "PLATFORM", percent: "10" })]);
  assert.equal(fin.platformFeePaise, 1000n); // 10% of ₹100, not of ₹150
  assert.equal(fin.sellerEarningPaise, 14000n);
});

test("gateway fee: online only, and not taken from the seller when UnieMax bears it", () => {
  const rules = [
    rule({ id: "p", kind: "PLATFORM", percent: "10" }),
    rule({ id: "g", kind: "GATEWAY", percent: "2", bearer: "PLATFORM" }),
  ];
  const online = computeFinancials(order("ONLINE"), rules);
  assert.equal(online.gatewayFeePaise, 300n); // 2% of what the customer paid
  assert.equal(online.sellerEarningPaise, 14000n); // UnieMax pays it
  const cod = computeFinancials(order("COD"), rules);
  assert.equal(cod.gatewayFeePaise, 0n);

  const sellerPays = computeFinancials(order("ONLINE"), [...rules, rule({ id: "g2", kind: "GATEWAY", percent: "2", bearer: "SELLER", effectiveFrom: new Date("2021-01-01") })]);
  assert.equal(sellerPays.sellerEarningPaise, 13700n);
});

test("no rules at all → 0% (old orders)", () => {
  const fin = computeFinancials(order("ONLINE"), []);
  assert.equal(fin.platformFeePaise, 0n);
  assert.equal(fin.sellerEarningPaise, 15000n);
});

// ---- The requirement's example: COD ₹100 + online ₹100, 10% fee ----------

test("COD ₹100 → seller owes ₹10; online ₹100 → ₹90 payable", () => {
  const cod = orderLegs(
    { id: "A", orderNumber: "A-1", method: "COD" },
    { totalPaise: 10000n, platformFeePaise: 1000n, gatewayFeePaise: 0n, gatewayFeeBearer: "PLATFORM" },
  );
  assert.deepEqual(balances(cod), { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 1000n });

  const online = orderLegs(
    { id: "B", orderNumber: "B-1", method: "ONLINE" },
    { totalPaise: 10000n, platformFeePaise: 1000n, gatewayFeePaise: 200n, gatewayFeeBearer: "PLATFORM" },
  );
  assert.deepEqual(balances(online), { PAYABLE: 9000n, IN_PAYOUT: 0n, OWED: 0n });
  assert.ok(online.every((leg) => leg.type !== "GATEWAY_FEE"));
});

test("payout of ₹80 with ₹10 dues deducted clears everything", () => {
  const start = [
    ...orderLegs({ id: "A", orderNumber: "A-1", method: "COD" }, { totalPaise: 10000n, platformFeePaise: 1000n, gatewayFeePaise: 0n, gatewayFeeBearer: "PLATFORM" }),
    ...orderLegs({ id: "B", orderNumber: "B-1", method: "ONLINE" }, { totalPaise: 10000n, platformFeePaise: 1000n, gatewayFeePaise: 0n, gatewayFeeBearer: "PLATFORM" }),
  ];
  const payout = { id: "p1", orderId: "B", orderNumber: "B-1", amountPaise: 8000n, duesPaise: 1000n, wasPaid: false };
  const done = payoutLegs({ ...payout, status: "SUCCEEDED" });
  assert.deepEqual(balances([...start, ...done]), { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 0n });

  const pending = payoutLegs({ ...payout, status: "PENDING" });
  assert.deepEqual(balances([...start, ...pending]), { PAYABLE: 0n, IN_PAYOUT: 8000n, OWED: 0n });
});

test("a failed or reversed payout puts the money and the dues back", () => {
  const payout = { id: "p1", orderId: "B", orderNumber: "B-1", amountPaise: 8000n, duesPaise: 1000n };
  for (const end of [
    { status: "FAILED" as const, wasPaid: false },
    { status: "CANCELLED" as const, wasPaid: false },
    { status: "REVERSED" as const, wasPaid: true },
    { status: "CANCELLED" as const, wasPaid: true },
  ]) {
    assert.deepEqual(balances(payoutLegs({ ...payout, ...end })), { PAYABLE: 0n, IN_PAYOUT: 0n, OWED: 0n }, end.status);
  }
});

test("payout legs only grow — every earlier state's keys stay included", () => {
  const base = { id: "p1", orderId: "B", orderNumber: "B-1", amountPaise: 8000n, duesPaise: 1000n, wasPaid: false };
  const pending = new Set(payoutLegs({ ...base, status: "PENDING" }).map((l) => l.key));
  const paid = new Set(payoutLegs({ ...base, status: "SUCCEEDED" }).map((l) => l.key));
  const reversed = new Set(payoutLegs({ ...base, status: "REVERSED", wasPaid: true }).map((l) => l.key));
  for (const key of pending) assert.ok(paid.has(key), key);
  for (const key of paid) assert.ok(reversed.has(key), key);
});

test("payoutTotals: dues count toward what the payout covers", () => {
  const t = payoutTotals(9000n, [{ status: "SUCCEEDED", amountPaise: 8000n, duesPaise: 1000n }]);
  assert.equal(t.paidOut, 8000n);
  assert.equal(t.duesDeducted, 1000n);
  assert.equal(t.remaining, 0n);
  const cancelled = payoutTotals(9000n, [{ status: "CANCELLED", amountPaise: 8000n, duesPaise: 1000n }]);
  assert.equal(cancelled.remaining, 9000n);
});
