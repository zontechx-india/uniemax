// Dropshipping Phase 6 — Easy Split rules: who is paid how, what each payee gets,
// when a split is due, and how a split line reads on the account. Pure logic:
// `npm run test:unit`. PS-* refer to docs/dropshipping/money.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseSettleVia,
  codFeeDue,
  lineStateWords,
  payoutDate,
  splitAmounts,
  splitDue,
  splitWindowClosing,
  statementBalance,
  statementLine,
} from "../../src/package/dropship/domain.js";
import type { StatementOrder } from "../../src/package/dropship/domain.js";

const ok = { paymentMode: "PREPAID" as const, splitLive: true, sellerActive: true, supplierActive: true };

test("settle via: prepaid with the provider live and both accounts active is split", () => {
  assert.equal(chooseSettleVia(ok), "SPLIT");
});

test("settle via: cash on delivery is never split, whatever else is true", () => {
  assert.equal(chooseSettleVia({ ...ok, paymentMode: "COD" }), "DIRECT");
});

test("settle via: any missing piece falls back to direct (PS-1, T-9)", () => {
  assert.equal(chooseSettleVia({ ...ok, splitLive: false }), "DIRECT");
  assert.equal(chooseSettleVia({ ...ok, sellerActive: false }), "DIRECT");
  assert.equal(chooseSettleVia({ ...ok, supplierActive: false }), "DIRECT");
});

const part = (storeId: string, share: string, fee = "0") => ({ storeId, supplierShare: share, platformFee: fee });

test("split amounts: each supplier gets its share, the seller the rest less the fee; the fee stays with UnieMax", () => {
  const r = splitAmounts({ orderTotal: "1048", sellerStoreId: "seller", parts: [part("sup", "510", "20")] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.entries.map((e) => [e.storeId, e.role, e.amount.toFixed(2)]), [
    ["sup", "SUPPLIER", "510.00"],
    ["seller", "SELLER", "518.00"], // 1048 − 510 − 20
  ]);
  assert.equal(r.fee.toFixed(2), "20.00");
  const paidOut = r.entries.reduce((s, e) => s + Number(e.amount), 0);
  assert.equal(paidOut + Number(r.fee), 1048, "payees plus the fee add up to exactly what the customer paid (PS-6)");
});

test("split amounts: two suppliers on one order", () => {
  const r = splitAmounts({ orderTotal: "2000", sellerStoreId: "seller", parts: [part("a", "510"), part("b", "700", "10")] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.entries.find((e) => e.role === "SELLER")!.amount.toFixed(2), "780.00"); // 2000 − 1210 − 10
});

test("split amounts: never negative and never above what the customer paid (PS-6)", () => {
  const loss = splitAmounts({ orderTotal: "500", sellerStoreId: "seller", parts: [part("sup", "510")] });
  assert.equal(loss.ok, false);
  const fee = splitAmounts({ orderTotal: "520", sellerStoreId: "seller", parts: [part("sup", "510", "20")] });
  assert.equal(fee.ok, false);
  const exact = splitAmounts({ orderTotal: "510", sellerStoreId: "seller", parts: [part("sup", "510")] });
  assert.equal(exact.ok, true); // the seller gets nothing, but nothing is over
  if (exact.ok) assert.equal(exact.entries.find((e) => e.role === "SELLER")!.amount.toFixed(2), "0.00");
});

test("split amounts: paise stay exact", () => {
  const r = splitAmounts({ orderTotal: "999.99", sellerStoreId: "seller", parts: [part("sup", "333.33", "0.01")] });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.entries.find((e) => e.role === "SELLER")!.amount.toFixed(2), "666.65");
});

test("payout date: the hold after the split (D-21)", () => {
  assert.equal(payoutDate(new Date("2026-10-21T10:00:00Z"), 12).toISOString(), "2026-11-02T10:00:00.000Z");
});

const at = new Date("2026-10-21T10:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

test("a split is due two minutes after the payment, while it is still waiting", () => {
  const o = { settleVia: "SPLIT" as const, splitState: null, paidAt: at };
  assert.equal(splitDue(o, 2, new Date(at.getTime() + MIN)), false);
  assert.equal(splitDue(o, 2, new Date(at.getTime() + 3 * MIN)), true);
  assert.equal(splitDue({ ...o, splitState: "FAILED" }, 2, new Date(at.getTime() + 3 * MIN)), true, "a failed call is retried");
  assert.equal(splitDue({ ...o, splitState: "DONE" }, 2, new Date(at.getTime() + HOUR)), false, "once done, never again (PS-7)");
  assert.equal(splitDue({ ...o, splitState: "FALLBACK_DIRECT" }, 2, new Date(at.getTime() + HOUR)), false);
  assert.equal(splitDue({ ...o, settleVia: "DIRECT" }, 2, new Date(at.getTime() + HOUR)), false);
  assert.equal(splitDue({ ...o, paidAt: null }, 2, new Date(at.getTime() + HOUR)), false);
});

test("the window closing: two hours before the end of the split window, still not done → a person must act (PS-3)", () => {
  const o = { settleVia: "SPLIT" as const, splitState: "FAILED" as const, paidAt: at };
  assert.equal(splitWindowClosing(o, 24, new Date(at.getTime() + 21 * HOUR)), false);
  assert.equal(splitWindowClosing(o, 24, new Date(at.getTime() + 22 * HOUR)), true);
  assert.equal(splitWindowClosing({ ...o, splitState: "DONE" }, 24, new Date(at.getTime() + 23 * HOUR)), false);
});

test("COD fee: debited once, from a delivered COD order that carries a fee (D-20)", () => {
  const o = { paymentMode: "COD" as const, status: "DELIVERED" as const, platformFee: "20", feeAdjustedAt: null };
  assert.equal(codFeeDue(o), true);
  assert.equal(codFeeDue({ ...o, feeAdjustedAt: new Date() }), false, "never twice");
  assert.equal(codFeeDue({ ...o, platformFee: "0" }), false);
  assert.equal(codFeeDue({ ...o, status: "SHIPPED" }), false);
  assert.equal(codFeeDue({ ...o, paymentMode: "PREPAID" }), false, "a prepaid order's fee comes out of the split");
});

// ---- the account ---------------------------------------------------------------

const order = (over: Partial<StatementOrder> = {}): StatementOrder => ({
  status: "DELIVERED",
  statementState: "SPLIT",
  paymentMode: "PREPAID",
  supplierShare: "510.00",
  collectAmount: null,
  shippingFee: "60.00",
  returnFeePayer: "SELLER",
  ...over,
});

test("a split line owes nothing between the two: the supplier was paid by UnieMax", () => {
  const l = statementLine(order());
  assert.equal(l.amount.toFixed(2), "0.00");
  assert.equal(l.counts, false);
  assert.equal(lineStateWords("SPLIT", "DELIVERED"), "Paid by UnieMax");
  assert.equal(statementBalance([l, statementLine(order({ statementState: "OWED", supplierShare: "100" }))], []).toFixed(2), "100.00");
});

test("a split order that came back owes the shipping fee like any other (the customer is refunded in full)", () => {
  // the line leaves SPLIT when the parcel comes back, so the fee rule applies
  const l = statementLine(order({ status: "RETURNED", statementState: "OWED" }));
  assert.equal(l.amount.toFixed(2), "60.00");
  assert.equal(l.counts, true);
});
