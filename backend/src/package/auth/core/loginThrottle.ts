import { HttpError } from "../../../utils/httpError.js";
import type { PrincipalType } from "./authCore.types.js";

/**
 * Per-account throttle for password sign-in.
 *
 * The route-level rate limit is per IP, so a credential-stuffing run spread
 * across many addresses never trips it. This counts failed passwords per
 * **account identifier** instead: after `MAX_FAILURES` inside `WINDOW_MS`, the
 * identifier is refused for `LOCK_MS` — whichever IP asks.
 *
 * It is keyed by the submitted email whether or not an account exists, so the
 * 429 itself reveals nothing about which emails are registered. The lock is a
 * cool-down, not a hard lockout: an attacker can at worst make a victim wait
 * 15 minutes (or use OTP / password reset meanwhile), never take the account.
 *
 * State lives in process memory — correct for the single backend process each
 * environment runs; a restart simply forgets the counters.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
/** Hard ceiling on tracked identifiers so a flood can't grow memory unbounded. */
const MAX_TRACKED = 50_000;

interface Entry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

function keyOf(type: PrincipalType, identifier: string): string {
  return `${type}:${identifier.trim().toLowerCase()}`;
}

function prune(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.lockedUntil <= now && entry.windowStart + WINDOW_MS <= now) {
      entries.delete(key);
    }
  }
}

/** Throws 429 while the identifier is cooling down. Call before checking the password. */
export function assertLoginAllowed(type: PrincipalType, identifier: string): void {
  const entry = entries.get(keyOf(type, identifier));
  const now = Date.now();
  if (entry && entry.lockedUntil > now) {
    const minutes = Math.ceil((entry.lockedUntil - now) / 60_000);
    throw HttpError.tooManyRequests(
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`,
    );
  }
}

/** Counts one failed password for the identifier. */
export function recordLoginFailure(type: PrincipalType, identifier: string): void {
  const now = Date.now();
  if (entries.size >= MAX_TRACKED) prune(now);
  const key = keyOf(type, identifier);
  let entry = entries.get(key);
  if (!entry || entry.windowStart + WINDOW_MS <= now) {
    entry = { failures: 0, windowStart: now, lockedUntil: 0 };
    entries.set(key, entry);
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failures = 0;
    entry.windowStart = now;
  }
}

/** A successful sign-in wipes the identifier's failure history. */
export function clearLoginFailures(type: PrincipalType, identifier: string): void {
  entries.delete(keyOf(type, identifier));
}
