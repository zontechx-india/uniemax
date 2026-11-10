import { createHash } from "node:crypto";

/**
 * Hashing helpers for Meta's Conversions API user_data.
 *
 * Meta expects user identifiers lowercased, trimmed, and SHA-256 hashed before
 * they leave our server; sending raw email or phone would both violate Meta's
 * terms and leak PII into an ad platform's logs. Phones use E.164 WITHOUT the
 * leading `+` (per Meta's docs), region India assumed when a 10-digit mobile
 * is sent without a country code.
 */

/** SHA-256 hex of the given string. */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Hash an email the Meta way (trim + lower + sha256). `null` for empty. */
export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalised = email.trim().toLowerCase();
  return normalised ? sha256Hex(normalised) : null;
}

/**
 * Normalise an Indian phone number to E.164 without the leading `+`:
 *
 *   "+91 97080 12345"  → "919708012345"
 *   "9708012345"        → "919708012345"
 *   "0091-97080-12345"  → "919708012345"
 *
 * Returns `null` when there is nothing recognisable. The caller handles that.
 */
export function normaliseIndianPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.startsWith("0091") && digits.length === 14) return digits.slice(2);
  if (digits.length === 10) return `91${digits}`;
  // Last resort: strip leading zeroes and return whatever is left. Meta will
  // either match on it or won't; we never send raw input to the Graph API.
  return digits.replace(/^0+/, "") || null;
}

/** Hash a phone number the Meta way (E.164 without `+`, sha256). */
export function hashPhone(phone: string | null | undefined): string | null {
  const normalised = normaliseIndianPhone(phone);
  return normalised ? sha256Hex(normalised) : null;
}

/** Hash an opaque internal id (external_id). */
export function hashExternalId(id: string): string {
  return sha256Hex(id);
}
