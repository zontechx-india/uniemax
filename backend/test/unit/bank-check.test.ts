// Unit tests for the payout-account bank check's pure rules (bankCheck.ts),
// the seller form schema, and the `verification.updated` webhook parsing.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptsReviewUpdate,
  checkIdempotencyKey,
  holderNameForHub,
  INVALID_SELLER_NOTE,
  maskedDetails,
  payeeRefFor,
  phoneForHub,
  settlementFor,
} from "../../src/modules/stores/bankCheck.js";
import {
  bankAccountCreateSchema,
  bankAccountUpdateSchema,
} from "../../src/modules/stores/storeBank.schema.js";
import { envelopeSchema, parseEventData } from "../../src/modules/payments/paymenthub.webhook.js";

const FORM = {
  accountHolderName: "Ravi Kumar",
  accountNumber: "026291800001191",
  ifsc: "yesb0000262",
  bankName: "YES BANK",
  branch: "Santacruz",
};

test("payeeRef fits the hub's [A-Za-z0-9_-]{1,64} rule for a cuid store id", () => {
  const ref = payeeRefFor("cmvwbwplx00rdavpcpmkzx66a");
  assert.equal(ref, "store_cmvwbwplx00rdavpcpmkzx66a");
  assert.match(ref, /^[A-Za-z0-9_-]{1,64}$/);
});

test("a payeeRef in the form body is dropped — it only ever comes from the store row", () => {
  const parsed = bankAccountCreateSchema.parse({ ...FORM, payeeRef: "store_someone_else" });
  assert.equal("payeeRef" in parsed, false);
  const update = bankAccountUpdateSchema.parse({ ifsc: "YESB0000262", payeeRef: "store_x" });
  assert.equal("payeeRef" in update, false);
});

test("idempotency key: bank-verify:<storeId>:<submission>, stable per submission", () => {
  const at = new Date("2026-11-02T10:00:00.000Z");
  const key = checkIdempotencyKey("st1", "acc1", at);
  assert.equal(key, `bank-verify:st1:acc1.${at.getTime()}`);
  assert.equal(key, checkIdempotencyKey("st1", "acc1", new Date(at)));
  // An edit (or a saved answer) moves updatedAt → a new submission, a new key.
  assert.notEqual(key, checkIdempotencyKey("st1", "acc1", new Date(at.getTime() + 1)));
  assert.ok(key.length <= 255);
});

test("form: holder name follows the hub's character rule", () => {
  assert.ok(bankAccountCreateSchema.safeParse(FORM).success);
  assert.ok(bankAccountCreateSchema.safeParse({ ...FORM, accountHolderName: "A.B. Traders & Co / Unit-2" }).success);
  assert.equal(bankAccountCreateSchema.safeParse({ ...FORM, accountHolderName: "D'Souza" }).success, false);
  assert.equal(bankAccountCreateSchema.safeParse({ ...FORM, accountHolderName: "रवि" }).success, false);
});

test("form: IFSC is upper-cased; a bad IFSC is refused before any paid check", () => {
  assert.equal(bankAccountCreateSchema.parse(FORM).ifsc, "YESB0000262");
  assert.equal(bankAccountCreateSchema.safeParse({ ...FORM, ifsc: "YESB1000262" }).success, false);
});

test("form: phone is optional; spaces are removed", () => {
  assert.equal(bankAccountCreateSchema.parse(FORM).phone, null);
  assert.equal(bankAccountCreateSchema.parse({ ...FORM, phone: "98765 43210" }).phone, "9876543210");
  assert.equal(bankAccountCreateSchema.safeParse({ ...FORM, phone: "123" }).success, false);
});

test("form: an update needs a real field, not just a code", () => {
  assert.equal(bankAccountUpdateSchema.safeParse({ otp: "123456" }).success, false);
  assert.ok(bankAccountUpdateSchema.safeParse({ isPrimary: true, otp: "123456" }).success);
});

test("holder name cleaning for older saved names", () => {
  assert.equal(holderNameForHub("Ravi Kumar"), "Ravi Kumar");
  assert.equal(holderNameForHub("D'Souza, Maria"), "D Souza Maria");
  assert.equal(holderNameForHub("रवि कुमार"), null);
  assert.equal(holderNameForHub("A".repeat(150))?.length, 100);
});

test("phone for the hub: 8–13 digits or nothing", () => {
  assert.equal(phoneForHub("9876543210"), "9876543210");
  assert.equal(phoneForHub("+919876543210"), "919876543210");
  assert.equal(phoneForHub(null), undefined);
  assert.equal(phoneForHub("123"), undefined);
});

test("only VALID and INVALID settle; UNAVAILABLE is never 'invalid'", () => {
  assert.equal(settlementFor("VALID").verificationStatus, "VERIFIED");
  assert.equal(settlementFor("INVALID").verificationStatus, "FAILED");
  assert.equal(settlementFor("INVALID").verificationNote, INVALID_SELLER_NOTE);
  for (const status of ["NEEDS_REVIEW", "RETRY_LATER", "UNAVAILABLE"] as const) {
    const s = settlementFor(status);
    assert.equal(s.verificationStatus, "PENDING", status);
    assert.equal(s.notifySeller, false, status);
  }
});

test("the seller note never carries a provider reason code", () => {
  assert.doesNotMatch(INVALID_SELLER_NOTE, /FRAUD|ACCOUNT_|[A-Z]{3,}_[A-Z]/);
});

test("history snapshots keep only the last 4 digits", () => {
  const masked = maskedDetails({ ...FORM, ifsc: "YESB0000262" });
  assert.equal(masked.last4, "1191");
  assert.doesNotMatch(JSON.stringify(masked), /026291800001191/);
});

test("a review update applies only to the latest check and never over a manual decision", () => {
  assert.equal(acceptsReviewUpdate({ verificationRef: "vf_1", verificationMethod: null }, "vf_1"), true);
  assert.equal(acceptsReviewUpdate({ verificationRef: "vf_2", verificationMethod: null }, "vf_1"), false);
  assert.equal(acceptsReviewUpdate({ verificationRef: null, verificationMethod: null }, "vf_1"), false);
  assert.equal(acceptsReviewUpdate({ verificationRef: "vf_1", verificationMethod: "MANUAL" }, "vf_1"), false);
});

function envelope(data: unknown, id = "evt_1") {
  return envelopeSchema.parse({
    id,
    type: "verification.updated",
    createdAt: "2026-11-02T10:00:00.000Z",
    mode: "TEST",
    data,
  });
}

test("verification.updated parses into a verification event", () => {
  const event = parseEventData(
    envelope({
      verification: {
        id: "vf_01JABCDEFGHJKMNPQRSTVWXYZ0",
        type: "BANK_ACCOUNT",
        payeeRef: "store_abc",
        status: "VALID",
        target: "XXXX1191",
        registeredName: "RAVI KUMAR",
        nameMatch: "GOOD_PARTIAL_MATCH",
        reasonCode: "ACCOUNT_IS_VALID",
        reused: false,
      },
    }),
  );
  assert.equal(event.kind, "verification");
  if (event.kind !== "verification") return;
  assert.equal(event.verification.status, "VALID");
  assert.equal(event.verification.registeredName, "RAVI KUMAR");
});

test("verification.updated with missing optional names normalises to null", () => {
  const event = parseEventData(envelope({ verification: { id: "vf_x", payeeRef: "store_abc", status: "INVALID" } }, "evt_2"));
  assert.equal(event.kind, "verification");
  if (event.kind !== "verification") return;
  assert.equal(event.verification.registeredName, null);
  assert.equal(event.verification.reasonCode, null);
});

test("a malformed verification.updated throws (→ 400, the hub retries)", () => {
  assert.throws(() =>
    parseEventData(envelope({ verification: { id: "vf_x", payeeRef: "store_abc", status: "MAYBE" } }, "evt_3")),
  );
});
