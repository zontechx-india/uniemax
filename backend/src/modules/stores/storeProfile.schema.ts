import { z } from "zod";
import { resolveAddress, storeAddressSchema } from "./storeAddress.schema.js";

/**
 * The store's **business identity** — who is really selling, how to reach
 * them, where they trade from, and the tax IDs the platform needs before it
 * can move money on their behalf.
 *
 * Persisted as the `Store.profile` JSON column, following the same
 * evolve-without-migration pattern as `theme` / `homepage` / `footer`: a new
 * field is a line in this file plus a default, never a migration, and
 * `resolveProfile` back-fills it for every existing row on read.
 *
 * Deliberately separate from `Store.footer`:
 *   - `profile` is OPERATIONAL — the legal entity, the business address, the PAN.
 *     Orders, invoices, payouts and compliance read it. Customers never see
 *     most of it.
 *   - `footer` is PRESENTATIONAL — the branch list and social links the owner
 *     chooses to show at the bottom of their storefront.
 * One is truth, the other is marketing. Collapsing them would mean a seller
 * hiding a footer location also loses their business address.
 */

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Loose phone shape — digits with optional +, spaces, dashes, parentheses. */
const phone = z
  .string()
  .trim()
  .min(5)
  .max(20)
  .regex(/^\+?[\d\s\-()]+$/, "Enter a valid phone number");

const email = z.string().trim().email("Enter a valid email").max(160);

/**
 * PAN — five letters, four digits, one letter (ABCDE1234F). The fourth
 * character encodes the holder type (P individual, C company, H HUF, F firm…)
 * but every type is a valid seller, so it isn't constrained further here.
 */
export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN like ABCDE1234F");

/**
 * GSTIN — 2-digit state code, the holder's 10-character PAN, an entity digit,
 * the letter Z, then a checksum character. Because the PAN sits inside it,
 * `gstinContainsPan` can cross-check the two the seller typed.
 */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    "Enter a valid 15-character GSTIN",
  );

/** Characters 3–12 of a GSTIN are the holder's PAN — they must agree. */
export function gstinContainsPan(gstin: string, pan: string): boolean {
  return gstin.slice(2, 12).toUpperCase() === pan.toUpperCase();
}

/**
 * Tax and registration identifiers.
 *
 * Both IDs are **nullable here and gated elsewhere** — see
 * `storeReadiness.ts`. Nothing about selling on a COD-only store requires a
 * PAN, so demanding one at signup would cost sellers for no reason. It
 * becomes mandatory at the point it actually matters: enabling online
 * payment, where the platform collects money and pays it out (and where a
 * missing PAN pushes 194-O TDS from 1% to 5% under 206AA).
 *
 * GSTIN stays optional permanently: since the 2023 exemption, small sellers
 * supplying only within their own state can trade on a marketplace without
 * registering. `gstExempt` records that the seller has said so, which is
 * different from having not answered yet.
 */
export const storeTaxSchema = z.object({
  pan: panSchema.nullish().transform((v) => (v ? v : null)),
  gstin: gstinSchema.nullish().transform((v) => (v ? v : null)),
  /** Seller declared they are not GST-registered (below the threshold). */
  gstExempt: z.boolean().default(false),
  /** CIN / LLPIN / Udyam / shop licence — free text, purely informational. */
  registrationNumber: optionalText(60),
});

export type StoreTax = z.infer<typeof storeTaxSchema>;

/**
 * The full profile.
 *
 * Every field is nullable at the schema level so a partially-completed
 * profile is a legal state — onboarding is resumable, and a seller who
 * abandons the wizard midway keeps what they typed. What is *required* is
 * decided per gate in `storeReadiness.ts`, not here. Validation still applies
 * to whatever IS present: a phone number that is filled in must be a real
 * one.
 */
export const storeProfileSchema = z.object({
  /** The legal / trading entity, when it differs from the storefront name. */
  businessName: optionalText(120),
  /** The human accountable for the store — the platform's contact. */
  sellerName: optionalText(80),
  /** Business contact, independent of the owner's login identifiers. */
  phone: phone.nullish().transform((v) => (v ? v : null)),
  email: email.nullish().transform((v) => (v ? v : null)),
  /**
   * Where the business is registered and operates from — the ONE address the
   * platform holds. Sellers hand parcels to a courier office themselves, so
   * nothing is ever collected from a warehouse and there is no separate
   * "ship-from" point to ask for. Store pickup by customers is not offered
   * yet; if it is, where they collect belongs in Shipping, decided when that
   * mode is switched on, not asked of every seller at signup.
   */
  address: storeAddressSchema.nullish().transform((v) => v ?? null),
  tax: storeTaxSchema,
});

export type StoreProfile = z.infer<typeof storeProfileSchema>;

/**
 * PATCH body: any subset of the profile. A present key replaces that key
 * wholesale (the wizard and the Business Details page each save one card at
 * a time); absent keys are untouched.
 *
 * `address` accepts an explicit `null` to clear it.
 */
export const storeProfileUpdateSchema = storeProfileSchema
  .partial()
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide at least one profile field to update",
  });

export type StoreProfileUpdateInput = z.infer<typeof storeProfileUpdateSchema>;

export const DEFAULT_STORE_TAX: StoreTax = {
  pan: null,
  gstin: null,
  gstExempt: false,
  registrationNumber: null,
};

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  businessName: null,
  sellerName: null,
  phone: null,
  email: null,
  address: null,
  tax: { ...DEFAULT_STORE_TAX },
};

/**
 * Normalise the stored `profile` JSON into the complete shape.
 *
 * Field-by-field rather than one `safeParse` of the whole object: a single
 * unparseable value (a hand-edited row, a field whose rules tightened after
 * it was saved) must cost only that field, not the seller's entire profile.
 */
export function resolveProfile(raw: unknown): StoreProfile {
  const base: StoreProfile = {
    ...DEFAULT_STORE_PROFILE,
    tax: { ...DEFAULT_STORE_TAX },
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;

  const field = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> | null => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };

  return {
    businessName: field(optionalText(120), obj.businessName),
    sellerName: field(optionalText(80), obj.sellerName),
    phone: field(phone, obj.phone),
    email: field(email, obj.email),
    address: resolveAddress(obj.address),
    tax: field(storeTaxSchema, obj.tax ?? {}) ?? { ...DEFAULT_STORE_TAX },
  };
}