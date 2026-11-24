// Offline bills (a seller's bill paid to the seller directly — method OFFLINE):
// the money rules. UnieMax never held the money, so: no payout, no gateway
// fee, the platform fee is the seller's dues (OWED) like COD — and an admin
// can give OFFLINE its own platform fee rule. No server, no database:
// `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFinancials,
  orderLegs,
  resolveRule,
  sellerHoldsMoney,
  settlementStatus,
  type RuleLike,
} from "../../src/modules/finance/finance.rules.js";
import { payoutBlockers } from "../../src/modules/payouts/payouts.rules.js";
import { last10 } from "../../src/modules/bills/billOwner.js";

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
const at = new Date("2026-11-25T10:00:00Z");

test("the seller holds the money on COD and OFFLINE, not ONLINE", () => {
  assert.equal(sellerHoldsMoney("COD"), true);
  assert.equal(sellerHoldsMoney("OFFLINE"), true);
  assert.equal(sellerHoldsMoney("ONLINE"), false);
});

test("an OFFLINE order posts only the platform fee, as dues (OWED)", () => {
  const legs = orderLegs(
    { id: "o1", orderNumber: "48203917", method: "OFFLINE" },
    { totalPaise: 100000n, platformFeePaise: 5000n, gatewayFeePaise: 0n, gatewayFeeBearer: "SELLER" },
  );
  assert.equal(legs.length, 1);
  assert.equal(legs[0]!.bucket, "OWED");
  assert.equal(legs[0]!.amount, 5000n);
  assert.match(legs[0]!.description, /paid to you directly/);
  // Nothing is ever payable to the seller — the sale never passed through UnieMax.
  assert.ok(legs.every((l) => l.bucket !== "PAYABLE"));
});

test("no gateway fee on an OFFLINE order even when the seller bears it", () => {
  const rules = [rule({ id: "p", kind: "PLATFORM", percent: "5" }), rule({ id: "g", kind: "GATEWAY", percent: "2", bearer: "SELLER" })];
  const f = computeFinancials(
    { method: "OFFLINE", storeId: "s1", placedAt: at, shippingPaise: 0n, totalPaise: 100000n, lines: [{ orderItemId: "l1", lineTotalPaise: 100000n, categoryId: null }] },
    rules,
  );
  assert.equal(f.gatewayFeePaise, 0n);
  assert.equal(f.platformFeePaise, 5000n);
});

test("an OFFLINE-only platform rule beats the any-method rule (e.g. 0% to waive it)", () => {
  const rules = [
    rule({ id: "all", kind: "PLATFORM", percent: "5" }),
    rule({ id: "offline", kind: "PLATFORM", percent: "0", paymentMethod: "OFFLINE" }),
  ];
  assert.equal(resolveRule(rules, "PLATFORM", { storeId: "s1", categoryId: null, method: "OFFLINE", at })?.id, "offline");
  // Online and COD orders keep the general rule.
  assert.equal(resolveRule(rules, "PLATFORM", { storeId: "s1", categoryId: null, method: "ONLINE", at })?.id, "all");
  assert.equal(resolveRule(rules, "PLATFORM", { storeId: "s1", categoryId: null, method: "COD", at })?.id, "all");
});

test("an OFFLINE order is settled from the start: collected, nothing to pay out", () => {
  for (const status of ["CONFIRMED", "DELIVERED"]) {
    const r = settlementStatus({ method: "OFFLINE", status, paymentStatus: "PAID", earningPaise: 95000n, payouts: [], refunds: [] });
    assert.equal(r.status, "CASH_COLLECTED", status);
    assert.equal(r.totals.remaining, 0n);
  }
});

test("an OFFLINE order can never be paid out", () => {
  const blockers = payoutBlockers({ status: "DELIVERED", paymentMethod: "OFFLINE", paymentStatus: "PAID" });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0]!, /Paid to the seller directly/);
});

test("phones compare on their last 10 digits, however they were typed", () => {
  for (const p of ["+919840011223", "919840011223", "09840011223", "98400 11223", "+91 98400-11223"]) {
    assert.equal(last10(p), "9840011223", p);
  }
  assert.equal(last10(null), "");
});
