// Unit tests for the refund rules (modules/payments/refunds.rules.ts) and the
// `refund.*` PaymentHub webhook parsing. No server, no database:
// `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REFUND_ATTEMPTS,
  afterFailedAttempt,
  coversOrder,
  isPermanentHubRefusal,
  pickIntentToRefund,
  refundStatusFromHub,
} from "../../src/modules/payments/refunds.rules.js";
import { envelopeSchema, parseEventData } from "../../src/modules/payments/paymenthub.webhook.js";

test("the order's latest intent is refunded when it holds the payment", () => {
  assert.deepEqual(pickIntentToRefund([{ id: "pi_new", status: "SUCCEEDED" }], "pi_new"), {
    kind: "refund",
    intentId: "pi_new",
  });
});

test("a payment that landed on an older intent is found", () => {
  const intents = [
    { id: "pi_new", status: "EXPIRED" },
    { id: "pi_old", status: "SUCCEEDED" },
  ];
  assert.deepEqual(pickIntentToRefund(intents, "pi_new"), { kind: "refund", intentId: "pi_old" });
});

test("the latest intent wins when two hold money", () => {
  const intents = [
    { id: "pi_old", status: "SUCCEEDED" },
    { id: "pi_new", status: "PARTIALLY_REFUNDED" },
  ];
  assert.deepEqual(pickIntentToRefund(intents, "pi_new"), { kind: "refund", intentId: "pi_new" });
});

test("an intent the hub already refunded is not refunded again", () => {
  assert.deepEqual(pickIntentToRefund([{ id: "pi_1", status: "REFUNDED" }], "pi_1"), {
    kind: "alreadyRefunded",
    intentId: "pi_1",
  });
});

test("no paid intent means nothing to refund yet", () => {
  assert.deepEqual(pickIntentToRefund([{ id: "pi_1", status: "PENDING" }], "pi_1"), { kind: "none" });
  assert.deepEqual(pickIntentToRefund([], null), { kind: "none" });
});

test("a 4xx refusal is permanent; timeouts, rate limits and 5xx are retried", () => {
  assert.equal(isPermanentHubRefusal(409), true);
  assert.equal(isPermanentHubRefusal(422), true);
  assert.equal(isPermanentHubRefusal(404), true);
  assert.equal(isPermanentHubRefusal(408), false);
  assert.equal(isPermanentHubRefusal(429), false);
  assert.equal(isPermanentHubRefusal(502), false);
  assert.equal(isPermanentHubRefusal(0), false);
});

test("a refund is given to a person after the last attempt, or at once when permanent", () => {
  assert.deepEqual(afterFailedAttempt(0, false), { attempts: 1, giveUp: false });
  assert.deepEqual(afterFailedAttempt(MAX_REFUND_ATTEMPTS - 1, false), {
    attempts: MAX_REFUND_ATTEMPTS,
    giveUp: true,
  });
  assert.deepEqual(afterFailedAttempt(0, true), { attempts: 1, giveUp: true });
});

test("hub refund statuses map onto ours; unknown ones stay pending", () => {
  assert.equal(refundStatusFromHub("SUCCEEDED"), "SUCCEEDED");
  assert.equal(refundStatusFromHub("FAILED"), "FAILED");
  assert.equal(refundStatusFromHub("PENDING"), "PENDING");
  assert.equal(refundStatusFromHub("SOMETHING_NEW"), "PENDING");
});

test("only a refund of the whole total marks the order refunded", () => {
  assert.equal(coversOrder(49900n, 49900n), true);
  assert.equal(coversOrder(10000n, 49900n), false);
});

test("refund.succeeded parses into a refund event", () => {
  const envelope = envelopeSchema.parse({
    id: "evt_1",
    type: "refund.succeeded",
    createdAt: new Date().toISOString(),
    mode: "TEST",
    data: { refund: { id: "rf_1", intentId: "pi_1", reference: "UM-1", amountMinor: 49900, status: "SUCCEEDED" } },
  });
  const event = parseEventData(envelope);
  assert.equal(event.kind, "refund");
  if (event.kind === "refund") {
    assert.equal(event.refund.intentId, "pi_1");
    assert.equal(event.refund.amountMinor, 49900);
  }
});
