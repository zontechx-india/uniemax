import { formatPrice } from './storesApi'
import type { ProductShippingOverride, ShippingRate } from './storesApi'

/**
 * Shipping-rate helpers shared by the seller editors (Shipping page,
 * product forms) and the storefront copy. Mirrors the server's
 * `shippingRates.ts`: FREE / FLAT per order, optional free-above threshold
 * on the store rate only. Nothing here computes an order's charge — that is
 * the server's job (`publicOrderApi.quote`).
 */

/** Rupee amounts as the seller types them — up to two decimals. */
const AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/

/** Parse a typed rupee amount; null when it is not a valid non-negative amount. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (!AMOUNT_RE.test(trimmed)) return null
  return Number(trimmed)
}

/** One-line summary of the store rate — what a product's "Use store rate" reads. */
export function describeShippingRate(rate: ShippingRate): string {
  if (rate.type === 'FREE') return 'Free shipping'
  const flat = `Flat ${formatPrice(rate.amount)} per order`
  return rate.freeAbove !== null
    ? `${flat} · free above ${formatPrice(rate.freeAbove)}`
    : flat
}

/** Short summary of a product override — the product row's "Shipping: …". */
export function describeShippingOverride(rule: ProductShippingOverride): string {
  return rule.type === 'FREE' ? 'Free' : `${formatPrice(rule.amount)} per order`
}

export function sameShippingRate(a: ShippingRate, b: ShippingRate): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'FREE') return true
  return a.amount === b.amount && a.freeAbove === b.freeAbove
}

export function sameShippingOverride(
  a: ProductShippingOverride | null,
  b: ProductShippingOverride | null,
): boolean {
  if (a === null || b === null) return a === b
  if (a.type !== b.type) return false
  return a.type === 'FREE' || a.amount === b.amount
}

/** Why a store rate cannot be saved as-is, or null when it is complete. */
export function shippingRateProblem(rate: ShippingRate): string | null {
  if (rate.type === 'FLAT' && rate.amount <= 0) {
    return 'Enter a shipping charge above ₹0, or choose Free shipping.'
  }
  if (
    rate.type === 'FLAT' &&
    rate.freeAbove !== null &&
    rate.freeAbove <= 0
  ) {
    return 'The free-shipping threshold must be above ₹0, or leave it empty.'
  }
  return null
}

/** Why a product override cannot be saved as-is, or null when it is complete. */
export function shippingOverrideProblem(
  rule: ProductShippingOverride,
): string | null {
  if (rule.type === 'FLAT' && rule.amount <= 0) {
    return 'Enter a shipping charge above ₹0, or choose Free shipping for this product.'
  }
  return null
}
