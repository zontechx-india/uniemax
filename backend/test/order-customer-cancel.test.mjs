// A buyer may cancel their own order only while the seller has not confirmed
// it and nothing is paid; stock comes back, and nobody else can do it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const CUSTOMER = {
  name: "QA Cancel",
  phone: "9876543210",
  email: "qa.cancel@example.test",
  address: "QA street, do not ship",
  pincode: "682001",
  state: "Kerala",
  country: "India",
};

async function stockOf(fx) {
  const r = await fx.seller.req("GET", `/api/v1/stores/${fx.store.id}/products`);
  return r.body.data.find((p) => p.id === fx.productId).stockQuantity;
}

async function setup(t) {
  const fx = await sellerFixture();
  if (!fx.published) {
    t.skip(`test store not publishable: ${fx.publishError}`);
    return null;
  }
  await fx.seller.req("PATCH", `/api/v1/stores/${fx.store.id}/products/${fx.productId}/variants/${fx.defaultVariantId}`, {
    json: { stockQuantity: 50 },
  });
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const placed = await buyer.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    headers: { "Idempotency-Key": randomUUID() },
    json: {
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: CUSTOMER,
      items: [{ productId: fx.productId, quantity: 2 }],
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  return { fx, buyer, order: placed.body.data };
}

const cancelUrl = (fx, order) =>
  `/api/v1/public/stores/${fx.slug}/orders/${order.id}/cancel`;

test("buyer cancels a pending COD order → CANCELLED, stock restored, once only", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const before = await stockOf(s.fx);
  const r = await s.buyer.req("POST", cancelUrl(s.fx, s.order), { json: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.status, "CANCELLED");
  assert.equal(r.body.data.cancelledByCustomer, true);
  assert.equal(await stockOf(s.fx), before + 2);

  const again = await s.buyer.req("POST", cancelUrl(s.fx, s.order), { json: {} });
  assert.equal(again.status, 409);
});

test("after the seller confirms, the buyer can no longer cancel", async (t) => {
  const s = await setup(t);
  if (!s) return;
  const confirm = await s.fx.seller.req(
    "PATCH",
    `/api/v1/stores/${s.fx.store.id}/orders/${s.order.id}/status`,
    { json: { status: "CONFIRMED" } },
  );
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  const r = await s.buyer.req("POST", cancelUrl(s.fx, s.order), { json: {} });
  assert.equal(r.status, 409);
});

test("someone else's order: 404, not cancelled", async (t) => {
  const s = await setup(t);
  if (!s) return;
  // The seller account is a different customer from the buyer.
  const r = await s.fx.seller.req("POST", cancelUrl(s.fx, s.order), { json: {} });
  assert.equal(r.status, 404);
});
