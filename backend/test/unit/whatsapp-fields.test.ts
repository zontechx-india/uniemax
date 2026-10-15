// Mappings: how one campaign's template is filled per recipient from their fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanParam, interpolate, isTrackingUrl, mappingSchema, resolveMapping, resolveValue } from "../../src/modules/whatsapp/whatsapp.fields.js";
import { toWaId } from "../../src/modules/whatsapp/whatsapp.webhook.js";

test("interpolate: fields fill their braces; empty ones are reported", () => {
  assert.deepEqual(interpolate("{store_slug}/products", { store_slug: "sabse-kart" }), { text: "sabse-kart/products", missing: [] });
  assert.deepEqual(interpolate("Hi {seller_name}", { seller_name: "  " }), { text: "Hi ", missing: ["seller_name"] });
  assert.deepEqual(interpolate("no fields", {}), { text: "no fields", missing: [] });
});

test("resolveValue: fallback only when a field is empty; null when nothing fits", () => {
  assert.equal(resolveValue({ value: "{seller_name}", fallback: "there" }, { seller_name: "Rahul" }), "Rahul");
  assert.equal(resolveValue({ value: "{seller_name}", fallback: "there" }, { seller_name: "" }), "there");
  assert.equal(resolveValue({ value: "{seller_name}" }, {}), null);
  assert.equal(resolveValue({ value: "Diwali sale" }, {}), "Diwali sale");
});

test("cleanParam: Meta's no-newline / no-tab / no-run-of-spaces rule", () => {
  assert.equal(cleanParam("Products,\n  Address\t and    Tax"), "Products, Address and Tax");
});

test("resolveMapping: names the slots it couldn't fill", () => {
  const mapping = mappingSchema.parse({
    body: [{ value: "{seller_name}", fallback: "there" }, { value: "{store_name}" }],
    buttons: [{ value: "{store_slug}/products" }, { value: "https://uniemax.com/store/{store_slug}", track: true }],
  });
  const ok = resolveMapping(mapping, { seller_name: "", store_name: "Sabse Kart", store_slug: "sabse-kart" });
  assert.deepEqual(ok.bodyParams, ["there", "Sabse Kart"]);
  assert.deepEqual(ok.buttons, [
    { value: "sabse-kart/products", track: false },
    { value: "https://uniemax.com/store/sabse-kart", track: true },
  ]);
  assert.deepEqual(ok.unfilled, []);
  const bad = resolveMapping(mapping, { store_slug: "" });
  assert.deepEqual(bad.unfilled, ["{{2}}", "button 1", "button 2"]);
});

test("isTrackingUrl: only a template link that ends in the redirect path counts clicks", () => {
  assert.equal(isTrackingUrl("https://uniemax.com/api/v1/r/{{1}}"), true);
  assert.equal(isTrackingUrl("https://uniemax.com/mystores/{{1}}"), false);
});

test("toWaId: common spellings become wa_id; ambiguous numbers don't", () => {
  assert.equal(toWaId("98765 43210"), "919876543210");
  assert.equal(toWaId("+91 98765-43210"), "919876543210");
  assert.equal(toWaId("098765 43210"), "919876543210");
  assert.equal(toWaId("0091 9876543210"), "919876543210");
  assert.equal(toWaId("+1 415 555 0100"), "14155550100");
  assert.equal(toWaId("2234567890"), null); // 10 digits, not a mobile: country unknown
  assert.equal(toWaId("12345"), null);
});
