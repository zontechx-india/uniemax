// Unit tests for seller leads' pure rules (modules/leads/leads.rules.ts):
// cart lead windows and grouping, unpaid-checkout picking, the date filter.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canContact,
  cartLeadKind,
  groupCartLeads,
  inRange,
  leadRange,
  paymentLeadState,
  pickPaymentLeads,
  type CartLineFact,
} from "../../src/modules/leads/leads.rules.js";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

test("cart lead windows: active ≤ 24 h, abandoned ≤ 30 days, older is no lead", () => {
  assert.equal(cartLeadKind(ago(1), now), "ACTIVE");
  assert.equal(cartLeadKind(ago(24), now), "ACTIVE");
  assert.equal(cartLeadKind(ago(25), now), "ABANDONED");
  assert.equal(cartLeadKind(ago(30 * 24), now), "ABANDONED");
  assert.equal(cartLeadKind(ago(30 * 24 + 1), now), null);
  assert.equal(cartLeadKind(new Date(now.getTime() + 60_000), now), "ACTIVE", "clock skew counts as now");
});

const line = (over: Partial<CartLineFact>): CartLineFact => ({
  cartId: "c1",
  quantity: 1,
  createdAt: ago(48),
  updatedAt: ago(2),
  productName: "Banana chips",
  variantName: null,
  imageKey: null,
  unitPricePaise: 10000n,
  ...over,
});

test("one lead per cart; newest activity decides the kind; value counts buyable lines", () => {
  const leads = groupCartLeads(
    [
      line({ cartId: "c1", updatedAt: ago(30), quantity: 2 }),
      line({ cartId: "c1", productName: "Jackfruit chips", createdAt: ago(72), updatedAt: ago(3), unitPricePaise: null }),
      line({ cartId: "c2", updatedAt: ago(100) }),
      line({ cartId: "c3", updatedAt: ago(24 * 40) }),
    ],
    now,
  );
  assert.deepEqual(leads.map((l) => [l.cartId, l.kind]), [["c1", "ACTIVE"], ["c2", "ABANDONED"]]);
  const c1 = leads[0]!;
  assert.equal(c1.valuePaise, 20000n, "the unbuyable line adds nothing");
  assert.equal(c1.quantity, 3);
  assert.equal(c1.lines[0]!.productName, "Jackfruit chips", "oldest line first");
  assert.deepEqual(c1.addedAt, ago(72));
  assert.ok(!("cartId" in c1.lines[0]!), "lines carry no ids");
});

test("payment leads: one per shopper, newest kept; gone once they bought", () => {
  const unpaid = [
    { id: "o1", placedAt: ago(5), customerId: "a", customerPhone: "+91 98765 43210" },
    { id: "o2", placedAt: ago(4), customerId: "a", customerPhone: "+919876543210" },
    { id: "o3", placedAt: ago(10), customerId: null, customerPhone: "9876500000" },
    { id: "o4", placedAt: ago(20), customerId: "b", customerPhone: null },
  ];
  const later = [
    { placedAt: ago(8), customerId: null, customerPhone: "+91 98765 00000" }, // o3's guest came back
    { placedAt: ago(30), customerId: "b", customerPhone: null }, // before o4 — doesn't count
  ];
  assert.deepEqual(pickPaymentLeads(unpaid, later).map((o) => o.id), ["o2", "o4"]);
});

const DAY_H = 24;

test("date filter: defaults per kind, caps how far back, none for ACTIVE", () => {
  assert.equal(leadRange("ACTIVE", { from: ago(5) }, now), null);
  assert.deepEqual(leadRange("PAYMENT_PENDING", {}, now), { from: ago(7 * DAY_H), to: null });
  assert.deepEqual(leadRange("ABANDONED", {}, now), { from: ago(30 * DAY_H), to: null });
  // Unpaid orders reach back a year (+ slack); carts only 30 days.
  assert.deepEqual(leadRange("PAYMENT_PENDING", { from: ago(90 * DAY_H) }, now)!.from, ago(90 * DAY_H));
  assert.deepEqual(leadRange("PAYMENT_PENDING", { from: ago(900 * DAY_H) }, now)!.from, ago(367 * DAY_H));
  assert.deepEqual(leadRange("ABANDONED", { from: ago(90 * DAY_H) }, now)!.from, ago(30 * DAY_H));
  const custom = leadRange("PAYMENT_PENDING", { from: ago(48), to: ago(24) }, now)!;
  assert.ok(inRange(ago(30), custom));
  assert.ok(!inRange(ago(10), custom), "after `to`");
  assert.ok(!inRange(ago(50), custom), "before `from`");
});

test("call / WhatsApp only in the first 7 days", () => {
  assert.equal(canContact(ago(1), now), true);
  assert.equal(canContact(ago(7 * DAY_H), now), true);
  assert.equal(canContact(ago(7 * DAY_H + 1), now), false);
});

test("payment lead state", () => {
  assert.equal(paymentLeadState({ status: "AWAITING_PAYMENT", paymentStatus: "PENDING" }), "PAYING");
  assert.equal(paymentLeadState({ status: "AWAITING_PAYMENT", paymentStatus: "FAILED" }), "FAILED");
  assert.equal(paymentLeadState({ status: "CANCELLED", paymentStatus: "PENDING" }), "EXPIRED");
});
