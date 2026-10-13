// Unit tests for the WhatsApp webhook's pure logic — signature verification
// and payload parsing. No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  normalizeWaId,
  optIntent,
  parseAllowlist,
  parseWebhookPayload,
  verifySignature,
} from "../../src/modules/whatsapp/whatsapp.webhook.js";

const SECRET = "test-app-secret";
const sign = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// ---- Signature -------------------------------------------------------------

test("signature: a correct X-Hub-Signature-256 verifies", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  assert.equal(verifySignature(body, sign(body), SECRET), true);
});

test("signature: the exact bytes matter — re-serialised JSON fails", () => {
  const body = Buffer.from('{"a": 1}');
  const reformatted = Buffer.from('{"a":1}');
  assert.equal(verifySignature(reformatted, sign(body), SECRET), false);
});

test("signature: wrong secret, missing, malformed or truncated headers fail", () => {
  const body = Buffer.from("{}");
  const good = sign(body);
  assert.equal(verifySignature(body, sign(body, "other-secret"), SECRET), false);
  assert.equal(verifySignature(body, undefined, SECRET), false);
  assert.equal(verifySignature(body, "", SECRET), false);
  assert.equal(verifySignature(body, good.slice("sha256=".length), SECRET), false);
  assert.equal(verifySignature(body, "sha1=" + good.slice(7), SECRET), false);
  assert.equal(verifySignature(body, good.slice(0, -2), SECRET), false);
  assert.equal(verifySignature(body, "sha256=zz" + good.slice(9), SECRET), false);
});

test("signature: an empty app secret never verifies", () => {
  const body = Buffer.from("{}");
  assert.equal(verifySignature(body, sign(body, ""), ""), false);
});

// ---- Payload parsing -------------------------------------------------------

function payload(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value }] }],
  };
}

test("parse: inbound text with the sender's profile name", () => {
  const parsed = parseWebhookPayload(
    payload({
      contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }],
      messages: [
        { id: "wamid.1", from: "919876543210", timestamp: "1760000000", type: "text", text: { body: "Hi" } },
      ],
    }),
  );
  assert.deepEqual(parsed.messages, [
    { wamid: "wamid.1", waId: "919876543210", name: "Asha", type: "text", body: "Hi", mediaId: null },
  ]);
  assert.deepEqual(parsed.statuses, []);
});

test("parse: button, interactive and media replies", () => {
  const { messages } = parseWebhookPayload(
    payload({
      messages: [
        { id: "w.b", from: "1", type: "button", button: { text: "Yes", payload: "YES" } },
        { id: "w.i", from: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "opt1", title: "Track order" } } },
        { id: "w.l", from: "1", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "row2", title: "Returns" } } },
        { id: "w.m", from: "1", type: "image", image: { id: "MEDIA123", caption: "my parcel" } },
        { id: "w.d", from: "1", type: "document", document: { id: "DOC9", filename: "invoice.pdf" } },
      ],
    }),
  );
  assert.deepEqual(
    messages.map((m) => [m.wamid, m.type, m.body, m.mediaId, m.name]),
    [
      ["w.b", "button", "Yes", null, null],
      ["w.i", "interactive", "Track order", null, null],
      ["w.l", "interactive", "Returns", null, null],
      ["w.m", "image", "my parcel", "MEDIA123", null],
      ["w.d", "document", "invoice.pdf", "DOC9", null],
    ],
  );
});

test("parse: statuses, including a failure's error fields and timestamp", () => {
  const { statuses } = parseWebhookPayload(
    payload({
      statuses: [
        { id: "wamid.out", status: "delivered", timestamp: "1760000000", recipient_id: "919876543210" },
        {
          id: "wamid.out2",
          status: "failed",
          timestamp: "1760000060",
          recipient_id: "919876543210",
          errors: [{ code: 131026, title: "Message undeliverable", message: "Undeliverable", error_data: { details: "Receiver incapable" } }],
        },
      ],
    }),
  );
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses[0], {
    wamid: "wamid.out",
    status: "delivered",
    recipientId: "919876543210",
    statusTimestamp: new Date(1760000000 * 1000),
    errorCode: null,
    errorTitle: null,
    errorMessage: null,
    errorDetails: null,
  });
  assert.equal(statuses[1]?.errorCode, 131026);
  assert.equal(statuses[1]?.errorTitle, "Message undeliverable");
  assert.equal(statuses[1]?.errorDetails, "Receiver incapable");
});

test("parse: multiple entries and changes are flattened", () => {
  const parsed = parseWebhookPayload({
    entry: [
      { changes: [{ value: { messages: [{ id: "a", from: "1", type: "text", text: { body: "x" } }] } }] },
      {
        changes: [
          { value: { statuses: [{ id: "b", status: "read", timestamp: "1", recipient_id: "1" }] } },
          { value: { messages: [{ id: "c", from: "2", type: "text", text: { body: "y" } }] } },
        ],
      },
    ],
  });
  assert.deepEqual(parsed.messages.map((m) => m.wamid), ["a", "c"]);
  assert.deepEqual(parsed.statuses.map((s) => s.wamid), ["b"]);
});

test("parse: malformed input and items are skipped, never thrown on", () => {
  for (const bad of [null, undefined, "str", 42, [], {}, { entry: null }, { entry: [null] }, { entry: [{ changes: [null, {}] }] }]) {
    assert.deepEqual(parseWebhookPayload(bad), { messages: [], statuses: [] });
  }
  const { messages, statuses } = parseWebhookPayload(
    payload({
      messages: [null, { from: "1", type: "text" }, { id: "ok", from: "1", type: "unsupported" }],
      statuses: [{ id: "x" }, { id: "y", status: "sent", recipient_id: "1", timestamp: "nope" }],
    }),
  );
  assert.deepEqual(messages.map((m) => [m.wamid, m.type, m.body]), [["ok", "unsupported", null]]);
  assert.equal(statuses.length, 1);
  assert.ok(statuses[0]!.statusTimestamp instanceof Date && !Number.isNaN(statuses[0]!.statusTimestamp.getTime()));
});

// ---- Opt-out keywords + number handling -------------------------------------

test("optIntent: STOP / UNSUBSCRIBE / START as the whole message, any case", () => {
  assert.equal(optIntent("STOP"), "out");
  assert.equal(optIntent("  stop "), "out");
  assert.equal(optIntent("Unsubscribe"), "out");
  assert.equal(optIntent("start"), "in");
  assert.equal(optIntent("please stop sending"), null);
  assert.equal(optIntent(null), null);
});

test("numbers: normalised to wa_id digits; allowlist parsed the same way", () => {
  assert.equal(normalizeWaId("+91 98765-43210"), "919876543210");
  assert.deepEqual([...parseAllowlist(" +91 98765 43210, 15551234567 ,,")], ["919876543210", "15551234567"]);
  assert.equal(parseAllowlist("").size, 0);
});
