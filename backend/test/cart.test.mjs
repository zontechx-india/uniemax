// The durable cart never stores more of a variant than is in stock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

async function setStock(fx, n) {
  const r = await fx.seller.req(
    "PATCH",
    `/api/v1/stores/${fx.store.id}/products/${fx.productId}/variants/${fx.defaultVariantId}`,
    { json: { stockQuantity: n } },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

test("replace: quantity above stock is capped at stock", async (t) => {
  const fx = await sellerFixture();
  if (!fx.published) return t.skip(`test store not publishable: ${fx.publishError}`);
  await setStock(fx, 7);
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const r = await buyer.req("PUT", "/api/v1/cart", {
    json: { lines: [{ productId: fx.productId, variantId: null, quantity: 999 }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const line = r.body.data.lines.find((l) => l.productId === fx.productId);
  assert.equal(line.quantity, 7);
  await buyer.req("PUT", "/api/v1/cart", { json: { lines: [] } });
});

test("merge: the larger side is still capped at stock", async (t) => {
  const fx = await sellerFixture();
  if (!fx.published) return t.skip(`test store not publishable: ${fx.publishError}`);
  await setStock(fx, 4);
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const r = await buyer.req("POST", "/api/v1/cart/merge", {
    json: { lines: [{ productId: fx.productId, variantId: null, quantity: 50 }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.lines.find((l) => l.productId === fx.productId).quantity, 4);
  await buyer.req("PUT", "/api/v1/cart", { json: { lines: [] } });
  await setStock(fx, 50);
});
