import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * Shipping CHARGES — how much a seller charges to deliver an order.
 * (WHERE they deliver is `deliveryRules.ts`; the two are independent.)
 *
 * MVP pricing, deliberately simple — no weight bands, no courier APIs:
 *
 *   Store rate (`Store.shipping.rate`, the default for every product)
 *     FREE                       → ₹0
 *     FLAT amount                → one charge per ORDER (not per item)
 *     FLAT amount + freeAbove    → the charge is waived once the order
 *                                  subtotal reaches `freeAbove`
 *
 *   Product override (`StoreProduct.shippingOverride`, optional)
 *     FREE                       → this product never adds a charge
 *     FLAT amount                → this product ships for `amount` per order
 *
 * **Combining rule for an order** (`quoteShipping`): a flat rate is a
 * per-order price, so the order pays the HIGHEST applicable one — the store
 * rate (after its free-above threshold) for lines that follow the default,
 * or the product's own rate for lines that override it. Rates are never
 * summed: a seller who marks one heavy item "₹200" means "an order with this
 * in it costs ₹200 to ship", not "₹200 on top of the usual ₹80". FREE lines
 * never add anything, and a product override is explicit, so the store's
 * free-above threshold does not waive it.
 *
 * This module is the ONLY place a charge is computed. The checkout quote
 * endpoint and order placement both call `quoteShipping`, so what the
 * customer is shown is exactly what they are charged — the client never
 * calculates shipping itself.
 */

export const SHIPPING_RATE_TYPES = ["FREE", "FLAT"] as const;
export type ShippingRateType = (typeof SHIPPING_RATE_TYPES)[number];

/** Rupees, two decimals, sane upper bound for a per-order charge. */
const MAX_AMOUNT = 99_999.99;
/** Free-above thresholds are order subtotals — allow anything a cart can reach. */
const MAX_THRESHOLD = 99_999_999.99;

const money = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .transform((n) => Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------
// Store rate
// ---------------------------------------------------------------------------

export interface ShippingRate {
  type: ShippingRateType;
  /** Per-order charge for FLAT; always 0 for FREE. */
  amount: number;
  /** FLAT only: subtotal at/above which shipping is free. Null = never. */
  freeAbove: number | null;
}

export const DEFAULT_SHIPPING_RATE: ShippingRate = {
  type: "FREE",
  amount: 0,
  freeAbove: null,
};

/**
 * Rate input. FLAT needs a positive amount — a "flat ₹0" is FREE, and
 * storing it as FLAT would make the seller UI say "Flat rate ₹0", which is
 * a contradiction. FREE ignores (and clears) amount/threshold.
 */
export const shippingRateSchema = z
  .object({
    type: z.enum(SHIPPING_RATE_TYPES),
    amount: money(MAX_AMOUNT).default(0),
    freeAbove: money(MAX_THRESHOLD).nullable().default(null),
  })
  .transform(
    (rate): ShippingRate =>
      rate.type === "FREE"
        ? { ...DEFAULT_SHIPPING_RATE }
        : { type: "FLAT", amount: rate.amount, freeAbove: rate.freeAbove },
  )
  .superRefine((rate, ctx) => {
    if (rate.type === "FLAT" && rate.amount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter a shipping charge above ₹0, or choose Free shipping",
      });
    }
  });

export type ShippingRateInput = z.input<typeof shippingRateSchema>;

/** Normalise the stored store rate — unknown / garbage → FREE. */
export function resolveShippingRate(raw: unknown): ShippingRate {
  const parsed = shippingRateSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_SHIPPING_RATE };
}

// ---------------------------------------------------------------------------
// Product override
// ---------------------------------------------------------------------------

export interface ProductShippingOverride {
  type: ShippingRateType;
  /** Per-order charge for FLAT; always 0 for FREE. */
  amount: number;
}

export const productShippingOverrideSchema = z
  .object({
    type: z.enum(SHIPPING_RATE_TYPES),
    amount: money(MAX_AMOUNT).default(0),
  })
  .transform(
    (rule): ProductShippingOverride =>
      rule.type === "FREE"
        ? { type: "FREE", amount: 0 }
        : { type: "FLAT", amount: rule.amount },
  )
  .superRefine((rule, ctx) => {
    if (rule.type === "FLAT" && rule.amount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter a shipping charge above ₹0, or choose Free shipping",
      });
    }
  });

export type ProductShippingOverrideInput = z.input<
  typeof productShippingOverrideSchema
>;

/**
 * Normalise a PRODUCT's stored override — null / garbage → null, meaning
 * "follow the store rate". Garbage never becomes FREE: that would silently
 * give a product away shipping the seller meant to charge for.
 */
export function resolveProductShippingOverride(
  raw: unknown,
): ProductShippingOverride | null {
  if (raw === null || raw === undefined) return null;
  const parsed = productShippingOverrideSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

/**
 * Why an order's charge is what it is. Snapshotted on the order
 * (`Order.shippingBasis`) so a seller or admin can read the reason without
 * re-running rules that may since have changed.
 */
export type ShippingBasis =
  | { kind: "PICKUP" }
  | { kind: "STORE_FREE" }
  | { kind: "STORE_FLAT"; amount: number; freeAbove: number | null }
  | { kind: "FREE_ABOVE"; amount: number; freeAbove: number }
  | { kind: "PRODUCT_FREE" }
  | { kind: "PRODUCT_RATE"; amount: number; productName: string };

export interface ShippingQuote {
  charge: Prisma.Decimal;
  /** Customer-facing label — "Free delivery" / "Standard delivery" / "Store pickup". */
  method: string;
  basis: ShippingBasis;
}

export interface ShippingQuoteLine {
  productName: string;
  /** The product's own override, or null when it follows the store rate. */
  override: ProductShippingOverride | null;
}

/**
 * The one shipping calculation. Pure — no I/O — so it is trivially the same
 * for the checkout quote and for order placement.
 */
export function quoteShipping(input: {
  fulfilment: "DELIVERY" | "PICKUP";
  storeRate: ShippingRate;
  subtotal: Prisma.Decimal;
  lines: ShippingQuoteLine[];
}): ShippingQuote {
  if (input.fulfilment === "PICKUP") {
    return {
      charge: new Prisma.Decimal(0),
      method: "Store pickup",
      basis: { kind: "PICKUP" },
    };
  }

  // --- the store rate, for lines that follow the default -------------------
  const defaultLines = input.lines.filter((line) => line.override === null);
  let storeCharge = 0;
  let storeBasis: ShippingBasis = { kind: "STORE_FREE" };
  if (defaultLines.length > 0 && input.storeRate.type === "FLAT") {
    const { amount, freeAbove } = input.storeRate;
    if (freeAbove !== null && input.subtotal.gte(freeAbove)) {
      storeBasis = { kind: "FREE_ABOVE", amount, freeAbove };
    } else {
      storeCharge = amount;
      storeBasis = { kind: "STORE_FLAT", amount, freeAbove };
    }
  }

  // --- product overrides: the dearest FLAT one, if any ---------------------
  let productCharge = 0;
  let productName: string | null = null;
  for (const line of input.lines) {
    if (line.override?.type === "FLAT" && line.override.amount > productCharge) {
      productCharge = line.override.amount;
      productName = line.productName;
    }
  }

  // --- highest applicable per-order rate wins (ties go to the store rate) --
  let charge = storeCharge;
  let basis: ShippingBasis = storeBasis;
  if (productCharge > storeCharge && productName !== null) {
    charge = productCharge;
    basis = { kind: "PRODUCT_RATE", amount: productCharge, productName };
  } else if (
    charge === 0 &&
    defaultLines.length === 0 &&
    input.lines.length > 0
  ) {
    // Every line overrides, and none of them charges.
    basis = { kind: "PRODUCT_FREE" };
  }

  return {
    charge: new Prisma.Decimal(charge),
    method: charge === 0 ? "Free delivery" : "Standard delivery",
    basis,
  };
}

/**
 * The rate a product page should advertise: the product's override when it
 * has one, else the store rate. Purely informational — the order's actual
 * charge is `quoteShipping` over the whole cart.
 */
export function effectiveProductShipping(
  override: ProductShippingOverride | null,
  storeRate: ShippingRate,
): {
  type: ShippingRateType;
  amount: number;
  freeAbove: number | null;
  source: "PRODUCT" | "STORE";
} {
  if (override) {
    return {
      type: override.type,
      amount: override.amount,
      freeAbove: null,
      source: "PRODUCT",
    };
  }
  return { ...storeRate, source: "STORE" };
}
