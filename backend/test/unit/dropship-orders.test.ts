// Dropshipping Phase 4 — the supplier-order rules: who may move an order where,
// the amounts, the one-parcel COD rule, the rollup to the customer order, and
// the late / data cut-off checks. Pure logic: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOLDS_STOCK,
  ORDER_MOVES,
  canMove,
  cantShipText,
  customerDataHidden,
  isLate,
  moveRefusal,
  onePlace,
  orderEarnings,
  platformFeeFor,
  rollup,
  shipByDate,
  supplierAmounts,
} from "../../src/package/dropship/domain.js";
import type { OrderMove, SupplierOrderStatus } from "../../src/package/dropship/domain.js";

const ALL: SupplierOrderStatus[] = [
  "AWAITING_PAYMENT",
  "EXPIRED",
  "NEW",
  "ACCEPTED",
  "SHIPPED",
  "DELIVERED",
  "REJECTED",
  "CANCELLED",
  "RETURNED",
];

test("the transition table: every move allows exactly its own states and actors", () => {
  const expected: Record<OrderMove, { from: SupplierOrderStatus[]; who: string }> = {
    paid: { from: ["AWAITING_PAYMENT"], who: "SYSTEM" },
    expire: { from: ["AWAITING_PAYMENT"], who: "SYSTEM" },
    repaid: { from: ["EXPIRED"], who: "SYSTEM" },
    repaidSoldOut: { from: ["EXPIRED"], who: "SYSTEM" },
    cancel: { from: ["AWAITING_PAYMENT", "EXPIRED", "NEW", "ACCEPTED"], who: "SYSTEM" },
    confirm: { from: ["NEW"], who: "SUPPLIER" },
    ship: { from: ["NEW", "ACCEPTED"], who: "SUPPLIER" },
    cantShip: { from: ["NEW", "ACCEPTED"], who: "SUPPLIER" },
    delivered: { from: ["SHIPPED"], who: "SUPPLIER" },
    cameBack: { from: ["SHIPPED"], who: "SUPPLIER" },
  };
  for (const move of Object.keys(ORDER_MOVES) as OrderMove[]) {
    for (const status of ALL) {
      assert.equal(
        canMove(move, status, expected[move].who as never),
        expected[move].from.includes(status),
        `${move} from ${status}`,
      );
    }
  }
});

test("only the right person moves an order: a supplier can't pay, the system can't ship", () => {
  assert.equal(canMove("ship", "NEW", "SELLER"), false);
  assert.equal(canMove("ship", "NEW", "SYSTEM"), false);
  assert.equal(canMove("paid", "AWAITING_PAYMENT", "SUPPLIER"), false);
  assert.equal(canMove("cancel", "NEW", "SUPPLIER"), false);
});

test("delivered: the supplier or the seller may mark it (F-10), nobody else", () => {
  assert.equal(canMove("delivered", "SHIPPED", "SUPPLIER"), true);
  assert.equal(canMove("delivered", "SHIPPED", "SELLER"), true);
  assert.equal(canMove("delivered", "SHIPPED", "SYSTEM"), false);
  assert.equal(canMove("delivered", "NEW", "SELLER"), false);
});

test("a finished order can't be moved again", () => {
  for (const done of ["DELIVERED", "REJECTED", "CANCELLED", "RETURNED"] as SupplierOrderStatus[]) {
    for (const move of Object.keys(ORDER_MOVES) as OrderMove[]) {
      for (const who of ["SUPPLIER", "SELLER", "SYSTEM"] as const) {
        assert.equal(canMove(move, done, who), false, `${move} on ${done} by ${who}`);
      }
    }
  }
});

test("stock is held while awaiting payment, new or accepted — never after", () => {
  assert.deepEqual([...HOLDS_STOCK].sort(), ["ACCEPTED", "AWAITING_PAYMENT", "NEW"]);
});

test("refusal words: a cancelled order says so (F-16), anything else says refresh (F-11)", () => {
  assert.equal(moveRefusal("CANCELLED"), "This order was cancelled.");
  assert.equal(moveRefusal("SHIPPED"), "This order was just updated — refresh.");
});

test("amounts: supplierShare = Σ unit cost × qty + shipping fee", () => {
  const a = supplierAmounts(
    [
      { unitCost: "450.00", quantity: 2 },
      { unitCost: "99.50", quantity: 1 },
    ],
    "60",
  );
  assert.equal(a.costTotal.toFixed(2), "999.50");
  assert.equal(a.shippingFee.toFixed(2), "60.00");
  assert.equal(a.supplierShare.toFixed(2), "1059.50");
});

test("a free-shipping supplier: share is just the cost", () => {
  assert.equal(supplierAmounts([{ unitCost: 450, quantity: 1 }], 0).supplierShare.toFixed(2), "450.00");
});

test("platform fee follows the rate in force, rounded to paise (T-12)", () => {
  assert.equal(platformFeeFor("748", 2).toFixed(2), "14.96");
  assert.equal(platformFeeFor("748", 0).toFixed(2), "0.00");
});

test("ship by = when it became new + the snapshotted days (T-6)", () => {
  const from = new Date("2026-10-21T10:00:00Z");
  assert.equal(shipByDate(from, 2).toISOString(), "2026-10-23T10:00:00.000Z");
  assert.equal(shipByDate(from, 0).toISOString(), from.toISOString());
});

test("COD only when the whole order is one parcel (D-13)", () => {
  assert.equal(onePlace([{ supplierId: "a" }, { supplierId: "a" }]), true); // one supplier
  assert.equal(onePlace([{ supplierId: null }, { supplierId: null }]), true); // all the seller's own
  assert.equal(onePlace([{ supplierId: "a" }, { supplierId: "b" }]), false); // two suppliers
  assert.equal(onePlace([{ supplierId: "a" }, { supplierId: null }]), false); // supplier + own
  assert.equal(onePlace([]), true);
});

test("late: only an order still to ship, past its ship-by (F-2)", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const past = new Date("2026-10-20T12:00:00Z");
  const future = new Date("2026-10-22T12:00:00Z");
  assert.equal(isLate({ status: "NEW", shipBy: past }, now), true);
  assert.equal(isLate({ status: "ACCEPTED", shipBy: past }, now), true);
  assert.equal(isLate({ status: "NEW", shipBy: future }, now), false);
  assert.equal(isLate({ status: "SHIPPED", shipBy: past }, now), false);
  assert.equal(isLate({ status: "AWAITING_PAYMENT", shipBy: null }, now), false);
});

test("customer data stays visible until N days after closing, then hides (F-12)", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  assert.equal(customerDataHidden(null, 30, now), false); // still open
  assert.equal(customerDataHidden(new Date("2026-11-10T00:00:00Z"), 30, now), false); // 20 days
  assert.equal(customerDataHidden(new Date("2026-10-20T00:00:00Z"), 30, now), true); // 41 days
});

// ---- the rollup to the customer order ---------------------------------------

const parts = (...status: SupplierOrderStatus[]) => status.map((s) => ({ status: s }));

test("rollup: a supplier-only order is confirmed once every part is confirmed or further", () => {
  assert.equal(rollup({ hasOwnItems: false, parts: parts("NEW") }), "wait");
  assert.equal(rollup({ hasOwnItems: false, parts: parts("ACCEPTED") }), "confirm");
  assert.equal(rollup({ hasOwnItems: false, parts: parts("ACCEPTED", "NEW") }), "wait");
  assert.equal(rollup({ hasOwnItems: false, parts: parts("SHIPPED") }), "confirm");
});

test("rollup: a mixed order is the seller's to confirm", () => {
  assert.equal(rollup({ hasOwnItems: true, parts: parts("ACCEPTED") }), "wait");
});

test("rollup: can't ship on a supplier-only order cancels it (F-3)", () => {
  assert.equal(rollup({ hasOwnItems: false, parts: parts("REJECTED") }), "cancel");
  assert.equal(rollup({ hasOwnItems: false, parts: parts("REJECTED", "NEW") }), "cancel");
});

test("rollup: can't ship on a mixed order asks the seller (partial cancel is Phase 7)", () => {
  assert.equal(rollup({ hasOwnItems: true, parts: parts("REJECTED") }), "askSeller");
});

test("rollup: a parcel that already went out blocks the cancel (F-4)", () => {
  assert.equal(rollup({ hasOwnItems: false, parts: parts("REJECTED", "SHIPPED") }), "wait");
  assert.equal(rollup({ hasOwnItems: false, parts: parts("RETURNED", "DELIVERED") }), "askSeller");
});

test("rollup: a parcel that came back cancels a supplier-only order, asks on a mixed one", () => {
  assert.equal(rollup({ hasOwnItems: false, parts: parts("RETURNED") }), "cancel");
  assert.equal(rollup({ hasOwnItems: true, parts: parts("RETURNED") }), "askSeller");
});

test("rollup: nothing to decide with no parts", () => {
  assert.equal(rollup({ hasOwnItems: false, parts: [] }), "wait");
});

test("earnings on an order: lines (+ delivery on a supplier-only order) − supplier share − fee (D-38)", () => {
  // 699 line + 50 delivery − (450 + 60) − 15 = 224
  assert.equal(
    orderEarnings({ linesTotal: 699, deliveryCharge: 50, supplierShare: 510, platformFee: 15 }).toFixed(2),
    "224.00",
  );
  // a mixed order: the delivery charge isn't the supplier part's
  assert.equal(
    orderEarnings({ linesTotal: 699, deliveryCharge: 0, supplierShare: 510, platformFee: 0 }).toFixed(2),
    "189.00",
  );
  // it can be a loss (shown red, never blocked)
  assert.equal(
    orderEarnings({ linesTotal: 480, deliveryCharge: 0, supplierShare: 510, platformFee: 0 }).toFixed(2),
    "-30.00",
  );
});

test("can't-ship reasons read as the supplier chose them", () => {
  assert.equal(cantShipText("OUT_OF_STOCK", null), "Out of stock");
  assert.equal(cantShipText("PINCODE", null), "Can't deliver to this pincode");
  assert.equal(cantShipText("OTHER", "Courier strike"), "Other: Courier strike");
});
