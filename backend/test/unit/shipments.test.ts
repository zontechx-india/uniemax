// Parcels — the courier list, link safety, HTML escaping and the tracking
// input rules. Pure logic, no server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COURIERS,
  COURIER_CODES,
  escapeHtml,
  findCourier,
  isHttpUrl,
} from "../../src/modules/orders/couriers.js";
import {
  orderCancelSchema,
  shipmentTrackingSchema,
} from "../../src/modules/orders/orders.schema.js";

test("every courier code has exactly one list entry, and sites are https", () => {
  assert.deepEqual(
    COURIERS.map((c) => c.code),
    [...COURIER_CODES],
  );
  for (const courier of COURIERS) {
    if (courier.site) assert.match(courier.site, /^https:\/\//);
  }
});

test("findCourier: list entries by code; typed and unknown couriers are null", () => {
  assert.equal(findCourier("delhivery")?.name, "Delhivery");
  assert.equal(findCourier("other"), null);
  assert.equal(findCourier(null), null);
  assert.equal(findCourier("nope"), null);
  assert.equal(findCourier("self")?.tracking, false);
});

test("isHttpUrl accepts http(s) only", () => {
  assert.equal(isHttpUrl("https://track.example.com/AWB123"), true);
  assert.equal(isHttpUrl("http://track.example.com/x?awb=1"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("data:text/html,hi"), false);
  assert.equal(isHttpUrl("//evil.example.com"), false);
  assert.equal(isHttpUrl("https://"), false);
});

test("escapeHtml neutralises markup and attribute breaks", () => {
  assert.equal(
    escapeHtml(`<a href="x" onclick='y'>&</a>`),
    "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  );
});

test("tracking input: spaces are dropped, empty strings mean none", () => {
  const parsed = shipmentTrackingSchema.parse({
    carrierCode: "delhivery",
    trackingNumber: " 1234 5678 9012 ",
    trackingUrl: "",
  });
  assert.equal(parsed.trackingNumber, "123456789012");
  assert.equal(parsed.trackingUrl, null);
  assert.equal(parsed.carrierName, null);
});

test("tracking input: bad numbers, unsafe links and unknown couriers are refused", () => {
  const bad = [
    { carrierCode: "delhivery", trackingNumber: "12" },
    { carrierCode: "delhivery", trackingNumber: "12345<script>" },
    { carrierCode: "delhivery", trackingUrl: "javascript:alert(1)" },
    { carrierCode: "fedex-mars" },
  ];
  for (const input of bad) {
    assert.equal(shipmentTrackingSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test("tracking input: 'other' needs the courier's name", () => {
  assert.equal(shipmentTrackingSchema.safeParse({ carrierCode: "other" }).success, false);
  const ok = shipmentTrackingSchema.parse({
    carrierCode: "other",
    carrierName: "Speed Couriers",
    trackingUrl: "https://speed.example.com/t/AB12",
  });
  assert.equal(ok.carrierName, "Speed Couriers");
});

test("cancel input: the returned-items answer is optional and boolean", () => {
  assert.equal(orderCancelSchema.parse({}).restockReturned, undefined);
  assert.equal(orderCancelSchema.parse({ restockReturned: false }).restockReturned, false);
  assert.equal(orderCancelSchema.safeParse({ restockReturned: "yes" }).success, false);
});
