// Store readiness — the one registry every gate is judged by. Pure logic, no
// server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReadiness,
  gateBlockedMessage,
  REQUIREMENTS,
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

/** A published COD shop with everything for online payment except what each test removes. */
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

// ---- ONLINE_PAYMENT reports what the bank account is waiting on -------------

test("online payment: unanswered GST is listed before the bank account it blocks", () => {
  // The production report: PAN and address saved, GST question unanswered,
  // no bank account. The Payments page used to ask only for the account,
  // which the bank page then refused to save.
  const { gates } = evaluateReadiness(ctx({ pan: PAN, gstin: null, gstExempt: false }));

  assert.equal(gates.ONLINE_PAYMENT.allowed, false);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, ["tax.gst", "payout.bankAccount"]);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockers, [
    "GST registration status",
    "Primary payout bank account",
  ]);
  // The prerequisite gate itself is unchanged.
  assert.deepEqual(gates.PAYOUT_SETUP.blockerKeys, ["tax.gst"]);
});

test("online payment: with the payout details done, only the bank account is left", () => {
  const { gates } = evaluateReadiness(ctx({ pan: PAN, gstExempt: true }));

  assert.equal(gates.PAYOUT_SETUP.allowed, true);
  assert.equal(gates.ONLINE_PAYMENT.allowed, false);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, ["payout.bankAccount"]);
});

test("online payment: a fresh profile lists the whole journey in order, PAN once", () => {
  const { gates } = evaluateReadiness(ctx({}, {}, null));

  // PAN blocks ONLINE_PAYMENT directly AND is a payout prerequisite — it
  // must still appear once, in journey order.
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, [
    "address.business",
    "tax.pan",
    "tax.gst",
    "payout.bankAccount",
  ]);
});

test("online payment: allowed once a primary account exists and the PAN is on file", () => {
  const { gates } = evaluateReadiness(
    ctx({ pan: PAN, gstExempt: true }, { hasPrimaryBankAccount: true }),
  );

  assert.equal(gates.ONLINE_PAYMENT.allowed, true);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockers, []);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, []);
});

test("online payment: a met bank account does not drag payout prerequisites back in", () => {
  // The account was added while PAYOUT_SETUP passed; the seller later
  // cleared the GST answer. That blocks adding ANOTHER account, but turning
  // online payment on never asked for GST — `after` must not change that.
  const { gates } = evaluateReadiness(
    ctx({ pan: PAN, gstin: null, gstExempt: false }, { hasPrimaryBankAccount: true }),
  );

  assert.equal(gates.PAYOUT_SETUP.allowed, false);
  assert.equal(gates.ONLINE_PAYMENT.allowed, true);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, []);
});

test("online payment: a cleared PAN blocks on its own when the account exists", () => {
  const { gates } = evaluateReadiness(
    ctx({ pan: null, gstExempt: true }, { hasPrimaryBankAccount: true }),
  );

  assert.equal(gates.ONLINE_PAYMENT.allowed, false);
  assert.deepEqual(gates.ONLINE_PAYMENT.blockerKeys, ["tax.pan"]);
});

test("online payment: the 400 message names the steps in the order to do them", () => {
  const { gates } = evaluateReadiness(ctx({ pan: PAN }));

  assert.equal(
    gateBlockedMessage("ONLINE_PAYMENT", gates.ONLINE_PAYMENT),
    "Before you can accept online payments, please add: GST registration status, Primary payout bank account.",
  );
});

// ---- Other gates are untouched -----------------------------------------------

test("publish and pickup gates list only their own requirements", () => {
  const { gates } = evaluateReadiness(
    ctx({}, { logoKey: null, productCount: 0 }, null),
  );

  assert.deepEqual(gates.PUBLISH.blockerKeys, ["store.logo", "catalog.product"]);
  assert.deepEqual(gates.PICKUP.blockerKeys, ["address.business"]);
  assert.deepEqual(gates.PAYOUT_SETUP.blockerKeys, [
    "address.business",
    "tax.pan",
    "tax.gst",
  ]);
});

test("step counts are unaffected — a prerequisite is never counted twice", () => {
  const readiness = evaluateReadiness(ctx({ pan: PAN }));
  const tax = readiness.steps.find((step) => step.key === "tax")!;

  assert.equal(tax.metCount, 1);
  assert.equal(tax.totalCount, 2);
  assert.equal(readiness.totalCount, REQUIREMENTS.length);
});

// ---- The registry itself ------------------------------------------------------

test("registry: every prerequisite comes before the requirement waiting on it", () => {
  // Blocker lists are emitted in registry order, so this is what makes
  // "first do X, then Y" read in the right order on every page.
  REQUIREMENTS.forEach((req, index) => {
    if (!req.after) return;
    const gate = req.after;
    for (const [i, other] of REQUIREMENTS.entries()) {
      if (!other.gates.includes(gate)) continue;
      assert.ok(
        i < index,
        `${other.key} (gates ${gate}) must precede ${req.key}, which waits on it`,
      );
    }
  });
});

test("registry: a requirement never waits on a gate it blocks", () => {
  for (const req of REQUIREMENTS) {
    if (req.after) assert.ok(!req.gates.includes(req.after), req.key);
  }
});
