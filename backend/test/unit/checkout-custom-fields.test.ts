// A store's own checkout questions (Post Office, Tehsil…) — the seller's
// settings schema, the stored-JSON resolver and the order-side answer check.
// Pure logic, no server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCheckoutFields,
  storeCheckoutUpdateSchema,
  type CheckoutCustomField,
} from "../../src/modules/stores/stores.schema.js";
import {
  collectCustomAnswers,
  readOrderCustomFields,
} from "../../src/modules/orders/customFields.js";

const POST_OFFICE: CheckoutCustomField = {
  id: "qpostoffice1",
  label: "Post Office",
  description: null,
  type: "TEXT",
  section: "DELIVERY",
  required: true,
  choices: [],
};
const FAMILY: CheckoutCustomField = {
  id: "qfamily0001",
  label: "Family size",
  description: null,
  type: "NUMBER",
  section: "CONTACT",
  required: false,
  choices: [],
};
const SLOT: CheckoutCustomField = {
  id: "qslot000001",
  label: "Delivery time",
  description: null,
  type: "CHOICE",
  section: "DELIVERY",
  required: false,
  choices: ["Morning", "Evening"],
};

test("settings: a list question needs 2+ options; ids must be unique", () => {
  const oneChoice = storeCheckoutUpdateSchema.safeParse({
    customFields: [{ ...SLOT, choices: ["Morning"] }],
  });
  assert.equal(oneChoice.success, false);

  const dupes = storeCheckoutUpdateSchema.safeParse({
    customFields: [POST_OFFICE, { ...POST_OFFICE, label: "Tehsil" }],
  });
  assert.equal(dupes.success, false);

  const ok = storeCheckoutUpdateSchema.parse({
    customFields: [{ ...POST_OFFICE, choices: ["ignored"] }, SLOT],
  });
  // Options only belong to list questions.
  assert.deepEqual(ok.customFields?.[0].choices, []);
});

test("settings: a blank title is refused, more than 10 questions too", () => {
  assert.equal(
    storeCheckoutUpdateSchema.safeParse({ customFields: [{ ...POST_OFFICE, label: "  " }] }).success,
    false,
  );
  const eleven = Array.from({ length: 11 }, (_, i) => ({ ...POST_OFFICE, id: `qmany${i}000` }));
  assert.equal(storeCheckoutUpdateSchema.safeParse({ customFields: eleven }).success, false);
});

test("resolver: old stores get no questions; a broken stored question is dropped", () => {
  assert.deepEqual(resolveCheckoutFields({ email: false }).customFields, []);
  assert.equal(resolveCheckoutFields({ email: false }).email, false);
  const resolved = resolveCheckoutFields({
    customFields: [POST_OFFICE, { id: "x", label: 5 }, POST_OFFICE],
  });
  assert.deepEqual(resolved.customFields.map((f) => f.id), [POST_OFFICE.id]);
});

test("answers: required delivery question is enforced only for delivery", () => {
  assert.throws(
    () => collectCustomAnswers([POST_OFFICE], {}, true),
    /Post Office is required/,
  );
  // Pickup skips delivery questions entirely.
  assert.deepEqual(collectCustomAnswers([POST_OFFICE], {}, false), []);
});

test("answers: number and list types are checked; label is snapshotted", () => {
  assert.throws(
    () => collectCustomAnswers([FAMILY], { [FAMILY.id]: "four" }, true),
    /must be a number/,
  );
  assert.throws(
    () => collectCustomAnswers([SLOT], { [SLOT.id]: "Night" }, true),
    /Pick one of the options/,
  );
  const out = collectCustomAnswers(
    [POST_OFFICE, FAMILY, SLOT],
    { [POST_OFFICE.id]: "  Kalady  ", [FAMILY.id]: "4", unknown: "ignored" },
    true,
  );
  assert.deepEqual(out, [
    { id: POST_OFFICE.id, label: "Post Office", section: "DELIVERY", value: "Kalady" },
    { id: FAMILY.id, label: "Family size", section: "CONTACT", value: "4" },
  ]);
  assert.deepEqual(readOrderCustomFields(out), out);
  assert.deepEqual(readOrderCustomFields(null), []);
});
