import * as ga4 from './ga4'
import * as pixel from './metaPixel'
import type { PixelLine } from './metaPixel'

/**
 * The storefront's one tracking API — every moment worth measuring is
 * reported here once, and fans out to both the Meta Pixel (ad optimisation)
 * and GA4 (site analytics). Call sites import from this module, never from
 * `metaPixel.ts` or `ga4.ts` directly, so the two can never disagree about
 * what happened.
 */

export type { PixelLine as TrackedLine }

/** Product detail page opened. */
export function trackViewContent(line: PixelLine, name: string): void {
  pixel.trackViewContent(line, name)
  ga4.viewItem({ ...line, name })
}

/** Item added to the cart (Buy Now counts — it adds, then jumps to checkout). */
export function trackAddToCart(line: PixelLine, name: string): void {
  pixel.trackAddToCart(line, name)
  ga4.addToCart({ ...line, name })
}

/** Checkout opened for one store's cart group. */
export function trackInitiateCheckout(lines: PixelLine[]): void {
  pixel.trackInitiateCheckout(lines)
  ga4.beginCheckout(lines)
}

/** Account created — never a returning sign-in. */
export function trackCompleteRegistration(method: 'email' | 'phone_otp' | 'google'): void {
  pixel.trackCompleteRegistration(method)
  ga4.signUp(method)
}

/**
 * A "Create your store" CTA was tapped; `placement` names which one, and
 * `storeNameEntered` whether the visitor had already typed a store name
 * (the `/sell` form). GA4 only.
 */
export function trackSellerCtaClick(placement: string, storeNameEntered = false): void {
  ga4.sellerCtaClick(placement, storeNameEntered)
}

/** A new store was created — the seller funnel's finish line. GA4 only. */
export function trackStoreCreated(): void {
  ga4.storeCreated()
}

/* ------------------------------------------------------------------ */
/* Purchase — at most once per order                                    */
/* ------------------------------------------------------------------ */

/** Kept from the Pixel-only days so history recorded before GA4 still counts. */
const PURCHASES_KEY = 'uniemax.pixel.purchases'
/** Enough history to cover any realistic revisit without growing unbounded. */
const PURCHASES_KEPT = 50
/** Guards the confirmation page's own poll-driven re-renders. */
const reportedThisLoad = new Set<string>()

/**
 * True the first time an order id is seen, false ever after.
 *
 * The confirmation page polls while an online payment settles, and its URL is
 * deliberately shareable and bookmarkable, so an unguarded purchase would
 * report the same sale several times and inflate reported revenue.
 */
function claimPurchase(orderId: string): boolean {
  if (reportedThisLoad.has(orderId)) return false
  reportedThisLoad.add(orderId)
  try {
    const raw = localStorage.getItem(PURCHASES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const seen = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
    if (seen.includes(orderId)) return false
    localStorage.setItem(
      PURCHASES_KEY,
      JSON.stringify([...seen, orderId].slice(-PURCHASES_KEPT)),
    )
  } catch {
    // Storage unavailable (private mode). The in-memory guard above still
    // stops the polling duplicate; a much later revisit may re-report, which
    // beats losing the sale from reporting altogether.
  }
  return true
}

/**
 * Order paid (or placed, for cash on delivery). Fires **at most once per
 * order** to both Meta and GA4 — see `claimPurchase`.
 */
export function trackPurchase(orderId: string, total: number, lines: PixelLine[]): void {
  if (!claimPurchase(orderId)) return
  pixel.trackPurchase(total, lines)
  ga4.purchase(orderId, total, lines)
}
