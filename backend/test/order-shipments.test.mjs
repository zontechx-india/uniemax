// Parcels: the seller sends an order with a courier + tracking number,
// corrects it, marks it delivered (optional proof photo) or records that it
// came back — the buyer sees the tracking but never the proof photo, a parcel
// that came back can be sent again, and cancelling never counts stock twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PNG_1PX, fileForm, need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const CUSTOMER = {
  name: "QA Parcel",
  phone: "9876543210",
  email: "qa.parcel@example.test",
  address: "QA street, do not ship",
  pincode: "682001",
  state: "Kerala",
  country: "India",
};

async function stockOf(fx) {
  const r = await fx.seller.req("GET", `/api/v1/stores/${fx.store.id}/products`);
  return r.body.data.find((p) => p.id === fx.productId).stockQuantity;
}

/** A fresh COD delivery order for 2 items, placed by buyer B. */
async function placeOrder(t) {
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
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: CUSTOMER,
      items: [{ productId: fx.productId, quantity: 2 }],
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  return { fx, buyer, order: placed.body.data };
}

const orderPath = (s) => `/api/v1/stores/${s.fx.store.id}/orders/${s.order.id}`;
const send = (s, json) => s.fx.seller.req("POST", `${orderPath(s)}/shipments`, { json });
const parcelPath = (s, id) => `${orderPath(s)}/shipments/${id}`;

test("send with tracking → Shipped, one parcel holding every item; again → 409", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const sent = await send(s, { carrierCode: "delhivery", trackingNumber: "2123 4567 8901 2" });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const order = sent.body.data;
  assert.equal(order.status, "SHIPPED");
  assert.ok(order.shippedAt);
  assert.equal(order.shipments.length, 1);
  const parcel = order.shipments[0];
  assert.equal(parcel.carrier, "Delhivery");
  assert.equal(parcel.trackingNumber, "2123456789012");
  assert.equal(parcel.courierSite, "https://www.delhivery.com/");
  assert.ok(order.items.every((item) => item.shipmentId === parcel.id));
  assert.ok("podUrl" in parcel, "the seller's view carries the proof-photo field");

  const again = await send(s, { carrierCode: "dtdc", trackingNumber: "D12345678" });
  assert.equal(again.status, 409, JSON.stringify(again.body));
});

test("delivered with a photo: COD paid; buyer sees tracking, never the photo; public link hides the number", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const sent = await send(s, { carrierCode: "bluedart", trackingNumber: "BD99887766" });
  const parcelId = sent.body.data.shipments[0].id;

  const delivered = await s.fx.seller.req("POST", `${parcelPath(s, parcelId)}/delivered`, {
    form: fileForm({}, PNG_1PX, "pod.png"),
  });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.status, "DELIVERED");
  assert.equal(delivered.body.data.paymentStatus, "PAID");
  assert.match(delivered.body.data.shipments[0].podUrl, /^https?:\/\//);

  const twice = await s.fx.seller.req("POST", `${parcelPath(s, parcelId)}/delivered`, { json: {} });
  assert.equal(twice.status, 409, JSON.stringify(twice.body));

  const mine = await s.buyer.req("GET", "/api/v1/orders");
  const asBuyer = mine.body.data.find((o) => o.id === s.order.id);
  assert.equal(asBuyer.shipments[0].trackingNumber, "BD99887766");
  assert.equal("podUrl" in asBuyer.shipments[0], false);

  const link = await s.buyer.req("GET", `/api/v1/public/stores/${s.fx.slug}/orders/${s.order.id}`, {
    anonymous: true,
  });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.body.data.redacted, true);
  assert.equal(link.body.data.shipments[0].carrier, "Blue Dart");
  assert.equal(link.body.data.shipments[0].trackingNumber, null);
  assert.equal("podUrl" in link.body.data.shipments[0], false);
});

test("own delivery keeps no tracking; tracking can be corrected only while on the way", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const sent = await send(s, { carrierCode: "self", trackingNumber: "IGNORED123" });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const parcel = sent.body.data.shipments[0];
  assert.equal(parcel.carrier, "Own delivery");
  assert.equal(parcel.trackingNumber, null);

  const fixed = await s.fx.seller.req("PATCH", parcelPath(s, parcel.id), {
    json: { carrierCode: "other", carrierName: "Speed Couriers", trackingNumber: "SC-2001", trackingUrl: "https://speed.example.com/t/SC-2001" },
  });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
  assert.equal(fixed.body.data.shipments[0].carrier, "Speed Couriers");
  assert.equal(fixed.body.data.shipments[0].carrierCode, null);
  assert.equal(fixed.body.data.shipments[0].trackingUrl, "https://speed.example.com/t/SC-2001");

  const delivered = await s.fx.seller.req("POST", `${parcelPath(s, parcel.id)}/delivered`, { json: {} });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.shipments[0].podUrl, null);

  const late = await s.fx.seller.req("PATCH", parcelPath(s, parcel.id), {
    json: { carrierCode: "dtdc", trackingNumber: "D0000001" },
  });
  assert.equal(late.status, 409, JSON.stringify(late.body));
});

test("came back: cancel waits for it, asks about stock, and restocks returned items only on yes", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const before = await stockOf(s.fx);
  const sent = await send(s, { carrierCode: "xpressbees", trackingNumber: "XB1234567" });
  const parcelId = sent.body.data.shipments[0].id;

  const tooEarly = await s.fx.seller.req("POST", `${orderPath(s)}/cancel`, { json: {} });
  assert.equal(tooEarly.status, 409, JSON.stringify(tooEarly.body));

  const back = await s.fx.seller.req("POST", `${parcelPath(s, parcelId)}/returned`, { json: {} });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.ok(back.body.data.shipments[0].returnedAt);
  assert.equal(back.body.data.status, "SHIPPED");

  const unanswered = await s.fx.seller.req("POST", `${orderPath(s)}/cancel`, { json: {} });
  assert.equal(unanswered.status, 400, JSON.stringify(unanswered.body));

  const cancelled = await s.fx.seller.req("POST", `${orderPath(s)}/cancel`, {
    json: { restockReturned: true },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.data.status, "CANCELLED");
  assert.equal(cancelled.body.data.shipments[0].restocked, true);
  assert.equal(await stockOf(s.fx), before + 2);
});

test("came back and kept: send again in a new parcel; a later cancel can leave stock alone", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const before = await stockOf(s.fx);
  const first = await send(s, { carrierCode: "dtdc", trackingNumber: "D11112222" });
  const firstId = first.body.data.shipments[0].id;
  await s.fx.seller.req("POST", `${parcelPath(s, firstId)}/returned`, { json: {} });

  const again = await send(s, { carrierCode: "dtdc", trackingNumber: "D33334444" });
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.equal(again.body.data.status, "SHIPPED");
  assert.equal(again.body.data.shipments.length, 2);
  const secondId = again.body.data.shipments[1].id;
  assert.ok(again.body.data.items.every((item) => item.shipmentId === secondId));

  await s.fx.seller.req("POST", `${parcelPath(s, secondId)}/returned`, { json: {} });
  const cancelled = await s.fx.seller.req("POST", `${orderPath(s)}/cancel`, {
    json: { restockReturned: false },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(await stockOf(s.fx), before, "damaged returns stay out of stock");
});

test("unsafe links and unknown couriers are refused; strangers can't touch the parcel", async (t) => {
  const s = await placeOrder(t);
  if (!s) return;
  const script = await send(s, {
    carrierCode: "other",
    carrierName: "Evil",
    trackingNumber: "EV12345",
    trackingUrl: "javascript:alert(1)",
  });
  assert.equal(script.status, 400, JSON.stringify(script.body));
  const unknown = await send(s, { carrierCode: "fedex-mars", trackingNumber: "FM12345" });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body));

  const stranger = await s.buyer.req("POST", `/api/v1/stores/${s.fx.store.id}/orders/${s.order.id}/shipments`, {
    json: { carrierCode: "dtdc", trackingNumber: "D99999999" },
  });
  assert.ok([403, 404].includes(stranger.status), JSON.stringify(stranger.body));
});

test("the courier list is public", async () => {
  const r = await fetch(`${process.env.API_BASE ?? "http://127.0.0.1:4000"}/api/v1/public/couriers`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.data.some((c) => c.code === "delhivery"));
  assert.ok(body.data.some((c) => c.code === "self" && c.tracking === false));
});
