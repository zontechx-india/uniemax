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
  const value = pincode.trim();
  return isIndia(country)
    ? /^[1-9]\d{5}$/.test(value)
    : /^[A-Za-z0-9 -]{3,10}$/.test(value);
}

export const PINCODE_MESSAGE = "Enter a valid 6-digit PIN code";
