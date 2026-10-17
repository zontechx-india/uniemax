// Unit tests for the PaymentHub webhook's pure logic — signature
// verification, envelope parsing and the forward-only order decision.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  acceptsMode,
  decide,
  envelopeSchema,
  FAILED_FROM,
  PAID_FROM,
  parseEventData,
  parseSignatureHeader,
  rupeesToPaise,
  verifyPaymentHubSignature,
  type HubEvent,
  type OrderSnapshot,
} from "../../src/modules/payments/paymenthub.webhook.js";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;
const sign = (body: Buffer, t = NOW, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body.toString("utf8")}`).digest("hex")}`;

const body = Buffer.from(
  '{"id":"evt_1","type":"payment.succeeded","createdAt":"2026-10-17T00:00:00Z","mode":"LIVE","data":{}}',
);

// ---- Signature -------------------------------------------------------------

test("signature: a correct PaymentHub-Signature verifies", () => {
  assert.equal(verifyPaymentHubSignature(body, sign(body), SECRET, NOW), true);
});

test("signature: header key order and spacing don't matter", () => {
  const [t, v1] = sign(body).split(",");
  assert.equal(verifyPaymentHubSignature(body, ` ${v1} , ${t} `, SECRET, NOW), true);
});

test("signature: a tampered body fails (exact bytes — re-serialised JSON fails too)", () => {
  const header = sign(body);
  const tampered = Buffer.from(body.toString().replace("LIVE", "TEST"));
  assert.equal(verifyPaymentHubSignature(tampered, header, SECRET, NOW), false);
  const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 1));
  assert.equal(verifyPaymentHubSignature(reformatted, header, SECRET, NOW), false);
});

test("signature: the wrong secret fails", () => {
  assert.equal(verifyPaymentHubSignature(body, sign(body, NOW, "whsec_other"), SECRET, NOW), false);
  assert.equal(verifyPaymentHubSignature(body, sign(body), "", NOW), false);
});

test("signature: a stale or future timestamp (> 300 s) fails; 300 s passes", () => {
  assert.equal(verifyPaymentHubSignature(body, sign(body, NOW - 301), SECRET, NOW), false);
  assert.equal(verifyPaymentHubSignature(body, sign(body, NOW + 301), SECRET, NOW), false);
  assert.equal(verifyPaymentHubSignature(body, sign(body, NOW - 300), SECRET, NOW), true);
});

test("signature: the timestamp is bound into the HMAC (swapping t fails)", () => {
  const v1 = sign(body).split(",")[1];
  assert.equal(verifyPaymentHubSignature(body, `t=${NOW + 1},${v1}`, SECRET, NOW), false);
});

test("signature: malformed / missing headers fail", () => {
  const good = sign(body);
  const v1 = good.split(",")[1]!;
  for (const header of [
    undefined,
    "",
    v1, // no t
    `t=${NOW}`, // no v1
    `t=abc,${v1}`,
    `t=${NOW}.5,${v1}`,
    `t=${NOW},t=${NOW},${v1}`, // duplicate t
    `t=${NOW},v1=${v1.slice(3, -2)}`, // truncated hex
    `t=${NOW},v1=zz${v1.slice(5)}`,
    `t=${NOW};${v1}`,
    "garbage",
  ]) {
    assert.equal(verifyPaymentHubSignature(body, header, SECRET, NOW), false, String(header));
  }
  assert.equal(parseSignatureHeader("t=1,v1=" + "a".repeat(64))?.t, 1);
});

// ---- Envelope + mode -------------------------------------------------------

const envelope = (type: string, data: Record<string, unknown>) =>
  envelopeSchema.parse({ id: "evt_1", type, createdAt: "2026-10-17T00:00:00Z", mode: "LIVE", data });

const intent = {
  id: "pi_1",
  reference: "UM-1001",
  status: "SUCCEEDED",
  amountMinor: 49950,
  currency: "INR",
  lateCapture: false,
  gatewayPaymentId: "cf_pay_9",
  metadata: { orderId: "ord_1", storeSlug: "my-store" },
};

test("envelope: known types parse their data; unknown types pass through", () => {
  const ev = parseEventData(envelope("payment.succeeded", { intent }));
  assert.equal(ev.kind, "payment");
  assert.equal(parseEventData(envelope("payout.created", {})).kind, "unknown");
  assert.throws(() => parseEventData(envelope("payment.succeeded", { intent: { id: "pi_1" } })));
  assert.throws(() =>
    parseEventData(envelope("payment.succeeded", { intent: { ...intent, amountMinor: 499.5 } })),
  );
  assert.throws(() => envelopeSchema.parse({ id: "evt_1", type: "x", createdAt: "", mode: "PROD", data: {} }));
});

test("mode: production takes LIVE only; dev takes both", () => {
  assert.equal(acceptsMode("LIVE", true), true);
  assert.equal(acceptsMode("TEST", true), false);
  assert.equal(acceptsMode("TEST", false), true);
  assert.equal(acceptsMode("LIVE", false), true);
});

test("rupeesToPaise: exact string maths", () => {
  const dec = (s: string) => ({ toFixed: () => s });
  assert.equal(rupeesToPaise(dec("499.50")), 49950n);
  assert.equal(rupeesToPaise(dec("0.10")), 10n);
  assert.equal(rupeesToPaise(dec("99999999.99")), 9999999999n);
  assert.equal(rupeesToPaise(dec("-1.00")), null);
  // A float would get this wrong: 0.1 + 0.2 = 0.30000000000000004
  assert.equal(rupeesToPaise({ toFixed: (d) => (0.3).toFixed(d) }), 30n);
});

// ---- Decision (forward-only) ----------------------------------------------

const order = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: "ord_1",
  orderNumber: "UM-1001",
  storeSlug: "my-store",
  total: { toFixed: () => "499.50" },
  paymentMethod: "ONLINE",
  paymentStatus: "PENDING",
  paymentIntentId: "pi_1",
  ...over,
});
const ev = (type: string, over: Record<string, unknown> = {}) =>
  parseEventData(envelope(type, { intent: { ...intent, ...over } })) as Extract<HubEvent, { kind: "payment" }>;

test("decide: succeeded with the matching amount marks PAID with the gateway ref", () => {
  assert.deepEqual(decide(ev("payment.succeeded"), order()), {
    action: "markPaid",
    paymentRef: "cf_pay_9",
    lateCapture: false,
  });
  // A FAILED order can still be paid (the customer retried).
  assert.equal(decide(ev("payment.succeeded"), order({ paymentStatus: "FAILED" })).action, "markPaid");
});

test("decide: amount, currency, reference, store or method mismatch never marks PAID", () => {
  for (const [e, o] of [
    [ev("payment.succeeded", { amountMinor: 49949 }), order()],
    [ev("payment.succeeded", { currency: "USD" }), order()],
    [ev("payment.succeeded", { reference: "UM-9999" }), order()],
    [ev("payment.succeeded", { metadata: { storeSlug: "other" } }), order()],
    [ev("payment.succeeded"), order({ paymentMethod: "COD" })],
  ] as const) {
    const d = decide(e, o);
    assert.equal(d.action, "ignore");
    assert.equal(d.action === "ignore" && d.level, "error");
  }
});

test("decide: payment.failed after payment.succeeded does not un-pay the order", () => {
  const paid = order({ paymentStatus: "PAID" });
  for (const type of ["payment.failed", "payment.expired", "payment.cancelled"]) {
    assert.equal(decide(ev(type), paid).action, "ignore", type);
    assert.equal(decide(ev(type), order({ paymentStatus: "REFUNDED" })).action, "ignore", type);
  }
  // …and the DB guard repeats it, so a racing delivery can't either.
  assert.equal((FAILED_FROM as readonly string[]).includes("PAID"), false);
  assert.equal((PAID_FROM as readonly string[]).includes("REFUNDED"), false);
});

test("decide: failure on a PENDING order marks FAILED; a superseded intent is ignored", () => {
  assert.deepEqual(decide(ev("payment.failed"), order()), { action: "markFailed" });
  assert.deepEqual(decide(ev("payment.expired"), order({ paymentIntentId: null })), { action: "markFailed" });
  assert.equal(decide(ev("payment.failed"), order({ paymentIntentId: "pi_new" })).action, "ignore");
});

test("decide: a replayed succeeded on a PAID order is a no-op; lateCapture is surfaced", () => {
  assert.equal(decide(ev("payment.succeeded"), order({ paymentStatus: "PAID" })).action, "ignore");
  const late = decide(ev("payment.succeeded", { lateCapture: true, gatewayPaymentId: null }), order());
  assert.deepEqual(late, { action: "markPaid", paymentRef: "pi_1", lateCapture: true });
});
