import { z } from "zod";

/**
 * Safe boolean coercion for query strings. `z.coerce.boolean()` uses JS
 * `Boolean()`, so the string "false" becomes `true`. This treats the usual
 * truthy/falsy string tokens correctly.
 */
export const boolQuery = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

/** Shared pagination query params. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Common route params. */
export const idParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1) });

/** Phone number — digits, optional leading +, 7–15 chars (loose E.164). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number");

/**
 * Postal-code check shared by the address book, checkout and billing
 * addresses. India (the default country everywhere in the product) uses a
 * 6-digit PIN that never starts with 0; any other country keeps the loose
 * alphanumeric shape so international addresses still save.
 */
export function isIndia(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase();
  return c === "" || c === "india" || c === "in" || c === "bharat";
}

export function isValidPincode(
  pincode: string,
  country: string | null | undefined,
): boolean {
  const value = normalizePincode(pincode, country);
  return isIndia(country)
    ? /^[1-9]\d{5}$/.test(value)
    : /^[A-Za-z0-9 -]{3,10}$/.test(value);
}

/**
 * Forgiving PIN input: an Indian PIN typed as "682 001" or "682-001" is the
 * same six digits, so separators are dropped before it is checked or
 * stored. Other countries' postcodes keep their spacing ("SW1A 1AA").
 */
export function normalizePincode(
  pincode: string,
  country: string | null | undefined,
): string {
  const value = pincode.trim();
  return isIndia(country) ? value.replace(/[\s-]/g, "") : value;
}

export const PINCODE_MESSAGE = "Enter a valid 6-digit PIN code";

/**
 * Forgiving Indian phone input. People type the same number many ways —
 * "98765 43210", "+91 98765-43210", "098765 43210", "0091 9876543210" — so
 * the separators and the country/trunk prefix are removed and what is left
 * must be 10 digits not starting with 0 or 1 (mobiles start 6–9; a landline
 * with its STD code is also 10 digits). Returns the canonical "+91XXXXXXXXXX"
 * (so seller search by any run of digits matches), or null when the input is
 * not a usable Indian number ("12345"). Non-Indian addresses keep the loose
 * shape check and are stored as typed.
 */
export function normalizeIndianPhone(raw: string): string | null {
  let digits = raw.trim();
  if (!/^[+\d\s\-().]+$/.test(digits)) return null;
  digits = digits.replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

const LOOSE_PHONE = /^\+?[\d\s\-()]{5,20}$/;

/** Canonical phone for the address's country, or null if it is not valid. */
export function normalizePhone(
  raw: string,
  country: string | null | undefined,
): string | null {
  if (isIndia(country)) return normalizeIndianPhone(raw);
  const value = raw.trim();
  return LOOSE_PHONE.test(value) ? value : null;
}

export const PHONE_MESSAGE = "Enter a 10-digit mobile number, e.g. 98765 43210";
