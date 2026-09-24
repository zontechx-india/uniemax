// Order placement idempotency: a double-fired or retried Place Order with the
// same Idempotency-Key must create ONE order and decrement stock ONCE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const CUSTOMER = {
  name: "QA Idempotency",
  phone: "9876543210",
  email: "qa.idem@example.test",
  address: "QA street, do not ship",
  pincode: "682001",
  state: "Kerala",
  country: "India",
};

async function stockOf(fx) {
  const r = await fx.seller.req("GET", `/api/v1/stores/${fx.store.id}/products`);
  return r.body.data.find((p) => p.id === fx.productId).stockQuantity;
}

function place(buyer, fx, key) {
  return buyer.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    headers: key ? { "Idempotency-Key": key } : {},
    json: {
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: CUSTOMER,
      items: [{ productId: fx.productId, quantity: 1 }],
    },
  });
}

async function setup(t) {
  const fx = await sellerFixture();
  if (!fx.published) {
    t.skip(`test store not publishable: ${fx.publishError}`);
    return null;
  }
  // Top the stock up so this file never depends on what earlier tests used.
  await fx.seller.req("PATCH", `/api/v1/stores/${fx.store.id}/products/${fx.productId}/variants/${fx.defaultVariantId}`, {
    json: { stockQuantity: 50 },
  });
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  return { fx, buyer };
}

test("same key, sequential retry → the same order, stock decremented once", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const before = await stockOf(s.fx);
  const key = randomUUID();
  const a = await place(s.buyer, s.fx, key);
  const b = await place(s.buyer, s.fx, key);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.data.id, a.body.data.id);
  assert.equal(await stockOf(s.fx), before - 1);
});

test("same key, fired concurrently → one order, stock decremented once", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const before = await stockOf(s.fx);
  const key = randomUUID();
  const results = await Promise.all([1, 2, 3].map(() => place(s.buyer, s.fx, key)));
  for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(new Set(results.map((r) => r.body.data.id)).size, 1);
  assert.equal(await stockOf(s.fx), before - 1);
});

test("different keys → separate orders", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const a = await place(s.buyer, s.fx, randomUUID());
  const b = await place(s.buyer, s.fx, randomUUID());
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.body.data.id, b.body.data.id);
});

test("malformed key → 422", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const r = await place(s.buyer, s.fx, "bad key!");
  assert.equal(r.status, 422);
});
