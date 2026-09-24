// India PIN codes: 6 digits, never starting with 0. Other countries keep a
// loose alphanumeric shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALID_ADDRESS, need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

async function buyer() {
  return webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
}

test("address book: letters as an Indian PIN are refused", async () => {
  const c = await buyer();
  const r = await c.req("POST", "/api/v1/addresses", { json: { ...VALID_ADDRESS, pincode: "ABCDEF" } });
  assert.equal(r.status, 422);
  const zero = await c.req("POST", "/api/v1/addresses", { json: { ...VALID_ADDRESS, pincode: "012345" } });
  assert.equal(zero.status, 422);
});

test("address book: valid Indian PIN and a foreign postcode are accepted", async () => {
  const c = await buyer();
  const ok = await c.req("POST", "/api/v1/addresses", { json: VALID_ADDRESS });
  assert.equal(ok.status, 201);
  const uk = await c.req("POST", "/api/v1/addresses", {
    json: { ...VALID_ADDRESS, pincode: "SW1A 1AA", state: "London", country: "United Kingdom" },
  });
  assert.equal(uk.status, 201, JSON.stringify(uk.body));
  // Pincode-only update is checked against the stored country (India).
  const bad = await c.req("PATCH", `/api/v1/addresses/${ok.body.data.id}`, { json: { pincode: "ABCDEF" } });
  assert.equal(bad.status, 400);
  for (const id of [ok.body.data.id, uk.body.data.id]) await c.req("DELETE", `/api/v1/addresses/${id}`);
});

test("checkout: letters as an Indian PIN are refused", async (t) => {
  const fx = await sellerFixture();
  if (!fx.published) return t.skip(`test store not publishable: ${fx.publishError}`);
  const c = await buyer();
  const r = await c.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    json: {
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: {
        name: "QA",
        phone: "9876543210",
        email: "qa@example.test",
        address: "QA",
        pincode: "ABCDEF",
        state: "Kerala",
        country: "India",
      },
      items: [{ productId: fx.productId, quantity: 1 }],
    },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /PIN/);
});
