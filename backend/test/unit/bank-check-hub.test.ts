// PaymentHub bank check, faked at the HTTP boundary: a stub `fetch` answers
// with bodies shaped exactly as the hub's API reference shows, and the test
// checks retries, the Idempotency-Key, and how each answer is classified.
// No server, no database: `npm run test:unit`.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

// The client reads these at import; set them first (dotenv never overrides).
process.env.PAYMENTHUB_URL = "https://hub.test";
process.env.PAYMENTHUB_API_KEY = "ph_test_unit";

const { requestBankCheck } = await import("../../src/modules/stores/bankCheck.hub.js");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];
let answers: Array<() => Response> = [];

beforeEach(() => {
  calls = [];
  answers = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const next = answers.shift();
    if (!next) throw new Error("no fake answer left");
    return next();
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (data: unknown, status = 201) => json(status, { success: true, data });
const fail = (status: number, code: string, message = "nope") =>
  json(status, { success: false, error: { code, message } });
const networkDown = () => {
  throw new TypeError("fetch failed");
};

const VERIFICATION = {
  id: "vf_01JABCDEFGHJKMNPQRSTVWXYZ0",
  type: "BANK_ACCOUNT",
  provider: "CASHFREE",
  payeeRef: "store_17",
  status: "VALID",
  target: "XXXX1191",
  details: { ifsc: "YESB0000262", bankName: "YES BANK", branch: "SANTACRUZ, MUMBAI", city: "MUMBAI" },
  nameGiven: "RAVI KUMAR",
  registeredName: "RAVI KUMAR",
  nameMatch: "GOOD_PARTIAL_MATCH",
  nameMatchScoreBps: 9000,
  reasonCode: "ACCOUNT_IS_VALID",
  reviewedAt: null,
  reviewNote: null,
  reused: false,
  createdAt: "2026-11-02T10:00:00.000Z",
};

const INPUT = { payeeRef: "store_17", accountNumber: "026291800001191", ifsc: "YESB0000262", accountHolder: "Ravi Kumar" };
const KEY = "bank-verify:17:acc1.1730541600000";
const FAST = { retryWaitMs: 1 };

test("VALID: one POST to /v1/verifications/bank-account with key, bearer and the given payeeRef", async () => {
  answers.push(ok(VERIFICATION));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.verification.registeredName, "RAVI KUMAR");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.url, "https://hub.test/v1/verifications/bank-account");
  assert.equal(call.method, "POST");
  assert.equal(call.headers["idempotency-key"], KEY);
  assert.equal(call.headers.authorization, "Bearer ph_test_unit");
  assert.equal(call.body.payeeRef, "store_17");
});

for (const status of ["NEEDS_REVIEW", "INVALID", "RETRY_LATER"] as const) {
  test(`${status} comes back as the hub's answer, not as an error`, async () => {
    answers.push(ok({ ...VERIFICATION, status, registeredName: null }));
    const outcome = await requestBankCheck(INPUT, KEY, FAST);
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.verification.status, status);
  });
}

test("a reused result (200, reused: true) is passed through", async () => {
  answers.push(ok({ ...VERIFICATION, reused: true }, 200));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(outcome.ok && outcome.verification.reused, true);
});

test("5xx then success: retried with the SAME Idempotency-Key", async () => {
  answers.push(fail(500, "INTERNAL"), ok(VERIFICATION));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.headers["idempotency-key"]), [KEY, KEY]);
});

test("409 IDEMPOTENCY_IN_PROGRESS is retried with the same key", async () => {
  answers.push(fail(409, "IDEMPOTENCY_IN_PROGRESS"), ok(VERIFICATION));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls.map((c) => c.headers["idempotency-key"]), [KEY, KEY]);
});

test("network failure: at most 3 tries, all with the same key, then TIMEOUT (nothing saved)", async () => {
  answers.push(networkDown, networkDown, networkDown, networkDown);
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.headers["idempotency-key"] === KEY));
  assert.equal(!outcome.ok && outcome.reason, "TIMEOUT");
});

test("503 VERIFIER_NOT_CONFIGURED → UNAVAILABLE, not retried, never INVALID", async () => {
  answers.push(fail(503, "VERIFIER_NOT_CONFIGURED"));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(calls.length, 1);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.reason, "UNAVAILABLE");
    assert.equal(outcome.reason === "UNAVAILABLE" && outcome.code, "VERIFIER_NOT_CONFIGURED");
  }
});

test("502 VERIFIER_ERROR → UNAVAILABLE", async () => {
  answers.push(fail(502, "VERIFIER_ERROR"));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(calls.length, 1);
  assert.equal(!outcome.ok && outcome.reason, "UNAVAILABLE");
});

test("429 VERIFICATION_APP_LIMIT → UNAVAILABLE (ops must act)", async () => {
  answers.push(fail(429, "VERIFICATION_APP_LIMIT"));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(!outcome.ok && outcome.reason, "UNAVAILABLE");
});

test("429 VERIFICATION_LIMIT → LIMIT ('too many attempts today')", async () => {
  answers.push(fail(429, "VERIFICATION_LIMIT"));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(calls.length, 1);
  assert.equal(!outcome.ok && outcome.reason, "LIMIT");
});

test("422 VALIDATION_ERROR / VERIFICATION_INPUT_INVALID → INPUT with the hub's message", async () => {
  for (const code of ["VALIDATION_ERROR", "VERIFICATION_INPUT_INVALID"]) {
    answers.push(fail(422, code, "11 chars: 4 letters, 0, then 6 letters or digits"));
    const outcome = await requestBankCheck(INPUT, KEY, FAST);
    assert.equal(!outcome.ok && outcome.reason, "INPUT");
    assert.match(!outcome.ok ? outcome.message : "", /11 chars/);
  }
});

test("401 (key refused) → UNAVAILABLE, not INVALID", async () => {
  answers.push(fail(401, "UNAUTHORIZED"));
  const outcome = await requestBankCheck(INPUT, KEY, FAST);
  assert.equal(!outcome.ok && outcome.reason, "UNAVAILABLE");
});

test("no outcome or message ever carries the full account number", async () => {
  const seen: string[] = [];
  for (const answer of [
    ok(VERIFICATION),
    fail(503, "VERIFIER_NOT_CONFIGURED"),
    fail(429, "VERIFICATION_LIMIT"),
    fail(422, "VALIDATION_ERROR"),
  ]) {
    answers.push(answer);
    seen.push(JSON.stringify(await requestBankCheck(INPUT, KEY, FAST)));
  }
  for (const text of seen) assert.doesNotMatch(text, /026291800001191/);
});
