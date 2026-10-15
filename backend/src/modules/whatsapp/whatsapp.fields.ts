import { z } from "zod";

/**
 * How a template is filled for many people at once. Pure (no env, no Prisma),
 * unit-tested in test/unit/.
 *
 * A **mapping** says, per template slot, what to put there: text that may
 * name the recipient's fields in braces — "{seller_name}", "{store_slug}/products"
 * — with an optional fallback for when a named field is empty. Campaigns and
 * automations store one mapping and resolve it per recipient; a recipient a
 * slot can't be filled for (empty field, no fallback) is skipped, never sent
 * a message with a hole in it.
 */

/** Fields each audience provides — the console offers these as chips. */
export const FIELD_CATALOGUE = {
  sellers: [
    { key: "seller_name", label: "Seller name", example: "Rahul" },
    { key: "store_name", label: "Store name", example: "Sabse Kart" },
    { key: "store_slug", label: "Store slug (for links)", example: "sabse-kart" },
    { key: "store_url", label: "Storefront link", example: "https://uniemax.com/store/sabse-kart" },
    { key: "dashboard_url", label: "Seller dashboard link", example: "https://uniemax.com/mystores/sabse-kart" },
    { key: "setup_percent", label: "Setup complete", example: "58%" },
    { key: "pending_steps", label: "Setup still to do", example: "Products, Address" },
    { key: "product_count", label: "Live products", example: "4" },
    { key: "order_count", label: "Orders", example: "12" },
    { key: "city", label: "City", example: "Kochi" },
    { key: "state", label: "State", example: "Kerala" },
    { key: "phone", label: "Phone", example: "+919876543210" },
  ],
  contacts: [
    { key: "name", label: "WhatsApp name", example: "Asha" },
    { key: "phone", label: "Phone", example: "+919876543210" },
  ],
  /** Order automations add these to the seller fields. */
  orders: [
    { key: "order_number", label: "Order number", example: "UM-1042" },
    { key: "order_total", label: "Order total", example: "₹1,250" },
    { key: "customer_name", label: "Customer name", example: "Priya" },
  ],
} as const;

const valueSource = z.object({
  /** Text, with {field} placeholders. */
  value: z.string().trim().min(1).max(1024),
  /** Used when a named field is empty. Blank = skip the recipient instead. */
  fallback: z.string().trim().max(1024).optional(),
});

export const mappingSchema = z.object({
  body: z.array(valueSource).max(50).default([]),
  buttons: z
    .array(
      valueSource.extend({
        /**
         * Count clicks: `value` is then the DESTINATION URL, and the button is
         * filled with a tracking code (the template's link must end in /r/{{1}}).
         */
        track: z.boolean().default(false),
      }),
    )
    .max(10)
    .default([]),
  header: z
    .object({
      type: z.enum(["image", "video", "document"]),
      link: z.string().trim().url().max(2048),
    })
    .nullable()
    .default(null),
});

export type Mapping = z.infer<typeof mappingSchema>;
export type FieldValues = Record<string, string | null | undefined>;

const TOKEN = /\{([a-z_]+)\}/g;

/** Meta refuses parameters with newlines, tabs or 4+ spaces in a row. */
export const cleanParam = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 1024);

/** "{a} and {b}" with the fields filled; `missing` names any that were empty. */
export function interpolate(text: string, fields: FieldValues) {
  const missing: string[] = [];
  const out = text.replace(TOKEN, (_match, key: string) => {
    const value = fields[key]?.trim();
    if (!value) {
      missing.push(key);
      return "";
    }
    return value;
  });
  return { text: out, missing };
}

/** One slot's value, or null when it can't be filled (empty field, no fallback). */
export function resolveValue(
  source: { value: string; fallback?: string | undefined },
  fields: FieldValues,
): string | null {
  const primary = interpolate(source.value, fields);
  const text = cleanParam(primary.text);
  if (primary.missing.length === 0 && text) return text;
  if (!source.fallback) return null;
  const fallback = cleanParam(interpolate(source.fallback, fields).text);
  return fallback || null;
}

export interface ResolvedMapping {
  bodyParams: string[];
  /** In button order; a tracked button carries its destination, not its code yet. */
  buttons: { value: string; track: boolean }[];
  /** The slots that couldn't be filled — "{{2}}", "button 1". Empty = sendable. */
  unfilled: string[];
}

export function resolveMapping(mapping: Mapping, fields: FieldValues): ResolvedMapping {
  const unfilled: string[] = [];
  const bodyParams = mapping.body.map((source, i) => {
    const value = resolveValue(source, fields);
    if (value === null) unfilled.push(`{{${i + 1}}}`);
    return value ?? "";
  });
  const buttons = mapping.buttons.map((source, i) => {
    const value = resolveValue(source, fields);
    if (value === null) unfilled.push(`button ${i + 1}`);
    return { value: value ?? "", track: source.track };
  });
  return { bodyParams, buttons, unfilled };
}

/** The tracked-link redirect a template button must point at to count clicks. */
export const TRACKING_PATH = "/api/v1/r/";

export function isTrackingUrl(templateUrl: string): boolean {
  return templateUrl.includes(`${TRACKING_PATH}{{`);
}
