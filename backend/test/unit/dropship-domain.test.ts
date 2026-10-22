// Dropshipping Phase 2 — invite tokens, prices for sellers, the terms log and
// the request rules. Pure logic, no server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "../../src/generated/prisma/client.js";
import {
  canMoveLink,
  inviteMatches,
  daysFromNow,
  describeChange,
  diffTerms,
  discountedCost,
  hashToken,
  inviteState,
  newInviteToken,
  samePhone,
} from "../../src/package/dropship/domain.js";
import {
  inviteAcceptSchema,
  inviteCreateSchema,
  supplierProfileSchema,
  supplyBulkSchema,
} from "../../src/package/dropship/schema.js";

test("an invite token is random and only its hash is kept", () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenHash, hashToken(a.token));
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(!a.tokenHash.includes(a.token));
  assert.ok(a.token.length >= 32);
});

test("a SENT invite past its date reads as EXPIRED; other states stay", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const past = new Date("2026-10-20T09:59:59Z");
  const future = daysFromNow(14, now);
  assert.equal(inviteState({ status: "SENT", expiresAt: past }, now), "EXPIRED");
  assert.equal(inviteState({ status: "SENT", expiresAt: future }, now), "SENT");
  assert.equal(inviteState({ status: "ACCEPTED", expiresAt: past }, now), "ACCEPTED");
  assert.equal(inviteState({ status: "REVOKED", expiresAt: past }, now), "REVOKED");
  assert.equal(future.getTime() - now.getTime(), 14 * 86_400_000);
});

test("bulk: shop price − N %, rounded to paise, never negative", () => {
  assert.equal(discountedCost("999", 20).toFixed(2), "799.20");
  assert.equal(discountedCost("100.05", 33).toFixed(2), "67.03"); // 67.0335 → 67.03
  assert.equal(discountedCost("10.01", 50).toFixed(2), "5.01"); // 5.005 rounds half up
  assert.equal(discountedCost("450", 0).toFixed(2), "450.00");
  assert.equal(discountedCost(new Prisma.Decimal("0"), 90).toFixed(2), "0.00");
});

test("a link moves between ACTIVE and PAUSED; ENDED is for good (D-19)", () => {
  assert.equal(canMoveLink("ACTIVE", "PAUSED"), true);
  assert.equal(canMoveLink("PAUSED", "ACTIVE"), true);
  assert.equal(canMoveLink("ACTIVE", "ENDED"), true);
  // D-51: a link waiting for approval is approved or declined, never paused, and never re-entered.
  assert.equal(canMoveLink("PENDING", "ACTIVE"), true);
  assert.equal(canMoveLink("PENDING", "ENDED"), true);
  assert.equal(canMoveLink("PENDING", "PAUSED"), false);
  assert.equal(canMoveLink("ACTIVE", "PENDING"), false);
  assert.equal(canMoveLink("PAUSED", "ENDED"), true);
  assert.equal(canMoveLink("ENDED", "ACTIVE"), false);
  assert.equal(canMoveLink("ENDED", "PAUSED"), false);
  assert.equal(canMoveLink("ACTIVE", "ACTIVE"), false);
});

test("T-7 / T-11: only real changes are logged, each as its own row", () => {
  const current = {
    codAllowed: true,
    returnFeePayer: "SELLER",
    shippingFee: new Prisma.Decimal("60"),
    shipWithinDays: 2,
  };
  assert.deepEqual(
    diffTerms(current, {
      codAllowed: false,
      returnFeePayer: "SELLER", // same
      shippingFee: 60, // 60 vs 60.00 — same
      shipWithinDays: undefined, // not sent
    }),
    [{ field: "codAllowed", fromValue: "true", toValue: "false" }],
  );
  assert.deepEqual(diffTerms(current, { shippingFee: 0, shipWithinDays: 3 }), [
    { field: "shippingFee", fromValue: "60.00", toValue: "0" },
    { field: "shipWithinDays", fromValue: "2", toValue: "3" },
  ]);
  assert.deepEqual(diffTerms(current, {}), []);
});

test("changes read in plain words, never the internal ones", () => {
  const lines = [
    describeChange("codAllowed", "true", "false"),
    describeChange("codAllowed", null, "true"),
    describeChange("returnFeePayer", "SELLER", "SUPPLIER"),
    describeChange("shippingFee", "60.00", "0"),
    describeChange("shipWithinDays", "2", "1"),
    describeChange("returnDays", "7", "0"),
    describeChange("cost:v1", "450.00", "420.50"),
    describeChange("cost:v1", "450.00", null),
  ];
  assert.equal(lines[3], "Shipping fee changed from ₹60 to ₹0 per order");
  assert.equal(lines[4], "Ships within 1 day (was 2 days)");
  assert.equal(lines[6], "Price for sellers changed from ₹450 to ₹420.50");
  for (const line of lines) {
    assert.doesNotMatch(line, /dropship|resale|copy|link|margin|payable|RTO/i);
  }
});

test("SU-14: phones match on their last ten digits", () => {
  assert.equal(samePhone("+91 98765 43210", "9876543210"), true);
  assert.equal(samePhone("09876543210", "+919876543210"), true);
  assert.equal(samePhone("9876543210", "9876543211"), false);
  assert.equal(samePhone("12345", "12345"), false);
  assert.equal(samePhone(null, "9876543210"), false);
});

test("an invite needs both term answers — no default (D-5, D-17)", () => {
  const base = { name: "Sri Textiles", phone: "9876543210" };
  assert.equal(inviteCreateSchema.safeParse(base).success, false);
  assert.equal(inviteCreateSchema.safeParse({ ...base, codAllowed: true }).success, false);
  assert.equal(
    inviteCreateSchema.safeParse({ ...base, returnFeePayer: "SELLER" }).success,
    false,
  );
  const full = inviteCreateSchema.safeParse({
    ...base,
    codAllowed: false,
    returnFeePayer: "SUPPLIER",
  });
  assert.equal(full.success, true);
});

test("an invite needs a phone or an email", () => {
  const terms = { name: "Sri", codAllowed: true, returnFeePayer: "SELLER" };
  assert.equal(inviteCreateSchema.safeParse(terms).success, false);
  assert.equal(inviteCreateSchema.safeParse({ ...terms, email: "a@b.in" }).success, true);
  assert.equal(inviteCreateSchema.safeParse({ ...terms, phone: "9876543210" }).success, true);
});

test("accept: an existing store or a new one, never both or neither", () => {
  const profile = { shippingFee: 60, shipWithinDays: 2, returnDays: 0 };
  const newStore = {
    name: "Sri Textiles",
    phone: "9876543210",
    address: {
      line1: "12 Market Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    },
  };
  assert.equal(inviteAcceptSchema.safeParse(profile).success, false);
  assert.equal(
    inviteAcceptSchema.safeParse({ ...profile, storeId: "s1", newStore }).success,
    false,
  );
  assert.equal(inviteAcceptSchema.safeParse({ ...profile, storeId: "s1" }).success, true);
  assert.equal(inviteAcceptSchema.safeParse({ ...profile, newStore }).success, true);
  assert.equal(
    inviteAcceptSchema.safeParse({
      ...profile,
      newStore: { ...newStore, address: { ...newStore.address, pincode: "012345" } },
    }).success,
    false,
  );
});

test("supplier terms: ship within 1…max days, returns ≥ 0, fee in paise", () => {
  assert.equal(supplierProfileSchema.safeParse({ shippingFee: 60, shipWithinDays: 0, returnDays: 0 }).success, false);
  assert.equal(supplierProfileSchema.safeParse({ shippingFee: 60, shipWithinDays: 8, returnDays: 0 }).success, false);
  assert.equal(supplierProfileSchema.safeParse({ shippingFee: 60.005, shipWithinDays: 2, returnDays: 0 }).success, false);
  assert.equal(supplierProfileSchema.safeParse({ shippingFee: 0, shipWithinDays: 7, returnDays: 7 }).success, true);
  assert.equal(supplyBulkSchema.safeParse({ productIds: [], discountPct: 20 }).success, false);
  assert.equal(supplyBulkSchema.safeParse({ productIds: ["p"], discountPct: 95 }).success, false);
});

test("inviteMatches: the joiner must be who was invited, by phone or email (D-51)", () => {
  const invited = { phone: "+91 98765 43210", email: "Ravi@Example.com" };
  assert.equal(inviteMatches(invited, { phone: "9876543210", email: null }), true);
  assert.equal(inviteMatches(invited, { phone: null, email: "ravi@example.com" }), true);
  assert.equal(inviteMatches(invited, { phone: "9000000000", email: "other@example.com" }), false);
  assert.equal(inviteMatches({ phone: null, email: null }, { phone: "9876543210", email: "a@b.c" }), false);
  assert.equal(inviteMatches({ phone: "9876543210", email: null }, { phone: null, email: null }), false);
});
