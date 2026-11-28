import { z } from "zod";

/**
 * PolicyHub rules — pure functions, no database (docs/policyhub/README.md §7).
 * Unit-tested in test/unit/policy.test.ts.
 */

// ---------------------------------------------------------------------------
// Settings shape per policy code
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm, e.g. 18:00");

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = z.string().refine(isTimeZone, "Unknown timezone (use an IANA name, e.g. Asia/Kolkata)");

/** PYO-001 — the seller payout policy. */
export const payoutSettingsSchema = z
  .object({
    cutoff: hhmm,
    windowStart: hhmm,
    windowEnd: hhmm,
    timezone,
  })
  .strict()
  .refine((s) => s.windowStart < s.windowEnd, {
    message: "windowStart must be before windowEnd",
    path: ["windowEnd"],
  });

export type PayoutSettings = z.infer<typeof payoutSettingsSchema>;

interface CodeRules {
  settings: z.ZodType<Record<string, string>>;
  /** Placeholders the wording must use, so the text follows the settings. */
  placeholders: readonly string[];
}

/** Codes with structured settings. Any other code has none. */
const CODE_RULES: Record<string, CodeRules> = {
  "PYO-001": {
    settings: payoutSettingsSchema,
    placeholders: ["cutoff", "windowStart", "windowEnd", "tz"],
  },
};

export function codeRules(code: string): CodeRules | undefined {
  return CODE_RULES[code];
}

/**
 * Checks `settings` against the code's shape. Returns the problem, or null.
 * A code without rules must have no settings.
 */
export function settingsProblem(code: string, settings: unknown): string | null {
  const rules = CODE_RULES[code];
  if (!rules) {
    return settings == null ? null : `Policy ${code} has no settings`;
  }
  if (settings == null) return null; // allowed while drafting; publish requires it
  const parsed = rules.settings.safeParse(settings);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return `settings${issue?.path.length ? "." + issue.path.join(".") : ""}: ${issue?.message ?? "invalid"}`;
}

// ---------------------------------------------------------------------------
// Wording: {{placeholders}} filled from settings
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** "18:00" → "6:00 PM". */
export function formatTime(value: string): string {
  const [h = 0, m = 0] = value.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Asia/Kolkata" → "IST" (the zone's short name; falls back to the IANA name). */
export function timeZoneLabel(tz: string): string {
  const part = new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

/** The value each placeholder stands for, from a code's settings. */
function placeholderValues(settings: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    out[key] = key === "timezone" ? value : formatTime(value);
  }
  if (settings.timezone) out.tz = timeZoneLabel(settings.timezone);
  return out;
}

/** Every placeholder name used in a body, in order, without repeats. */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1] as string))];
}

/**
 * What stops this wording from being published (empty = fine): a required
 * placeholder missing, or one the code doesn't know.
 */
export function bodyProblems(code: string, body: string): string[] {
  const problems: string[] = [];
  if (!body.trim()) problems.push("The policy wording is empty");
  const used = placeholdersIn(body);
  const required = CODE_RULES[code]?.placeholders ?? [];
  for (const name of required) {
    if (!used.includes(name)) problems.push(`The wording must use {{${name}}}`);
  }
  for (const name of used) {
    if (!required.includes(name)) problems.push(`Unknown placeholder {{${name}}}`);
  }
  return problems;
}

/**
 * The wording as readers see it: placeholders replaced from the same
 * version's settings. An unknown placeholder is left as typed (publish
 * refuses those, so it only shows in a draft preview).
 */
export function renderBody(body: string, settings: unknown): string {
  if (settings == null || typeof settings !== "object") return body;
  const values = placeholderValues(settings as Record<string, string>);
  return body.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
}

// ---------------------------------------------------------------------------
// Versions in force
// ---------------------------------------------------------------------------

export interface VersionLike {
  version: number;
  status: "DRAFT" | "PUBLISHED";
  effectiveFrom: Date | null;
}

/** Published versions, oldest start first. */
function published<T extends VersionLike>(versions: readonly T[]): (T & { effectiveFrom: Date })[] {
  return versions
    .filter((v): v is T & { effectiveFrom: Date } => v.status === "PUBLISHED" && v.effectiveFrom !== null)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
}

/** The newest PUBLISHED version whose `effectiveFrom` ≤ `at`, or null. */
export function versionInForce<T extends VersionLike>(versions: readonly T[], at: Date): T | null {
  let found: T | null = null;
  for (const v of published(versions)) {
    if (v.effectiveFrom.getTime() <= at.getTime()) found = v;
  }
  return found;
}

/**
 * Published versions that have started by `now`, newest first, each with
 * its period: from its `effectiveFrom` until the next started version's
 * (null = still in force). A version scheduled for later is left out — and
 * so it doesn't end the current one yet.
 */
export function startedHistory<T extends VersionLike>(
  versions: readonly T[],
  now: Date,
): (T & { effectiveFrom: Date; effectiveTo: Date | null })[] {
  const started = published(versions).filter((v) => v.effectiveFrom.getTime() <= now.getTime());
  return started
    .map((v, i) => ({ ...v, effectiveTo: started[i + 1]?.effectiveFrom ?? null }))
    .reverse();
}

/** Grace for "now" sent by a client whose clock is a little behind. */
export const PUBLISH_CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * Checks a requested `effectiveFrom`. Returns the problem, or null.
 * Rules: not in the past (small clock grace), and strictly after the latest
 * published version's start — so history can never be rewritten and two
 * versions never start together.
 */
export function effectiveFromProblem(
  effectiveFrom: Date,
  now: Date,
  latestPublishedFrom: Date | null,
): string | null {
  if (effectiveFrom.getTime() < now.getTime() - PUBLISH_CLOCK_SKEW_MS) {
    return "The start time can't be in the past";
  }
  if (latestPublishedFrom && effectiveFrom.getTime() <= latestPublishedFrom.getTime()) {
    return `The start time must be after the previous version's (${latestPublishedFrom.toISOString()})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payout day (PYO-001)
// ---------------------------------------------------------------------------

/** Calendar date + time of day of an instant in a timezone. */
function localParts(at: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

/** "2026-11-30" + 1 day → "2026-12-01". */
function nextDate(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The day (YYYY-MM-DD, in the policy's timezone) a delivered order's payout
 * is due: delivered before the cutoff → that day; at the cutoff or later →
 * the next day. Every calendar day counts (decision P10 — no holidays).
 */
export function payoutDay(deliveredAt: Date, settings: PayoutSettings): string {
  const { date, time } = localParts(deliveredAt, settings.timezone);
  return time < `${settings.cutoff}:00` ? date : nextDate(date);
}
