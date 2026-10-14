// Store readiness — the one registry every gate is judged by. Pure logic, no
// server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReadiness,
  gateBlockedMessage,
  REQUIREMENTS,
  summariseReadiness,
  type ReadinessContext,
} from "../../src/modules/stores/storeReadiness.js";
import { resolveProfile } from "../../src/modules/stores/storeProfile.schema.js";

const ADDRESS = {
  line1: "No.9, MRG nagar, Thoraipakkam",
  line2: null,
  city: "Kanchipuram",
  state: "Tamil Nadu",
  pincode: "600097",
  country: "India",
  lat: null,
  lng: null,
};

/** A published COD shop; each test removes or adds what it is about. */
function ctx(
  tax: Record<string, unknown>,
  overrides: Partial<ReadinessContext> = {},
  address: unknown = ADDRESS,
): ReadinessContext {
  return {
    name: "ZoneMax",
    logoKey: "store-logo/zonemax/logo.webp",
    profile: resolveProfile({
      businessName: "ZoneMax store",
      sellerName: "Test Seller",
      phone: "9876543210",
      email: "seller@example.com",
      address,
      tax,
    }),
    categoryCount: 2,
    productCount: 5,
    hasPrimaryBankAccount: false,
    ...overrides,
  };
}

const PAN = "ABCDE1234F";
const NO_TAX = { pan: null, gstin: null, gstExempt: false };

// ---- Bank account: only the address --------------------------------------------

test("bank account: GST left unanswered no longer blocks it", () => {
  // The production report: address and PAN saved, GST question unanswered.
  // The bank page sent the seller to Business details for a field the form
  // calls optional.
  const { gates } = evaluateReadiness(ctx({ pan: PAN, gstin: null, gstExempt: false }));

  assert.equal(gates.PAYOUT_SETUP.allowed, true);
  assert.deepEqual(gates.PAYOUT_SETUP.blockerKeys, []);
});

test("bank account: no PAN and no GST still allowed — both are optional", () => {
  const { gates } = evaluateReadiness(ctx(NO_TAX));

  assert.equal(gates.PAYOUT_SETUP.allowed, true);
});

test("bank account: the business address is the one thing it needs", () => {
  const { gates } = evaluateReadiness(ctx(NO_TAX, {}, null));

  assert.equal(gates.PAYOUT_SETUP.allowed, false);
  assert.deepEqual(gates.PAYOUT_SETUP.blockerKeys, ["address.business"]);
  assert.equal(
    gateBlockedMessage("PAYOUT_SETUP", gates.PAYOUT_SETUP),
    "Before you can add a payout bank account, please add: Business address.",
  );
});

// ---- Online payment: only the bank account -------------------------------------

test("online payment: needs just a primary bank account", () => {
  const { gates } = evaluateReadiness(ctx({ pan: PAN }));

  assert.equal(gates.ONLINE_PAYMENT.allowed, false);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, ["payout.bankAccount"]);
  assert.equal(
    gateBlockedMessage("ONLINE_PAYMENT", gates.ONLINE_PAYMENT),
    "Before you can accept online payments, please add: Primary payout bank account.",
  );
});

test("online payment: a missing address is not listed — the bank page asks for it", () => {
  // One place to go: Payments points at Bank account, and the bank page
  // collects the address itself before the account.
  const { gates } = evaluateReadiness(ctx(NO_TAX, {}, null));

  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, ["payout.bankAccount"]);
});

test("online payment: allowed with a primary account and no PAN or GST", () => {
  const { gates } = evaluateReadiness(ctx(NO_TAX, { hasPrimaryBankAccount: true }));

  assert.equal(gates.ONLINE_PAYMENT.allowed, true);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockers, []);
});

// ---- Tax details are optional everywhere ---------------------------------------

test("tax: no requirement reads the PAN, the GSTIN or the GST declaration", () => {
  assert.deepEqual(
    REQUIREMENTS.filter((req) => req.step === "tax").map((req) => req.key),
    [],
  );
  // Filling them in or not changes no gate.
  const empty = evaluateReadiness(ctx(NO_TAX, { hasPrimaryBankAccount: true }));
  const full = evaluateReadiness(
    ctx({ pan: PAN, gstin: "33ABCDE1234F1Z5", gstExempt: false }, { hasPrimaryBankAccount: true }),
  );
  assert.deepEqual(empty.gates, full.gates);
});

test("tax: the step counts nothing, so it is never 'still to do'", () => {
  const readiness = evaluateReadiness(ctx(NO_TAX));
  const tax = readiness.steps.find((step) => step.key === "tax")!;

  assert.equal(tax.totalCount, 0);
  assert.equal(tax.complete, true);
  assert.ok(!summariseReadiness(readiness).pending.some((step) => step.key === "tax"));
});

// ---- Other gates are untouched ---------------------------------------------------

test("publish and pickup gates are unchanged", () => {
  const { gates } = evaluateReadiness(
    ctx(NO_TAX, { logoKey: null, productCount: 0 }, null),
  );

  assert.deepEqual(gates.PUBLISH.blockerKeys, ["store.logo", "catalog.product"]);
  assert.deepEqual(gates.PICKUP.blockerKeys, ["address.business"]);
});

test("a complete store: every gate open, every requirement met", () => {
  const readiness = evaluateReadiness(ctx(NO_TAX, { hasPrimaryBankAccount: true }));

  assert.equal(readiness.complete, true);
  assert.equal(readiness.metCount, REQUIREMENTS.length);
  for (const gate of Object.values(readiness.gates)) assert.equal(gate.allowed, true, gate.gate);
});
