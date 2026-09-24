// Forgiving Indian phone + PIN input: the same number/PIN typed with spaces,
// dashes, +91 or a leading 0 is accepted and stored in one canonical form;
// numbers that cannot be dialled are refused with a message saying how.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALID_ADDRESS, need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const buyer = () => webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));

test("address book: messy Indian phone/PIN are stored canonically", async () => {
  const c = await buyer();
  for (const phone of ["98765 43210", "+91 98765-43210", "098765 43210", "0091 98765 43210", "(987) 654-3210"]) {
    const r = await c.req("POST", "/api/v1/addresses", { json: { ...VALID_ADDRESS, phone, pincode: "682 001" } });
    assert.equal(r.status, 201, `${phone}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.data.phone, "+919876543210", phone);
    assert.equal(r.body.data.pincode, "682001");
    await c.req("DELETE", `/api/v1/addresses/${r.body.data.id}`);
  }
});

test("address book: numbers nobody can call are refused with a how-to message", async () => {
  const c = await buyer();
  for (const phone of ["12345", "0000000000", "98765", "phone me", "1234567890"]) {
    const r = await c.req("POST", "/api/v1/addresses", { json: { ...VALID_ADDRESS, phone } });
    assert.equal(r.status, 422, phone);
    assert.match(JSON.stringify(r.body), /10-digit mobile number/, phone);
  }
});

test("address book: a foreign address keeps its own phone format", async () => {
  const c = await buyer();
  const r = await c.req("POST", "/api/v1/addresses", {
    json: { ...VALID_ADDRESS, phone: "+44 20 7946 0958", pincode: "SW1A 1AA", state: "London", country: "United Kingdom" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.phone, "+44 20 7946 0958");
  assert.equal(r.body.data.pincode, "SW1A 1AA");
  await c.req("DELETE", `/api/v1/addresses/${r.body.data.id}`);
});

test("address edit: phone is checked and normalised too", async () => {
  const c = await buyer();
  const r = await c.req("POST", "/api/v1/addresses", { json: VALID_ADDRESS });
  const id = r.body.data.id;
  const bad = await c.req("PATCH", `/api/v1/addresses/${id}`, { json: { phone: "12345" } });
  assert.equal(bad.status, 400);
  const ok = await c.req("PATCH", `/api/v1/addresses/${id}`, { json: { phone: "0 98765 43210", pincode: "682-001" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.phone, "+919876543210");
  assert.equal(ok.body.data.pincode, "682001");
  await c.req("DELETE", `/api/v1/addresses/${id}`);
});

function order(c, fx, customer) {
  return c.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    json: {
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: { name: "QA Phone", email: "qa.phone@example.test", address: "QA, do not ship", state: "Kerala", country: "India", ...customer },
      items: [{ productId: fx.productId, quantity: 1 }],
    },
  });
}

test("checkout: '12345' is refused, messy valid input is placed and stored canonically", async (t) => {
  const fx = await sellerFixture();
  if (!fx.published) return t.skip(`test store not publishable: ${fx.publishError}`);
  await fx.seller.req("PATCH", `/api/v1/stores/${fx.store.id}/products/${fx.productId}/variants/${fx.defaultVariantId}`, {
    json: { stockQuantity: 50 },
  });
  const c = await buyer();
  const bad = await order(c, fx, { phone: "12345", pincode: "682001" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /10-digit mobile number/);
  const ok = await order(c, fx, { phone: "+91 98765-43210", pincode: "682 001" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.customerPhone, "+919876543210");
  assert.equal(ok.body.data.pincode, "682001");
});
