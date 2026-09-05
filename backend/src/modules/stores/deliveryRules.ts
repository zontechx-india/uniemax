import { z } from "zod";

/**
 * Pincode-based delivery rules — WHERE a seller delivers.
 *
 * A rule is one of three shapes:
 *
 *   ALL      → every pincode (the default; `pincodes` is always empty)
 *   INCLUDE  → only the listed pincodes
 *   EXCLUDE  → every pincode except the listed ones
 *
 * The store carries a DEFAULT rule inside its `shipping` JSON
 * (`Store.shipping.deliveryRule`) that applies to every product; a product
 * may carry its own rule in `StoreProduct.deliveryRule` which, when present,
 * REPLACES the store default for that product (never merges with it).
 * `effectiveDeliveryRule` is the one place that precedence is decided, and
 * the checkout (`orders.service.ts`) and the public delivery check
 * (`publicStore.service.ts`) both go through it, so the answer a customer
 * sees on the product page is exactly the one the order placement enforces.
 *
 * Pincodes are Indian PIN codes — six digits, first digit non-zero — stored
 * normalised (digits only, de-duplicated). Customer input at checkout is
 * looser (`[A-Za-z0-9 -]{3,10}`), so matching strips spaces/hyphens first.
 */

export const DELIVERY_RULE_TYPES = ["ALL", "INCLUDE", "EXCLUDE"] as const;

export type DeliveryRuleType = (typeof DELIVERY_RULE_TYPES)[number];

export const DELIVERY_RULE_LIMITS = {
  /** Pincodes per rule — a district is a few dozen, a state a few thousand. */
  pincodes: 2000,
} as const;

const PINCODE_RE = /^[1-9][0-9]{5}$/;

/** Strip separators so "629 154" and "629-154" compare equal to "629154". */
export function normalisePincode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export const pincodeSchema = z
  .string()
  .transform(normalisePincode)
  .pipe(z.string().regex(PINCODE_RE, "Enter a valid 6-digit pincode"));

export interface DeliveryRule {
  type: DeliveryRuleType;
  pincodes: string[];
}

export const DEFAULT_DELIVERY_RULE: DeliveryRule = { type: "ALL", pincodes: [] };

/**
 * Rule input. INCLUDE / EXCLUDE need at least one pincode — an INCLUDE with
 * nothing in it would mean "deliver nowhere", which is never what a seller
 * meant; ALL ignores (and clears) whatever pincodes were sent. Duplicates
 * are dropped, order is kept.
 */
export const deliveryRuleSchema = z
  .object({
    type: z.enum(DELIVERY_RULE_TYPES),
    pincodes: z
      .array(pincodeSchema)
      .max(
        DELIVERY_RULE_LIMITS.pincodes,
        `Up to ${DELIVERY_RULE_LIMITS.pincodes} pincodes per rule`,
      )
      .default([]),
  })
  .transform((rule): DeliveryRule => ({
    type: rule.type,
    pincodes: rule.type === "ALL" ? [] : [...new Set(rule.pincodes)],
  }))
  .superRefine((rule, ctx) => {
    if (rule.type !== "ALL" && rule.pincodes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["pincodes"],
        message: "Add at least one pincode",
      });
    }
  });

export type DeliveryRuleInput = z.input<typeof deliveryRuleSchema>;

/**
 * Normalise a stored rule — unknown / garbage → ALL. Used for the STORE
 * default, which must always resolve to something.
 */
export function resolveDeliveryRule(raw: unknown): DeliveryRule {
  const parsed = deliveryRuleSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_DELIVERY_RULE };
}

/**
 * Normalise a PRODUCT's stored rule — null / garbage → null, meaning "no
 * override, use the store default". A product never falls back to ALL on
 * its own: that would silently widen delivery past what the seller set.
 */
export function resolveProductDeliveryRule(raw: unknown): DeliveryRule | null {
  if (raw === null || raw === undefined) return null;
  const parsed = deliveryRuleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The rule that applies to a product: its own override, else the store's. */
export function effectiveDeliveryRule(
  product: DeliveryRule | null,
  store: DeliveryRule,
): DeliveryRule {
  return product ?? store;
}

/** True when the rule can refuse some pincode (i.e. is not ALL). */
export function restrictsDelivery(rule: DeliveryRule): boolean {
  return rule.type !== "ALL";
}

/** Whether `pincode` (customer input, any format) is served by `rule`. */
export function isDeliverable(rule: DeliveryRule, pincode: string): boolean {
  if (rule.type === "ALL") return true;
  const listed = rule.pincodes.includes(normalisePincode(pincode));
  return rule.type === "INCLUDE" ? listed : !listed;
}
