import { z } from "zod";

/**
 * The platform's **canonical postal address**.
 *
 * Addresses show up in several places that used to invent their own shape
 * (the footer's free-text blob, the customer's checkout fields). This is the
 * one structured definition they converge on, so a city or a pincode is a
 * queryable field everywhere rather than something to parse back out of a
 * paragraph. Shipping-charge rules (fixed / district / state) are the next
 * consumer — they need `state` and `pincode` as real columns of the JSON, not
 * a substring.
 *
 * Stored inside a JSON column, never its own table: an address is always
 * owned by exactly one parent and is never queried independently, so a table
 * would buy joins and nothing else. `resolveAddress` gives it the same
 * tolerant-read treatment as the rest of the store's JSON config.
 */

/**
 * Indian states + union territories, the country the platform launches in.
 *
 * A plain list rather than an enum on the column: `state` is validated
 * against it only when `country` is India, so adding a second country later
 * is a new list plus one branch, not a migration.
 */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/** The only country the platform ships to today; the field exists so it isn't the only one forever. */
export const DEFAULT_COUNTRY = "India";

/** Indian PIN code — six digits, never starting at zero. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code");

const line = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * A complete postal address. Everything except `line2` is required — a
 * half-filled address is worse than none: it passes validation, renders on a
 * storefront, and cannot be delivered to.
 *
 * `lat`/`lng` are optional and always travel together (the map picker sets
 * both or neither), matching the footer-location rule already in place.
 */
export const storeAddressSchema = z
  .object({
    line1: line("Address", 200),
    line2: optionalLine(200),
    city: line("City", 80),
    state: line("State", 80),
    pincode: pincodeSchema,
    country: z.string().trim().min(1).max(80).default(DEFAULT_COUNTRY),
    lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
    lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  })
  .superRefine((val, ctx) => {
    if ((val.lat === null) !== (val.lng === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["lat"],
        message: "Latitude and longitude must be set together",
      });
    }
    // States are only checked for the country whose list we hold. Anywhere
    // else, `state` is accepted as free text rather than rejected wrongly.
    if (
      val.country.toLowerCase() === DEFAULT_COUNTRY.toLowerCase() &&
      !(INDIAN_STATES as readonly string[]).includes(val.state)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "Select a valid state",
      });
    }
  });

export type StoreAddress = z.infer<typeof storeAddressSchema>;

/**
 * Read a stored address back. Anything that doesn't parse cleanly becomes
 * `null` rather than throwing — the same rule the rest of the store's JSON
 * follows, so a legacy or hand-edited row degrades to "not filled in yet"
 * (which the readiness checklist then surfaces) instead of breaking the
 * store's entire response.
 */
export function resolveAddress(raw: unknown): StoreAddress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = storeAddressSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** One-line rendering for emails, order slips and the storefront footer. */
export function formatAddress(address: StoreAddress): string {
  return [
    address.line1,
    address.line2,
    address.city,
    `${address.state} ${address.pincode}`.trim(),
    address.country === DEFAULT_COUNTRY ? null : address.country,
  ]
    .filter(Boolean)
    .join(", ");
}
