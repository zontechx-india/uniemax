// Unit tests for PolicyHub rules (docs/policyhub/README.md §7): which version
// is in force, version periods, publish start checks, settings shape, the
// {{placeholder}} wording and the payout-day cutoff.
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyProblems,
  effectiveFromProblem,
  formatTime,
  payoutDay,
  renderBody,
  settingsProblem,
  startedHistory,
  versionInForce,
  type PayoutSettings,
  type VersionLike,
} from "../../src/package/policy/rules.js";

const SETTINGS: PayoutSettings = {
  cutoff: "18:00",
  windowStart: "18:00",
  windowEnd: "22:00",
  timezone: "Asia/Kolkata",
};

/** An IST wall-clock time as an instant (IST = UTC+5:30, no DST). */
const ist = (s: string) => new Date(`${s}+05:30`);

const v = (version: number, status: VersionLike["status"], from: string | null): VersionLike => ({
  version,
  status,
  effectiveFrom: from ? new Date(from) : null,
});

// ---- payoutDay: the 6 PM cutoff ---------------------------------------------

test("payoutDay: delivered before the cutoff → same day", () => {
  assert.equal(payoutDay(ist("2026-12-01T00:00:00"), SETTINGS), "2026-12-01");
  assert.equal(payoutDay(ist("2026-12-01T17:59:59"), SETTINGS), "2026-12-01");
});

test("payoutDay: exactly at the cutoff or later → next day", () => {
  assert.equal(payoutDay(ist("2026-12-01T18:00:00"), SETTINGS), "2026-12-02");
  assert.equal(payoutDay(ist("2026-12-01T23:59:59"), SETTINGS), "2026-12-02");
});

test("payoutDay: works from UTC instants (the DB stores UTC)", () => {
  // 12:29:59 UTC = 17:59:59 IST; 12:30 UTC = 18:00 IST.
  assert.equal(payoutDay(new Date("2026-12-01T12:29:59Z"), SETTINGS), "2026-12-01");
  assert.equal(payoutDay(new Date("2026-12-01T12:30:00Z"), SETTINGS), "2026-12-02");
  // 20:00 UTC on the 1st is already 01:30 IST on the 2nd.
  assert.equal(payoutDay(new Date("2026-12-01T20:00:00Z"), SETTINGS), "2026-12-02");
});

test("payoutDay: rolls over month and year ends; every day counts (no holidays)", () => {
  assert.equal(payoutDay(ist("2026-11-30T19:00:00"), SETTINGS), "2026-12-01");
  assert.equal(payoutDay(ist("2026-12-31T18:30:00"), SETTINGS), "2027-01-01");
  // A Sunday stays a Sunday.
  assert.equal(payoutDay(ist("2026-12-06T10:00:00"), SETTINGS), "2026-12-06");
});

// ---- versions in force ---------------------------------------------------------

test("versionInForce: newest published version that has started", () => {
  const versions = [
    v(1, "PUBLISHED", "2026-01-01T00:00:00Z"),
    v(2, "PUBLISHED", "2026-06-01T00:00:00Z"),
    v(3, "PUBLISHED", "2027-01-01T00:00:00Z"), // scheduled
    v(4, "DRAFT", null),
  ];
  assert.equal(versionInForce(versions, new Date("2025-12-31T23:59:59Z")), null);
  assert.equal(versionInForce(versions, new Date("2026-01-01T00:00:00Z"))?.version, 1);
  assert.equal(versionInForce(versions, new Date("2026-05-31T23:59:59Z"))?.version, 1);
  assert.equal(versionInForce(versions, new Date("2026-06-01T00:00:00Z"))?.version, 2);
  assert.equal(versionInForce(versions, new Date("2026-12-31T00:00:00Z"))?.version, 2);
  assert.equal(versionInForce(versions, new Date("2027-01-01T00:00:00Z"))?.version, 3);
});

test("versionInForce: drafts never count", () => {
  assert.equal(versionInForce([v(1, "DRAFT", null)], new Date()), null);
});

test("startedHistory: newest first, periods end at the next started version", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const history = startedHistory(
    [
      v(1, "PUBLISHED", "2026-01-01T00:00:00Z"),
      v(2, "PUBLISHED", "2026-06-01T00:00:00Z"),
      v(3, "PUBLISHED", "2027-01-01T00:00:00Z"), // not started — hidden
      v(4, "DRAFT", null),
    ],
    now,
  );
  assert.deepEqual(
    history.map((h) => [h.version, h.effectiveTo?.toISOString() ?? null]),
    [
      [2, null], // still in force — the scheduled v3 doesn't end it yet
      [1, "2026-06-01T00:00:00.000Z"],
    ],
  );
});

// ---- publish start time -----------------------------------------------------------

test("effectiveFromProblem: not in the past, always after the last start", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  assert.equal(effectiveFromProblem(now, now, null), null);
  assert.equal(effectiveFromProblem(new Date("2026-12-05T00:00:00Z"), now, null), null);
  // Small client-clock grace, then refused.
  assert.equal(effectiveFromProblem(new Date("2026-12-01T11:59:00Z"), now, null), null);
  assert.match(effectiveFromProblem(new Date("2026-12-01T11:50:00Z"), now, null) ?? "", /past/);
  // Same or earlier start than the previous published version → refused.
  const last = new Date("2026-12-10T00:00:00Z");
  assert.match(effectiveFromProblem(last, now, last) ?? "", /after the previous/);
  assert.match(effectiveFromProblem(new Date("2026-12-05T00:00:00Z"), now, last) ?? "", /after the previous/);
  assert.equal(effectiveFromProblem(new Date("2026-12-10T00:00:01Z"), now, last), null);
});

// ---- settings shape ------------------------------------------------------------

test("settingsProblem: PYO-001 needs valid times, a real timezone and start < end", () => {
  assert.equal(settingsProblem("PYO-001", SETTINGS), null);
  assert.equal(settingsProblem("PYO-001", null), null); // allowed while drafting
  assert.match(settingsProblem("PYO-001", { ...SETTINGS, cutoff: "6 PM" }) ?? "", /cutoff/);
  assert.match(settingsProblem("PYO-001", { ...SETTINGS, cutoff: "24:00" }) ?? "", /cutoff/);
  assert.match(settingsProblem("PYO-001", { ...SETTINGS, timezone: "India/Kochi" }) ?? "", /timezone/);
  assert.match(settingsProblem("PYO-001", { ...SETTINGS, windowEnd: "17:00" }) ?? "", /windowEnd/);
  assert.match(settingsProblem("PYO-001", { ...SETTINGS, extra: "x" }) ?? "", /settings/);
});

test("settingsProblem: a code without rules takes no settings", () => {
  assert.equal(settingsProblem("TOS-001", null), null);
  assert.match(settingsProblem("TOS-001", { a: 1 }) ?? "", /no settings/);
});

// ---- wording ----------------------------------------------------------------------

test("formatTime: 24-hour to 12-hour", () => {
  assert.equal(formatTime("18:00"), "6:00 PM");
  assert.equal(formatTime("22:30"), "10:30 PM");
  assert.equal(formatTime("00:05"), "12:05 AM");
  assert.equal(formatTime("12:00"), "12:00 PM");
});

test("renderBody: placeholders come from the version's settings", () => {
  const body = "Delivered before {{cutoff}} {{tz}}: paid between {{ windowStart }} and {{windowEnd}} {{tz}}.";
  assert.equal(renderBody(body, SETTINGS), "Delivered before 6:00 PM IST: paid between 6:00 PM and 10:00 PM IST.");
  // Change the settings, and the wording follows.
  assert.equal(
    renderBody("Before {{cutoff}}", { ...SETTINGS, cutoff: "17:00" }),
    "Before 5:00 PM",
  );
  // No settings → text unchanged; unknown placeholders left as typed.
  assert.equal(renderBody("Hi {{cutoff}}", null), "Hi {{cutoff}}");
  assert.equal(renderBody("{{nope}}", SETTINGS), "{{nope}}");
});

test("bodyProblems: PYO-001 wording must use every time placeholder, and only known ones", () => {
  const good = "{{cutoff}} {{windowStart}} {{windowEnd}} {{tz}}";
  assert.deepEqual(bodyProblems("PYO-001", good), []);
  assert.deepEqual(bodyProblems("PYO-001", "Paid at 6 PM"), [
    "The wording must use {{cutoff}}",
    "The wording must use {{windowStart}}",
    "The wording must use {{windowEnd}}",
    "The wording must use {{tz}}",
  ]);
  assert.deepEqual(bodyProblems("PYO-001", `${good} {{bank}}`), ["Unknown placeholder {{bank}}"]);
  assert.deepEqual(bodyProblems("PYO-001", "  "), [
    "The policy wording is empty",
    "The wording must use {{cutoff}}",
    "The wording must use {{windowStart}}",
    "The wording must use {{windowEnd}}",
    "The wording must use {{tz}}",
  ]);
  // A code without settings: plain text is fine, placeholders are not.
  assert.deepEqual(bodyProblems("TOS-001", "Plain terms."), []);
  assert.deepEqual(bodyProblems("TOS-001", "{{cutoff}}"), ["Unknown placeholder {{cutoff}}"]);
});
