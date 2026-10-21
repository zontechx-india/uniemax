// Dropshipping Phase 5 — the account (statement) rules and the hourly job's
// due-date rules. Pure logic: `npm run test:unit`. M-* refer to
// docs/dropshipping/money.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceWords,
  confirmDue,
  deliveredDue,
  lateDue,
  lineStateWords,
  owedFallbackDue,
  statementBalance,
  statementLine,
  validatePayment,
} from "../../src/package/dropship/domain.js";
import type { StatementOrder } from "../../src/package/dropship/domain.js";

/** A prepaid, delivered, counted order: supplier price 450 + 60 shipping = 510. */
const order = (over: Partial<StatementOrder> = {}): StatementOrder => ({
  status: "DELIVERED",
  statementState: "OWED",
  paymentMode: "PREPAID",
  supplierShare: "510.00",
  collectAmount: null,
  shippingFee: "60.00",
  returnFeePayer: "SELLER",
  ...over,
});
const amount = (o: StatementOrder) => statementLine(o).amount.toFixed(2);

test("prepaid, delivered: the seller owes the supplier its share", () => {
  const l = statementLine(order());
  assert.equal(l.amount.toFixed(2), "510.00");
  assert.equal(l.counts, true);
});

test("COD, delivered: the supplier owes the seller what the courier collected less the supplier's share", () => {
  // customer paid 1148 in cash; the supplier keeps 510 and owes the seller 638
  assert.equal(amount(order({ paymentMode: "COD", collectAmount: "1148.00" })), "-638.00");
});

test("COD collected less than the share: the seller owes the difference (M-3, no rounding of the gap)", () => {
  assert.equal(amount(order({ paymentMode: "COD", collectAmount: "400.00" })), "110.00");
});

test("came back: the shipping fee is owed by the seller only when the order's own terms say so (D-17, T-2)", () => {
  assert.equal(amount(order({ status: "RETURNED", returnFeePayer: "SELLER" })), "60.00");
  assert.equal(amount(order({ status: "RETURNED", returnFeePayer: "SUPPLIER" })), "0.00");
  // prepaid or COD makes no difference — the goods came back, only the fee is in play
  assert.equal(amount(order({ status: "RETURNED", paymentMode: "COD", collectAmount: "1148.00", returnFeePayer: "SELLER" })), "60.00");
});

test("void: cancelled, couldn't ship and expired orders carry nothing (M-4)", () => {
  for (const status of ["CANCELLED", "REJECTED", "EXPIRED", "AWAITING_PAYMENT"] as const) {
    const l = statementLine(order({ status, statementState: "VOID" }));
    assert.equal(l.amount.toFixed(2), "0.00", status);
    assert.equal(l.counts, false, status);
  }
  // even a stray non-void state on a dead status carries nothing
  assert.equal(amount(order({ status: "CANCELLED", statementState: "PENDING" })), "0.00");
});

test("pending and held lines show what they will be worth but don't count yet", () => {
  const pending = statementLine(order({ status: "SHIPPED", statementState: "PENDING" }));
  assert.equal(pending.amount.toFixed(2), "510.00");
  assert.equal(pending.counts, false);
  const held = statementLine(order({ statementState: "HELD" }));
  assert.equal(held.amount.toFixed(2), "510.00");
  assert.equal(held.counts, false);
});

test("balance: counted lines, less what the seller paid, plus what the supplier paid back", () => {
  const lines = [
    statementLine(order()), //                                              +510
    statementLine(order({ paymentMode: "COD", collectAmount: "1148.00" })), // −638
    statementLine(order({ status: "RETURNED" })), //                        +60
    statementLine(order({ status: "SHIPPED", statementState: "PENDING" })), // not counted
  ];
  assert.equal(statementBalance(lines, []).toFixed(2), "-68.00"); // 510 − 638 + 60
  assert.equal(statementBalance(lines, [{ direction: "SUPPLIER_TO_SELLER", amount: "68.00" }]).toFixed(2), "0.00");
  assert.equal(statementBalance(lines, [{ direction: "SELLER_TO_SUPPLIER", amount: "100" }]).toFixed(2), "-168.00");
});

test("balance: a payment moves it by exactly its amount, in either direction", () => {
  const owes = [statementLine(order())];
  assert.equal(statementBalance(owes, [{ direction: "SELLER_TO_SUPPLIER", amount: "510" }]).toFixed(2), "0.00");
  assert.equal(statementBalance(owes, [{ direction: "SELLER_TO_SUPPLIER", amount: "10" }]).toFixed(2), "500.00");
  assert.equal(statementBalance([], [{ direction: "SUPPLIER_TO_SELLER", amount: "25.50" }]).toFixed(2), "25.50");
});

test("M-5 no rounding drift: many small lines add up exactly", () => {
  const tenth = order({ supplierShare: "0.10" });
  const lines = Array.from({ length: 1000 }, () => statementLine(tenth));
  assert.equal(statementBalance(lines, []).toFixed(2), "100.00"); // floats would give 99.9999…
});

test("M-4 a line that turns void shifts the balance by itself; the next payment evens it out", () => {
  const before = [statementLine(order())];
  assert.equal(statementBalance(before, [{ direction: "SELLER_TO_SUPPLIER", amount: "510" }]).toFixed(2), "0.00");
  const after = [statementLine(order({ statementState: "VOID", status: "CANCELLED" }))];
  assert.equal(statementBalance(after, [{ direction: "SELLER_TO_SUPPLIER", amount: "510" }]).toFixed(2), "-510.00");
});

test("both sides see the same number in opposite words", () => {
  assert.equal(balanceWords("3450", "seller", "Sri Textiles"), "You owe Sri Textiles ₹3,450");
  assert.equal(balanceWords("3450", "supplier", "Lakshmi Sarees"), "Lakshmi Sarees owes you ₹3,450");
  assert.equal(balanceWords("-1200", "seller", "Sri Textiles"), "Sri Textiles owes you ₹1,200");
  assert.equal(balanceWords("-1200", "supplier", "Lakshmi Sarees"), "You owe Lakshmi Sarees ₹1,200");
  assert.equal(balanceWords("0", "seller", "Sri Textiles"), "All settled with Sri Textiles");
  assert.equal(balanceWords("-0.00", "supplier", "Lakshmi Sarees"), "All settled with Lakshmi Sarees");
});

test("a line's state in words", () => {
  assert.equal(lineStateWords("PENDING", "SHIPPED"), "Not delivered yet");
  assert.equal(lineStateWords("OWED", "DELIVERED"), "Counted");
  assert.equal(lineStateWords("OWED", "RETURNED"), "Came back");
  assert.equal(lineStateWords("HELD", "DELIVERED"), "On hold — a problem is open");
  assert.equal(lineStateWords("VOID", "CANCELLED"), "Cancelled");
});

test("a recorded payment: positive, sensible, not in the future", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  const today = new Date("2026-10-21T00:00:00Z");
  assert.equal(validatePayment({ amount: "500", paidOn: today }, now), null);
  assert.equal(validatePayment({ amount: "0", paidOn: today }, now), "Enter the amount that was paid");
  assert.equal(validatePayment({ amount: "-5", paidOn: today }, now), "Enter the amount that was paid");
  assert.match(validatePayment({ amount: "1000001", paidOn: today }, now)!, /can't be more than/);
  assert.equal(validatePayment({ amount: "10.123", paidOn: today }, now), "Use rupees and paise only");
  assert.equal(validatePayment({ amount: "500", paidOn: new Date("2026-10-25T00:00:00Z") }, now), "The payment date can't be in the future");
  // the picker's own time zone can be a day ahead of ours
  assert.equal(validatePayment({ amount: "500", paidOn: new Date("2026-10-22T05:00:00Z") }, now), null);
});

// ---- the hourly job's due rules ----------------------------------------------

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = new Date("2026-10-21T12:00:00Z");
const base = {
  status: "NEW" as const,
  shipBy: new Date(now.getTime() + 2 * DAY),
  shipWithinDays: 2,
  shippedAt: null,
  issueOpenAt: null,
  statementState: "PENDING" as const,
  confirmRemindedAt: null,
  lateNotifiedAt: null,
  deliveredRemindedAt: null,
};

test("confirm reminder: 24 h after it became new, once, supplier only (F-1)", () => {
  // it became NEW now − 25 h: shipBy = that + 2 days
  const old = { ...base, shipBy: new Date(now.getTime() - 25 * HOUR + 2 * DAY) };
  assert.equal(confirmDue(old, 24, now), true);
  assert.equal(confirmDue({ ...old, confirmRemindedAt: now }, 24, now), false, "never twice");
  const fresh = { ...base, shipBy: new Date(now.getTime() - 3 * HOUR + 2 * DAY) };
  assert.equal(confirmDue(fresh, 24, now), false);
  assert.equal(confirmDue({ ...old, status: "ACCEPTED" }, 24, now), false, "already confirmed");
  assert.equal(confirmDue({ ...old, shipBy: null }, 24, now), false);
});

test("late notice: past ship-by and not shipped, once (F-2)", () => {
  const late = { ...base, shipBy: new Date(now.getTime() - HOUR) };
  assert.equal(lateDue(late, now), true);
  assert.equal(lateDue({ ...late, status: "ACCEPTED" }, now), true);
  assert.equal(lateDue({ ...late, lateNotifiedAt: now }, now), false);
  assert.equal(lateDue({ ...late, status: "SHIPPED" }, now), false);
  assert.equal(lateDue(base, now), false);
});

test("delivered reminder: shipped N days ago, nobody marked it, once (F-10)", () => {
  const shipped = { ...base, status: "SHIPPED" as const, shippedAt: new Date(now.getTime() - 8 * DAY) };
  assert.equal(deliveredDue(shipped, 7, now), true);
  assert.equal(deliveredDue({ ...shipped, deliveredRemindedAt: now }, 7, now), false);
  assert.equal(deliveredDue({ ...shipped, shippedAt: new Date(now.getTime() - 3 * DAY) }, 7, now), false);
  assert.equal(deliveredDue({ ...shipped, status: "DELIVERED" as const }, 7, now), false);
});

test("owed fallback: shipped more than N days ago with no open problem counts as owed", () => {
  const shipped = { ...base, status: "SHIPPED" as const, shippedAt: new Date(now.getTime() - 16 * DAY) };
  assert.equal(owedFallbackDue(shipped, 15, now), true);
  assert.equal(owedFallbackDue({ ...shipped, shippedAt: new Date(now.getTime() - 14 * DAY) }, 15, now), false);
  assert.equal(owedFallbackDue({ ...shipped, issueOpenAt: now }, 15, now), false, "an open problem holds it");
  assert.equal(owedFallbackDue({ ...shipped, statementState: "OWED" as const }, 15, now), false, "already counted");
  assert.equal(owedFallbackDue({ ...shipped, statementState: "HELD" as const }, 15, now), false);
});
