// Delivery address correction: the customer gave an incomplete address, the
// seller phoned them and fixes it on the order. Allowed until the order is
// delivered (also once sent — the real case that asked for it), keeps the old
// address in the order's history, never touches money or the customer's name
// and phone, and only the store's owner can do it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const CUSTOMER = {
  name: "QA Address",
  phone: "9876543210",
  email: "qa.address@example.test",
  address: "Barsoo LAR Ganderbal",
  pincode: "191131",
  state: "Jammu and Kashmir",
  country: "India",
};

const FIXED = {
  address: "House 12, near JK Bank, Sainik School Road, Manasbal, Barsoo",
  pincode: "191 131",
  state: "Jammu and Kashmir",
  country: "India",
};

async function placeOrder(t, fulfilment = "DELIVERY") {
  const fx = await sellerFixture();
  if (!fx.published) {
    t.skip(`test store not publishable: ${fx.publishError}`);
    return null;
  }
  await fx.seller.req(
    "PATCH",
    `/api/v1/stores/${fx.store.id}/products/${fx.productId}/variants/${fx.defaultVariantId}`,
    { json: { stockQuantity: 50 } },
  );
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const placed = await buyer.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    headers: { "Idempotency-Key": randomUUID() },
    json: {
      fulfilment,
      paymentMethod: "COD",
      customer: fulfilment === "DELIVERY" ? CUSTOMER : { name: CUSTOMER.name, phone: CUSTOMER.phone, email: CUSTOMER.email },
      items: [{ productId: fx.productId, quantity: 1 }],
    },
  });
  if (placed.status !== 201) {
    t.skip(`order not placed (${placed.status}): ${JSON.stringify(placed.body)}`);
    return null;
  }
  return { fx, buyer, order: placed.body.data };
}

const orderPath = (s) => `/api/v1/stores/${s.fx.store.id}/orders/${s.order.id}`;
const edit = (s, json, client = s.fx.seller) =>
  client.req("PATCH", `${orderPath(s)}/address`, { json });

test("confirmed + sent order: address corrected, old one kept, money and contact untouched", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  await s.fx.seller.req("PATCH", `${orderPath(s)}/status`, { json: { status: "CONFIRMED" } });
  const sent = await s.fx.seller.req("POST", `${orderPath(s)}/shipments`, {
    json: { carrierCode: "indiapost", trackingNumber: "EK123456789IN" },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));

  const r = await edit(s, FIXED);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const order = r.body.data;
  assert.equal(order.status, "SHIPPED");
  assert.equal(order.addressLine, FIXED.address);
  assert.equal(order.pincode, "191131", "pincode normalised");
  assert.equal(order.customerName, CUSTOMER.name);
  assert.equal(order.total, s.order.total);
  assert.equal(order.addressChanges.length, 1);
  const change = order.addressChanges[0];
  assert.equal(change.changedBy, "SELLER");
  assert.equal(change.before.addressLine, CUSTOMER.address);
  assert.equal(change.after.addressLine, FIXED.address);

  // Saving the same address again records nothing new.
  const same = await edit(s, FIXED);
  assert.equal(same.status, 200, JSON.stringify(same.body));
  assert.equal(same.body.data.addressChanges.length, 1);

  // The buyer sees the new address, but not the seller's history.
  const mine = await s.buyer.req("GET", "/api/v1/orders");
  const asBuyer = mine.body.data.find((o) => o.id === s.order.id);
  assert.equal(asBuyer.addressLine, FIXED.address);
  assert.deepEqual(asBuyer.addressChanges, []);
});

test("bad input → 400; not the owner → 404; delivered → 409", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const bad = await edit(s, { ...FIXED, pincode: "12" });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  const short = await edit(s, { ...FIXED, address: "x" });
  assert.equal(short.status, 400, JSON.stringify(short.body));

  const asBuyer = await edit(s, FIXED, s.buyer);
  assert.equal(asBuyer.status, 404, JSON.stringify(asBuyer.body));

  await s.fx.seller.req("PATCH", `${orderPath(s)}/status`, { json: { status: "DELIVERED" } });
  const late = await edit(s, FIXED);
  assert.equal(late.status, 409, JSON.stringify(late.body));
});

test("pickup order has no delivery address → 409", async (t) => {
  const s = await placeOrder(t, "PICKUP");
  if (!s) return;
  const r = await edit(s, FIXED);
  assert.equal(r.status, 409, JSON.stringify(r.body));
});
