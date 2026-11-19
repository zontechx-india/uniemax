// Unit tests for the per-order "settled or not" rule behind the seller's
// Transactions page (modules/finance/finance.rules.ts → settlementStatus).
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { settlementStatus, type SettlementFacts } from "../../src/modules/finance/finance.rules.js";

const facts = (over: Partial<SettlementFacts> = {}): SettlementFacts => ({
  method: "ONLINE",
  status: "DELIVERED",
  paymentStatus: "PAID",
  earningPaise: 10000n,
  payouts: [],
  refunds: [],
  ...over,
});
const payout = (status: SettlementFacts["payouts"][number]["status"], amountPaise: bigint, day = 1, duesPaise = 0n) => ({
  status,
  amountPaise,
  duesPaise,
  createdAt: new Date(`2026-11-0${day}T10:00:00Z`),
});

test("online, paid, not delivered yet → waiting for delivery", () => {
  for (const status of ["PENDING", "CONFIRMED", "PACKED", "SHIPPED"]) {
    assert.equal(settlementStatus(facts({ status })).status, "AWAITING_DELIVERY", status);
  }
});

test("online, delivered, no payout → ready to pay", () => {
  const r = settlementStatus(facts());
  assert.equal(r.status, "READY_TO_PAY");
  assert.equal(r.totals.remaining, 10000n);
  assert.equal(r.lastPayoutFailed, false);
});

test("payout pending or processing → on its way", () => {
  assert.equal(settlementStatus(facts({ payouts: [payout("PENDING", 10000n)] })).status, "ON_ITS_WAY");
  assert.equal(settlementStatus(facts({ payouts: [payout("PROCESSING", 4000n)] })).status, "ON_ITS_WAY");
});

test("paid in full (dues count) → settled", () => {
  assert.equal(settlementStatus(facts({ payouts: [payout("SUCCEEDED", 10000n)] })).status, "SETTLED");
  const withDues = settlementStatus(facts({ payouts: [payout("SUCCEEDED", 8000n, 1, 2000n)] }));
  assert.equal(withDues.status, "SETTLED");
  assert.equal(withDues.totals.duesDeducted, 2000n);
});

test("only some paid → partly settled", () => {
  const r = settlementStatus(facts({ payouts: [payout("SUCCEEDED", 6000n)] }));
  assert.equal(r.status, "PARTLY_SETTLED");
  assert.equal(r.totals.remaining, 4000n);
});

test("newest payout failed or came back → ready to pay again, flagged", () => {
  const failed = settlementStatus(facts({ payouts: [payout("FAILED", 10000n)] }));
  assert.equal(failed.status, "READY_TO_PAY");
  assert.equal(failed.lastPayoutFailed, true);
  const reversed = settlementStatus(facts({ payouts: [payout("REVERSED", 10000n)] }));
  assert.equal(reversed.status, "READY_TO_PAY");
  assert.equal(reversed.lastPayoutFailed, true);
  // A failure followed by a successful retry is not flagged.
  const retried = settlementStatus(facts({ payouts: [payout("FAILED", 10000n, 1), payout("SUCCEEDED", 10000n, 2)] }));
  assert.equal(retried.status, "SETTLED");
  assert.equal(retried.lastPayoutFailed, false);
});

test("nothing to earn (fees ate it all) → settled", () => {
  assert.equal(settlementStatus(facts({ earningPaise: 0n })).status, "SETTLED");
});

test("cash on delivery → to collect, then collected", () => {
  assert.equal(settlementStatus(facts({ method: "COD", status: "SHIPPED", paymentStatus: "PENDING" })).status, "CASH_TO_COLLECT");
  const collected = settlementStatus(facts({ method: "COD", paymentStatus: "PENDING" }));
  assert.equal(collected.status, "CASH_COLLECTED");
  assert.equal(collected.totals.remaining, 0n, "UnieMax pays nothing on a cash order");
});

test("cancelled → cancelled / refund pending / refunded", () => {
  assert.equal(settlementStatus(facts({ method: "COD", status: "CANCELLED", paymentStatus: "PENDING" })).status, "CANCELLED");
  assert.equal(settlementStatus(facts({ status: "CANCELLED", refunds: [{ status: "PENDING" }] })).status, "REFUND_PENDING");
  assert.equal(settlementStatus(facts({ status: "CANCELLED", refunds: [{ status: "SUCCEEDED" }] })).status, "REFUNDED");
  assert.equal(settlementStatus(facts({ status: "CANCELLED", paymentStatus: "REFUNDED" })).status, "REFUNDED");
  assert.equal(settlementStatus(facts({ status: "CANCELLED", refunds: [{ status: "FAILED" }] })).status, "CANCELLED");
  assert.equal(settlementStatus(facts({ status: "CANCELLED" })).totals.remaining, 0n);
});

test("a part refund on a delivered order (paid stays PAID) keeps the normal status", () => {
  const r = settlementStatus(facts({ refunds: [{ status: "SUCCEEDED" }] }));
  assert.equal(r.status, "READY_TO_PAY");
  assert.equal(r.totals.remaining, 10000n);
  // A full refund flips the order to REFUNDED — then nothing is due.
  const full = settlementStatus(facts({ paymentStatus: "REFUNDED", refunds: [{ status: "SUCCEEDED" }] }));
  assert.equal(full.status, "REFUNDED");
  assert.equal(full.totals.remaining, 0n);
});
