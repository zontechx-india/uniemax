// Unit tests for seller payout rules (modules/payouts/payouts.rules.ts) and the
// `payout.*` PaymentHub webhook parsing. No server, no database:
// `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountToPaise,
  canMove,
  hubPayoutStatus,
  indiaDateTime,
  last4,
  nextStatuses,
  paiseToAmount,
  payoutBlockers,
  payoutTotals,
} from "../../src/modules/payouts/payouts.rules.js";
import { envelopeSchema, parseEventData } from "../../src/modules/payments/paymenthub.webhook.js";

// ---- Money -----------------------------------------------------------------

test("amountToPaise reads rupee strings exactly", () => {
  assert.equal(amountToPaise("1250"), 125000n);
  assert.equal(amountToPaise("1250.5"), 125050n);
  assert.equal(amountToPaise("1250.05"), 125005n);
  assert.equal(amountToPaise("0.01"), 1n);
  assert.equal(amountToPaise("1.234"), null);
  assert.equal(amountToPaise("-5"), null);
  assert.equal(amountToPaise("abc"), null);
});

test("paiseToAmount always prints two decimals", () => {
  assert.equal(paiseToAmount(125050n), "1250.50");
  assert.equal(paiseToAmount(5n), "0.05");
  assert.equal(paiseToAmount(0n), "0.00");
});

test("payoutTotals counts only active payouts against the order total", () => {
  const totals = payoutTotals(100000n, [
    { status: "SUCCEEDED", amountPaise: 30000n },
    { status: "PROCESSING", amountPaise: 20000n },
    { status: "PENDING", amountPaise: 10000n },
    { status: "FAILED", amountPaise: 99999n },
    { status: "CANCELLED", amountPaise: 99999n },
    { status: "REVERSED", amountPaise: 99999n },
  ]);
  assert.equal(totals.paidOut, 30000n);
  assert.equal(totals.inProgress, 30000n);
  assert.equal(totals.remaining, 40000n);
});

test("remaining never goes below zero", () => {
  const totals = payoutTotals(1000n, [{ status: "SUCCEEDED", amountPaise: 5000n }]);
  assert.equal(totals.remaining, 0n);
});

// ---- Eligibility -----------------------------------------------------------

const paidDelivered = { status: "DELIVERED", paymentMethod: "ONLINE", paymentStatus: "PAID" };

test("an online, paid, delivered order can be paid out", () => {
  assert.deepEqual(payoutBlockers(paidDelivered), []);
});

test("cash on delivery never needs a payout", () => {
  const blockers = payoutBlockers({ ...paidDelivered, paymentMethod: "COD" });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0]!, /Cash on delivery/);
});

test("undelivered, unpaid, refunded or cancelled orders are blocked", () => {
  assert.match(payoutBlockers({ ...paidDelivered, status: "SHIPPED" }).join(" "), /Waiting for delivery/);
  assert.match(payoutBlockers({ ...paidDelivered, paymentStatus: "PENDING" }).join(" "), /not complete/);
  assert.match(payoutBlockers({ ...paidDelivered, paymentStatus: "REFUNDED" }).join(" "), /refunded/);
  assert.match(payoutBlockers({ ...paidDelivered, status: "CANCELLED" }).join(" "), /cancelled/);
});

// ---- Status moves ----------------------------------------------------------

test("manual payouts: forward moves and mistake-cancel are allowed", () => {
  assert.ok(canMove("MANUAL", "PENDING", "SUCCEEDED"));
  assert.ok(canMove("MANUAL", "PROCESSING", "FAILED"));
  assert.ok(canMove("MANUAL", "SUCCEEDED", "REVERSED"));
  assert.ok(canMove("MANUAL", "SUCCEEDED", "CANCELLED"));
});

test("terminal statuses go nowhere; nothing moves backwards", () => {
  for (const method of ["MANUAL", "GATEWAY"] as const) {
    for (const end of ["FAILED", "REVERSED", "CANCELLED"] as const) {
      assert.deepEqual(nextStatuses(method, end), []);
    }
    assert.ok(!canMove(method, "SUCCEEDED", "PENDING"));
    assert.ok(!canMove(method, "PROCESSING", "PENDING"));
  }
});

test("gateway payouts can't be cancelled by hand", () => {
  assert.ok(!canMove("GATEWAY", "PENDING", "CANCELLED"));
  assert.ok(!canMove("GATEWAY", "SUCCEEDED", "CANCELLED"));
  assert.ok(canMove("GATEWAY", "PENDING", "PROCESSING"));
  assert.ok(canMove("GATEWAY", "SUCCEEDED", "REVERSED"));
});

test("hub statuses map onto ours; unknown words are ignored", () => {
  assert.equal(hubPayoutStatus("INITIATED"), "PROCESSING");
  assert.equal(hubPayoutStatus("succeeded"), "SUCCEEDED");
  assert.equal(hubPayoutStatus("FAILED"), "FAILED");
  assert.equal(hubPayoutStatus("REVERSED"), "REVERSED");
  assert.equal(hubPayoutStatus("SOMETHING_NEW"), null);
});

// ---- Dates and masking -----------------------------------------------------

test("indiaDateTime reads the typed day and time as +05:30", () => {
  const withTime = indiaDateTime("2026-11-05", "14:30");
  assert.equal(withTime.at.toISOString(), "2026-11-05T09:00:00.000Z");
  assert.equal(withTime.timeKnown, true);
  const dayOnly = indiaDateTime("2026-11-05");
  assert.equal(dayOnly.at.toISOString(), "2026-11-04T18:30:00.000Z");
  assert.equal(dayOnly.timeKnown, false);
});

test("last4 keeps only the last four digits", () => {
  assert.equal(last4("1234 5678 9012"), "9012");
});

// ---- Webhook parsing -------------------------------------------------------

test("payout.* webhooks parse into a payout event", () => {
  const envelope = envelopeSchema.parse({
    id: "evt_po_1",
    type: "payout.succeeded",
    createdAt: "2026-11-05T10:00:00Z",
    mode: "TEST",
    data: {
      payout: {
        id: "po_1",
        reference: "cmpayout1",
        status: "SUCCEEDED",
        amountMinor: 125050,
        gateway: "cashfree",
        utr: "UTR123",
      },
    },
  });
  const event = parseEventData(envelope);
  assert.equal(event.kind, "payout");
  if (event.kind !== "payout") return;
  assert.equal(event.payout.id, "po_1");
  assert.equal(event.payout.utr, "UTR123");
});

test("a malformed payout webhook is rejected", () => {
  const envelope = envelopeSchema.parse({
    id: "evt_po_2",
    type: "payout.failed",
    createdAt: "2026-11-05T10:00:00Z",
    mode: "TEST",
    data: { payout: { id: "po_2", status: "FAILED" } },
  });
  assert.throws(() => parseEventData(envelope));
});
