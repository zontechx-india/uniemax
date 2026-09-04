import { z } from "zod";

/**
 * Customer-owned stores. Creation takes a name **and a logo** — both are
 * required, so POST /stores is a multipart request (text field `name` plus
 * the file) rather than JSON. PUT /stores/:id/logo swaps the logo later;
 * there is no removal — a store always has one.
 */

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1, "Store name is required").max(60),
});

export const storeUpdateSchema = storeCreateSchema.partial();

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #dc2626");

/**
 * Appearance settings — persisted as the Store.theme JSON column.
 *
 * `secondaryColor` (links, prices & flat highlights) and `surfaceColor`
 * (cards & panels) are **nullable**: `null` means "Auto" — secondary follows
 * the primary color and surface is derived from the background's luminance,
 * exactly the behaviour stores had before these fields existed, so old rows
 * render unchanged.
 */
export const storeThemeColorsSchema = z.object({
  backgroundColor: hexColor,
  primaryColor: hexColor,
  secondaryColor: hexColor.nullable(),
  surfaceColor: hexColor.nullable(),
  /**
   * Text color on primary (CTA) buttons. `null` = Auto: white or near-black,
   * picked from the primary color's luminance so the label stays readable.
   */
  buttonTextColor: hexColor.nullable(),
});

/**
 * The full `Store.theme` column: the five colors plus the provenance of the
 * palette the seller is on.
 *
 * `templateId` records which `StoreThemeTemplate` the colors were COPIED from
 * — provenance only, never a live link: the row holds its own colors, so
 * editing or disabling the template never changes a storefront (and the
 * seller editing colors never touches the template). `themeName` is set once
 * the seller customises a template and names the result; while it is null the
 * store is simply "on" the named template.
 */
export const storeThemeSchema = storeThemeColorsSchema.extend({
  templateId: z.string().trim().max(40).nullable(),
  themeName: z.string().trim().min(1).max(60).nullable(),
});

export const storeThemeUpdateSchema = storeThemeSchema.partial();

/**
 * Storefront homepage sections. The owner controls both their **order** and
 * whether each is shown, so the config is an ORDERED LIST of
 * `{ key, enabled }` rather than a flag map. Persisted as the `Store.homepage`
 * JSON column, so adding a future section (offers, banners, reviews…) is a
 * one-line edit to `HOMEPAGE_SECTION_KEYS` here — `resolveHomepage` appends it
 * (enabled) for existing stores, no migration.
 *
 * A section renders only when it is enabled AND has content — enabling one
 * never forces an empty row to appear. The header/top bar is deliberately NOT
 * a section: it is fixed chrome (logo, search, cart, nav) and always present.
 */
export const HOMEPAGE_SECTION_KEYS = [
  "hero",
  "categories",
  "featured",
  "newArrivals",
  "bestSellers",
] as const;

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];

export interface HomepageSection {
  key: HomepageSectionKey;
  enabled: boolean;
}

/** Canonical order, all enabled — used for new stores and as the fallback. */
export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSection[] =
  HOMEPAGE_SECTION_KEYS.map((key) => ({ key, enabled: true }));

/**
 * PATCH body: the FULL ordered section list (a permutation of every known key,
 * each with its enabled flag). A reorder and a toggle are the same operation —
 * replace the list — and the client always holds the complete list, so
 * requiring the whole thing keeps the stored order unambiguous.
 */
export const storeHomepageSchema = z
  .object({
    sections: z
      .array(
        z.object({
          key: z.enum(HOMEPAGE_SECTION_KEYS),
          enabled: z.boolean(),
        }),
      )
      .length(HOMEPAGE_SECTION_KEYS.length),
  })
  .superRefine((val, ctx) => {
    const keys = val.sections.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A section is listed more than once",
      });
    }
    for (const key of HOMEPAGE_SECTION_KEYS) {
      if (!keys.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections"],
          message: `Missing section: ${key}`,
        });
      }
    }
  });

/**
 * Normalise the stored `homepage` JSON into an ordered section list. Tolerant
 * of every shape the column might hold:
 *   - null / garbage       → default order, all enabled
 *   - `{ sections: [...] }` → known keys in stored order; any key missing (a
 *                             section added since it was saved) is appended
 *                             enabled, unknown keys dropped
 *   - legacy boolean map    → canonical order with the stored enabled flags,
 *     `{ hero: true, … }`     so the format change loses nothing
 */
export function resolveHomepage(raw: unknown): HomepageSection[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.sections)) {
      const seen = new Set<HomepageSectionKey>();
      const out: HomepageSection[] = [];
      for (const item of obj.sections) {
        const key = (item as { key?: unknown } | null)?.key;
        if (
          typeof key === "string" &&
          (HOMEPAGE_SECTION_KEYS as readonly string[]).includes(key) &&
          !seen.has(key as HomepageSectionKey)
        ) {
          seen.add(key as HomepageSectionKey);
          out.push({
            key: key as HomepageSectionKey,
            enabled: (item as { enabled?: unknown }).enabled !== false,
          });
        }
      }
      for (const key of HOMEPAGE_SECTION_KEYS) {
        if (!seen.has(key)) out.push({ key, enabled: true });
      }
      return out;
    }
    // Legacy boolean-map shape.
    return HOMEPAGE_SECTION_KEYS.map((key) => ({
      key,
      enabled: obj[key] !== false,
    }));
  }
  return DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s }));
}

/** Publish / unpublish the store's public page. */
export const storePublishSchema = z.object({
  isPublished: z.boolean(),
});

// ---------------------------------------------------------------------------
// Payment settings — which payment/fulfilment methods the store accepts
// (Store.payments JSON, same evolve-without-migration pattern as theme)
// ---------------------------------------------------------------------------

/**
 * Seller-configured acceptance switches — how customers PAY.
 * `acceptOnlinePayment` is the platform-processed payment (customers pay
 * through UnieMax, seller is paid out to their primary bank account — the
 * payments module wires the actual gateway later); `acceptCod` is cash on
 * delivery. Defaults: COD on (the Phase-1 method), online off. How
 * customers RECEIVE the order (delivery / pickup) lives in the separate
 * shipping settings below.
 */
export const storePaymentsSchema = z.object({
  acceptOnlinePayment: z.boolean(),
  acceptCod: z.boolean(),
});

export const storePaymentsUpdateSchema = storePaymentsSchema
  .partial()
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide at least one payment setting to update",
  });

export type StorePayments = z.infer<typeof storePaymentsSchema>;
export type StorePaymentsUpdateInput = z.infer<typeof storePaymentsUpdateSchema>;

export const DEFAULT_STORE_PAYMENTS: StorePayments = {
  acceptOnlinePayment: false,
  acceptCod: true,
};

/** Normalise the stored `payments` JSON — missing/garbage keys → defaults. */
export function resolvePayments(raw: unknown): StorePayments {
  const base = { ...DEFAULT_STORE_PAYMENTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof StorePayments)[]) {
    if (typeof obj[key] === "boolean") base[key] = obj[key];
  }
  return base;
}

// ---------------------------------------------------------------------------
// Shipping settings — how customers RECEIVE orders (Store.shipping JSON)
// ---------------------------------------------------------------------------

/**
 * Fulfilment mode: the seller delivers orders, lets customers pick up from
 * a business location, or both. Default DELIVERY. Stored as JSON so the
 * upcoming shipping-charge configuration (fixed / district / state rules)
 * can join the same column without a migration.
 */
export const SHIPPING_MODES = ["DELIVERY", "PICKUP", "BOTH"] as const;

export type ShippingMode = (typeof SHIPPING_MODES)[number];

export const storeShippingSchema = z.object({
  mode: z.enum(SHIPPING_MODES),
});

export type StoreShipping = z.infer<typeof storeShippingSchema>;

export const DEFAULT_STORE_SHIPPING: StoreShipping = { mode: "DELIVERY" };

/** Normalise the stored `shipping` JSON — unknown/garbage → default. */
export function resolveShipping(raw: unknown): StoreShipping {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const mode = (raw as Record<string, unknown>).mode;
    if (
      typeof mode === "string" &&
      (SHIPPING_MODES as readonly string[]).includes(mode)
    ) {
      return { mode: mode as ShippingMode };
    }
  }
  return { ...DEFAULT_STORE_SHIPPING };
}

// ---------------------------------------------------------------------------
// Checkout fields — which customer details this store's checkout collects
// (Store.checkout JSON)
// ---------------------------------------------------------------------------

/**
 * The customer fields a checkout can ask for. The seller toggles each; a
 * disabled field is hidden from the customer and excluded from checkout
 * validation. All default TRUE. `name`/`phone`/`email` are contact fields
 * (asked even for store pickup); `address`/`pincode`/`state`/`country` are
 * delivery fields (skipped when the customer picks up).
 */
export const CHECKOUT_FIELD_KEYS = [
  "name",
  "phone",
  "email",
  "address",
  "pincode",
  "state",
  "country",
] as const;

export type CheckoutFieldKey = (typeof CHECKOUT_FIELD_KEYS)[number];

export type StoreCheckoutFields = Record<CheckoutFieldKey, boolean>;

export const storeCheckoutFieldsSchema = z.object(
  Object.fromEntries(
    CHECKOUT_FIELD_KEYS.map((key) => [key, z.boolean()]),
  ) as Record<CheckoutFieldKey, z.ZodBoolean>,
);

export const storeCheckoutUpdateSchema = storeCheckoutFieldsSchema
  .partial()
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide at least one checkout field to update",
  });

export type StoreCheckoutUpdateInput = z.infer<typeof storeCheckoutUpdateSchema>;

export const DEFAULT_CHECKOUT_FIELDS: StoreCheckoutFields = Object.fromEntries(
  CHECKOUT_FIELD_KEYS.map((key) => [key, true]),
) as StoreCheckoutFields;

/** Normalise the stored `checkout` JSON — missing/garbage keys → true. */
export function resolveCheckoutFields(raw: unknown): StoreCheckoutFields {
  const base = { ...DEFAULT_CHECKOUT_FIELDS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  for (const key of CHECKOUT_FIELD_KEYS) {
    if (typeof obj[key] === "boolean") base[key] = obj[key];
  }
  return base;
}

// ---------------------------------------------------------------------------
// Footer — owner-managed storefront footer content (Store.footer JSON)
// ---------------------------------------------------------------------------

/** `https://…` (or `http://`) absolute URL — social profiles, policy pages. */
const footerUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^https?:\/\/\S+$/i, "Must be a full URL starting with http(s)://");

/** A custom footer link may also point inside the storefront (`/about`). */
const footerLinkUrl = z
  .string()
  .trim()
  .max(300)
  .regex(
    /^(https?:\/\/\S+|\/\S*)$/i,
    "Must be a full URL (https://…) or a path starting with /",
  );

/** Loose phone shape — digits with optional +, spaces, dashes, parentheses. */
const footerPhone = z
  .string()
  .trim()
  .min(5)
  .max(20)
  .regex(/^\+?[\d\s\-()]+$/, "Must be a phone number");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalUrl = footerUrl.nullish().transform((v) => (v ? v : null));

/**
 * One business location shown in the storefront footer. Address, mobile
 * number and email are required; everything else is optional. `lat`/`lng`
 * come from the management page's map picker (both or neither) and power the
 * storefront's "View on Google Maps" link.
 */
export const footerLocationSchema = z
  .object({
    /** Stable row identity — assigned server-side when missing. */
    id: z.string().trim().max(60).nullish().transform((v) => (v ? v : null)),
    /** Branch / location name, e.g. "Head Office". */
    label: optionalText(80),
    address: z.string().trim().min(1, "Address is required").max(300),
    contactPerson: optionalText(80),
    phone: footerPhone,
    altPhone: footerPhone.nullish().transform((v) => (v ? v : null)),
    email: z.string().trim().email("Must be a valid email").max(160),
    /** Free-text business hours, e.g. "Mon–Sat, 9 AM – 8 PM". */
    hours: optionalText(120),
    isPrimary: z.boolean().default(false),
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
  });

/**
 * Social profiles. Facebook / Instagram / YouTube are the launch platforms;
 * the rest are future-ready — the storefront renders whichever are set.
 * WhatsApp is a NUMBER (rendered as a wa.me link), not a URL.
 */
export const FOOTER_SOCIAL_KEYS = [
  "facebook",
  "instagram",
  "youtube",
  "whatsapp",
  "x",
  "linkedin",
  "telegram",
  "pinterest",
] as const;

export type FooterSocialKey = (typeof FOOTER_SOCIAL_KEYS)[number];

export const footerSocialSchema = z.object({
  facebook: optionalUrl,
  instagram: optionalUrl,
  youtube: optionalUrl,
  whatsapp: footerPhone.nullish().transform((v) => (v ? v : null)),
  x: optionalUrl,
  linkedin: optionalUrl,
  telegram: optionalUrl,
  pinterest: optionalUrl,
});

/** About + business identity shown in the footer. */
export const footerInfoSchema = z.object({
  about: optionalText(600),
  establishedYear: z
    .number()
    .int()
    .min(1800)
    .max(2100)
    .nullish()
    .transform((v) => v ?? null),
  gstNumber: optionalText(30),
  registrationNumber: optionalText(60),
});

/** Customer-support block (separate from per-location contacts). */
export const footerSupportSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Must be a valid email")
    .max(160)
    .nullish()
    .transform((v) => (v ? v : null)),
  phone: footerPhone.nullish().transform((v) => (v ? v : null)),
  whatsapp: footerPhone.nullish().transform((v) => (v ? v : null)),
  hours: optionalText(120),
});

/**
 * Store policy links. The dedicated policy PAGES arrive in a later release —
 * until then each entry is an optional external URL, so the footer structure
 * supports policies from day one.
 */
export const FOOTER_POLICY_KEYS = [
  "privacy",
  "terms",
  "shipping",
  "returns",
  "cancellation",
] as const;

export type FooterPolicyKey = (typeof FOOTER_POLICY_KEYS)[number];

export const footerPoliciesSchema = z.object({
  privacy: optionalUrl,
  terms: optionalUrl,
  shipping: optionalUrl,
  returns: optionalUrl,
  cancellation: optionalUrl,
});

/** A custom footer link (About Us, FAQ, Careers, Blog…). */
export const footerLinkSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(40),
  url: footerLinkUrl,
});

/**
 * The full footer configuration. Persisted as the `Store.footer` JSON column
 * (same pattern as `theme` / `homepage`, so sections can evolve without a
 * migration).
 */
export const storeFooterSchema = z.object({
  locations: z.array(footerLocationSchema).max(10),
  social: footerSocialSchema,
  info: footerInfoSchema,
  support: footerSupportSchema,
  policies: footerPoliciesSchema,
  links: z.array(footerLinkSchema).max(10),
  /**
   * Full custom copyright line. `null` = default — the storefront renders
   * "© {year} {store name}. All Rights Reserved."
   */
  copyrightText: optionalText(120),
});

/**
 * PATCH body: any subset of the footer SECTIONS. A section that is present
 * replaces that section wholesale (the management page edits and saves one
 * card at a time); absent sections are untouched.
 */
export const storeFooterUpdateSchema = storeFooterSchema
  .partial()
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide at least one footer section to update",
  });

export type FooterLocation = z.infer<typeof footerLocationSchema>;
export type StoreFooter = z.infer<typeof storeFooterSchema>;
export type StoreFooterUpdateInput = z.infer<typeof storeFooterUpdateSchema>;

export const DEFAULT_STORE_FOOTER: StoreFooter = {
  locations: [],
  social: {
    facebook: null,
    instagram: null,
    youtube: null,
    whatsapp: null,
    x: null,
    linkedin: null,
    telegram: null,
    pinterest: null,
  },
  info: {
    about: null,
    establishedYear: null,
    gstNumber: null,
    registrationNumber: null,
  },
  support: { email: null, phone: null, whatsapp: null, hours: null },
  policies: {
    privacy: null,
    terms: null,
    shipping: null,
    returns: null,
    cancellation: null,
  },
  links: [],
  copyrightText: null,
};

/**
 * Normalise the stored `footer` JSON into the complete `StoreFooter` shape.
 * Tolerant like `resolveHomepage`: null / garbage → defaults; a partial
 * object (a section added since it was saved) gets the missing sections
 * defaulted; malformed rows inside a list are dropped rather than failing the
 * read. Also enforces the primary-location invariant: at most one location
 * is primary, and the first one is promoted when none is marked.
 */
export function resolveFooter(raw: unknown): StoreFooter {
  const base = structuredClone(DEFAULT_STORE_FOOTER);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;

  // Each section parses independently; a malformed one (hand-edited /
  // legacy) falls back to its default rather than failing the read — the
  // owner just re-saves it from the management page. List rows are parsed
  // one by one so a single bad row never drops its siblings.
  const section = <S extends z.ZodType>(
    schema: S,
    value: unknown,
    fallback: z.output<S>,
  ): z.output<S> => {
    const result = schema.safeParse(value);
    return result.success ? result.data : fallback;
  };
  const rows = <S extends z.ZodType>(schema: S, value: unknown): z.output<S>[] =>
    Array.isArray(value)
      ? value.flatMap((row) => {
          const result = schema.safeParse(row);
          return result.success ? [result.data] : [];
        })
      : [];

  const footer: StoreFooter = {
    locations: rows(footerLocationSchema, obj.locations).slice(0, 10),
    social: section(footerSocialSchema, obj.social ?? {}, base.social),
    info: section(footerInfoSchema, obj.info ?? {}, base.info),
    support: section(footerSupportSchema, obj.support ?? {}, base.support),
    policies: section(footerPoliciesSchema, obj.policies ?? {}, base.policies),
    links: rows(footerLinkSchema, obj.links).slice(0, 10),
    copyrightText: section(optionalText(120), obj.copyrightText, null),
  };
  normalizePrimaryLocation(footer.locations);
  return footer;
}

/** Keep exactly one primary location (the first wins) whenever any exist. */
export function normalizePrimaryLocation(locations: FooterLocation[]): void {
  const primaryIndex = locations.findIndex((l) => l.isPrimary);
  locations.forEach((l, i) => {
    l.isPrimary = i === (primaryIndex === -1 ? 0 : primaryIndex);
  });
}

export const DEFAULT_STORE_THEME: StoreTheme = {
  backgroundColor: "#f9fafb",
  // The platform's Primary Purple — a store that never opens Appearance
  // still looks like it belongs to UnieMax. Mirrored by DEFAULT_THEME in
  // the frontend's `features/stores/storesApi.ts`.
  primaryColor: "#6c3ef4",
  secondaryColor: null,
  surfaceColor: null,
  buttonTextColor: null,
  templateId: null,
  themeName: null,
};

export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StorePublishInput = z.infer<typeof storePublishSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
export type StoreTheme = z.infer<typeof storeThemeSchema>;
export type StoreThemeColors = z.infer<typeof storeThemeColorsSchema>;
export type StoreThemeUpdateInput = z.infer<typeof storeThemeUpdateSchema>;
export type StoreHomepageInput = z.infer<typeof storeHomepageSchema>;
