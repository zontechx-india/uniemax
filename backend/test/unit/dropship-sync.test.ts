// Dropshipping Phase 3 — pricing, earnings and the sync decision for one
// copy (planSync). Pure logic, no server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addOnTop,
  deliveryCharge,
  deliveryLabel,
  earnings,
  planSync,
  priceProblem,
  suggestedPrice,
} from "../../src/package/dropship/domain.js";
import type { SyncInput } from "../../src/package/dropship/domain.js";

/** A live follow-price copy of a one-option product: cost 450, price 699, MRP 999. */
function base(): SyncInput {
  return {
    resale: { followCost: true, state: "ACTIVE", pauseReason: null, resumeOnClear: false },
    copy: {
      isActive: true,
      hasImage: true,
      variants: [{ variantId: "cv1", supplyVariantId: "sv1", lastCost: "450.00", price: "699.00" }],
    },
    source: {
      isActive: true,
      optionTypes: [{ name: "Colour", values: ["Red", "Blue"] }],
      deliveryRule: { type: "ALL", pincodes: [] },
      variants: [
        { id: "sv1", name: "Red", isActive: true, compareAtPrice: "999.00", stock: 7, optionValues: { Colour: "Red" } },
        { id: "sv2", name: "Blue", isActive: true, compareAtPrice: "999.00", stock: 3, optionValues: { Colour: "Blue" } },
      ],
    },
    supply: { isOpen: true, variants: [{ variantId: "sv1", cost: "450.00", isOpen: true }] },
    supplierActive: true,
    supplierStoreActive: true,
    linkActive: true,
    codAllowed: true,
  };
}

/** Apply a plan's results back onto its input, as the service does. */
function applied(input: SyncInput, plan: ReturnType<typeof planSync>): SyncInput {
  const lastCosts = new Map(plan.lastCosts.map((l) => [l.variantId, l.lastCost]));
  const prices = new Map(plan.copy.variants.map((v) => [v.variantId, v.price]));
  return {
    ...input,
    resale: { ...input.resale, ...plan.resale },
    copy: {
      ...input.copy,
      isActive: plan.copy.isActive ?? input.copy.isActive,
      variants: input.copy.variants.map((v) => ({
        ...v,
        lastCost: lastCosts.get(v.variantId) ?? v.lastCost,
        price: prices.get(v.variantId) ?? v.price,
      })),
    },
  };
}

const withCost = (input: SyncInput, cost: string): SyncInput => ({
  ...input,
  supply: { isOpen: true, variants: [{ variantId: "sv1", cost, isOpen: true }] },
});

test("mirrors stock, names, the used option values, delivery area and COD", () => {
  const plan = planSync({ ...base(), codAllowed: false });
  const v = plan.copy.variants[0]!;
  assert.equal(v.stockQuantity, 7);
  assert.equal(v.name, "Red");
  assert.equal(v.compareAtPrice, "999.00");
  assert.deepEqual(plan.copy.optionTypes, [{ name: "Colour", values: ["Red"] }]);
  assert.equal(plan.copy.codAvailable, false);
  assert.equal(plan.stateChanged, null);
  assert.equal(plan.copy.isActive, undefined);
});

test("C-1 follow on: a price rise moves the price by the same amount", () => {
  const plan = planSync(withCost(base(), "520.00"));
  assert.equal(plan.copy.variants[0]!.price, "769.00");
  assert.deepEqual(plan.lastCosts, [{ variantId: "cv1", lastCost: "520.00" }]);
  assert.equal(plan.priceChanges[0]!.capped, false);
});

test("C-21 the same change applied twice changes nothing the second time", () => {
  const input = withCost(base(), "520.00");
  const first = planSync(input);
  const second = planSync(applied(input, first));
  assert.equal(second.copy.variants[0]!.price, "769.00");
  assert.deepEqual(second.lastCosts, []);
  assert.deepEqual(second.priceChanges, []);
});

test("C-2 follow on: a price drop lowers the price; earnings stay", () => {
  const plan = planSync(withCost(base(), "400.00"));
  assert.equal(plan.copy.variants[0]!.price, "649.00");
});

test("C-18 a follow-price rise stops at MRP and says so", () => {
  const plan = planSync(withCost(base(), "800.00"));
  assert.equal(plan.copy.variants[0]!.price, "999.00");
  assert.equal(plan.priceChanges[0]!.capped, true);
  // D-35: at MRP there is no strike-through.
  assert.equal(plan.copy.variants[0]!.compareAtPrice, null);
});

test("C-18 the cost itself above MRP pauses the copy", () => {
  const plan = planSync(withCost(base(), "1100.00"));
  assert.equal(plan.resale.state, "PAUSED");
  assert.equal(plan.resale.pauseReason, "COST_ABOVE_PRICE");
});

test("C-1 follow off: cost above the price pauses; the fixed price and lastCost stay", () => {
  const input = withCost({ ...base(), resale: { ...base().resale, followCost: false } }, "720.00");
  const plan = planSync(input);
  assert.equal(plan.copy.variants[0]!.price, "699.00");
  assert.deepEqual(plan.lastCosts, []);
  assert.equal(plan.copy.isActive, false);
  assert.deepEqual(plan.resale, { state: "PAUSED", pauseReason: "COST_ABOVE_PRICE", resumeOnClear: true });
  assert.equal(plan.stateChanged, "PAUSED");
  assert.equal(plan.copy.variants[0]!.stockQuantity, 0);
});

test("C-5 / C-6 / C-7 each pause with their own reason", () => {
  const removed = planSync({ ...base(), source: null });
  assert.equal(removed.resale.pauseReason, "SOURCE_REMOVED");
  const closed = planSync({ ...base(), supply: { ...base().supply!, isOpen: false } });
  assert.equal(closed.resale.pauseReason, "SUPPLY_CLOSED");
  const supplier = planSync({ ...base(), supplierStoreActive: false });
  assert.equal(supplier.resale.pauseReason, "SUPPLIER_INACTIVE");
  const link = planSync({ ...base(), linkActive: false, supplierActive: false });
  assert.equal(link.resale.pauseReason, "LINK_INACTIVE");
});

test("C-5 a removed option pauses only that option", () => {
  const input = base();
  input.copy.variants.push({ variantId: "cv2", supplyVariantId: "sv2", lastCost: "450.00", price: "699.00" });
  input.supply!.variants.push({ variantId: "sv2", cost: "450.00", isOpen: true });
  input.source!.variants = input.source!.variants.filter((v) => v.id !== "sv2");
  const plan = planSync(input);
  assert.equal(plan.resale.state, "ACTIVE");
  assert.equal(plan.copy.variants.find((v) => v.variantId === "cv2")!.isActive, false);
});

test("a pause clearing switches a copy back on only if the system switched it off", () => {
  const paused: SyncInput = {
    ...base(),
    resale: { followCost: true, state: "PAUSED", pauseReason: "LINK_INACTIVE", resumeOnClear: true },
    copy: { ...base().copy, isActive: false },
  };
  const resumed = planSync(paused);
  assert.equal(resumed.copy.isActive, true);
  assert.equal(resumed.stateChanged, "RESUMED");
  assert.deepEqual(resumed.resale, { state: "ACTIVE", pauseReason: null, resumeOnClear: false });

  // C-15: the seller had switched it off — it stays off.
  const stayOff = planSync({ ...paused, resale: { ...paused.resale, resumeOnClear: false } });
  assert.equal(stayOff.copy.isActive, undefined);
  assert.equal(stayOff.resale.state, "ACTIVE");
});

test("a copy already off when paused is not switched on later", () => {
  const plan = planSync({ ...base(), linkActive: false, copy: { ...base().copy, isActive: false } });
  assert.equal(plan.resale.resumeOnClear, false);
  assert.equal(plan.copy.isActive, undefined);
});

test("pricing: the suggestion, add on top, the MRP cap and the price bounds (C-3)", () => {
  assert.equal(suggestedPrice({ cost: 450, shopPrice: 699, mrp: 999, markupPct: 30 }).toFixed(2), "699.00");
  assert.equal(suggestedPrice({ cost: 450, shopPrice: 400, mrp: null, markupPct: 30 }).toFixed(2), "585.00");
  assert.equal(suggestedPrice({ cost: 450, shopPrice: null, mrp: 500, markupPct: 30 }).toFixed(2), "500.00");
  assert.equal(addOnTop(450, { amount: 120 }, null).toFixed(2), "570.00");
  assert.equal(addOnTop(450, { percent: 33 }, null).toFixed(2), "599.00");
  assert.equal(addOnTop(450, { percent: 200 }, 999).toFixed(2), "999.00");
  assert.equal(priceProblem(699, 450, 999), null);
  assert.equal(priceProblem(449, 450, 999), "Price must be between ₹450 (supplier price) and ₹999 (MRP).");
  assert.equal(priceProblem(1000, 450, 999), "Price must be between ₹450 (supplier price) and ₹999 (MRP).");
  assert.equal(priceProblem(400, 450, null), "Price must be at least ₹450 (supplier price).");
});

test("the result line uses this store's delivery charge and the platform fee", () => {
  const flat = { type: "FLAT" as const, amount: 49, freeAbove: 1000 };
  assert.equal(deliveryCharge(flat, 699).toFixed(2), "49.00");
  assert.equal(deliveryCharge(flat, 1200).toFixed(2), "0.00");
  assert.equal(deliveryCharge({ type: "FREE", amount: 0, freeAbove: null }, 5).toFixed(2), "0.00");
  const e = earnings({ price: 699, cost: 450, delivery: 49, supplierShipping: 60, platformFeePct: 2 });
  assert.equal(e.customerPays.toFixed(2), "748.00");
  assert.equal(e.supplierGets.toFixed(2), "510.00");
  assert.equal(e.fee.toFixed(2), "14.96");
  assert.equal(e.youEarn.toFixed(2), "223.04");
  // C-23: negative earnings are reported, not refused.
  assert.ok(earnings({ price: 460, cost: 450, delivery: 0, supplierShipping: 60, platformFeePct: 0 }).youEarn.isNegative());
});

test("D-33 delivery areas in plain words", () => {
  assert.equal(deliveryLabel({ type: "ALL", pincodes: [] }), "All India");
  assert.equal(deliveryLabel({ type: "INCLUDE", pincodes: ["682001", "682002"] }), "2 PIN codes");
  assert.equal(deliveryLabel({ type: "EXCLUDE", pincodes: ["682001"] }), "All India except 1 PIN code");
});
