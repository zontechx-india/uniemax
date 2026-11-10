/**
 * Meta (Facebook) Pixel — storefront only.
 *
 * The base snippet (pixel `931826082697608`) is installed verbatim in the head
 * of `index.html`, exactly as Meta issues it, so it loads before the app
 * bundle and defines the global `fbq`. This module is only what the snippet
 * *cannot* do on its own:
 *
 *   - `trackRouterPageViews()` — the snippet reports one `PageView` for the
 *     url the browser loaded. This is a client-side-routed SPA, so every
 *     navigation after that is invisible to it and has to be reported here.
 *   - `trackSellerSignup()` — the sign-up conversion the ad campaign optimises
 *     against (standard event `CompleteRegistration`). Only ever fires when a
 *     seller account is created via the `/sell` flow — buyers on seller
 *     storefronts fire the custom `BuyerSignup` event instead, so Meta's
 *     delivery model is never trained on buyers it has mislabelled as sellers.
 *   - `trackBuyerSignup()` — same moment, different event name, so buyer
 *     registrations on store pages still show up in Events Manager without
 *     polluting the seller conversion.
 *   - The shopping funnel — `ViewContent` → `AddToCart` → `InitiateCheckout` →
 *     `Purchase`. `Purchase` is what lets Meta report revenue and optimise for
 *     buyers rather than browsers, so it carries the order total and is fired
 *     at most once per order (guarded in `track.ts`).
 *
 * Call sites use `track.ts`, which reports each of these to GA4 as well.
 *
 * The admin console (`admin.html`) has no pixel: nothing about operator
 * activity belongs in an ad platform.
 *
 * Every call here no-ops when `fbq` is absent — an ad blocker, or a stripped
 * `index.html` — so tracking can never break a page.
 */

declare global {
  interface Window {
    /** Defined by the base snippet in `index.html`. */
    fbq?: (...args: unknown[]) => void
  }
}

/** Standard Meta events. Anything outside this list needs `trackCustom`. */
type StandardEvent =
  | 'PageView'
  | 'CompleteRegistration'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Purchase'

/** Custom events — anything Meta does not ship as a standard. */
type CustomEvent = 'BuyerSignup'

/** Fires a standard event. No-op when the pixel did not load. */
export function trackEvent(
  event: StandardEvent,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  // Meta's docs: the third-position arg can be `params`; event id goes on the
  // fourth-position object `{ eventID }`, which is what the browser pixel and
  // the Conversions API match on for de-duplication.
  window.fbq?.('track', event, params ?? {}, eventID ? { eventID } : undefined)
}

/** Fires a custom (non-standard) event. */
export function trackCustomEvent(
  event: CustomEvent,
  params?: Record<string, unknown>,
): void {
  window.fbq?.('trackCustom', event, params ?? {})
}

/** Reads a cookie value (`_fbp` / `_fbc`), or `undefined` when absent. */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

/** `_fbp` cookie — Meta's browser id for the visitor. */
export function fbp(): string | undefined {
  return readCookie('_fbp')
}

/** `_fbc` cookie — Meta's click id for the ad that brought the visitor. */
export function fbc(): string | undefined {
  return readCookie('_fbc')
}

/**
 * Random event id used to de-duplicate browser + server events on Meta's end.
 * `crypto.randomUUID` on every modern browser; the fallback is good enough —
 * event ids only need to be unique inside the dedupe window.
 */
export function newEventId(): string {
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string }
  }
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  )
}

/**
 * Seller account created via `/sell`. Fires Meta's standard
 * `CompleteRegistration` event — the one the ad campaign optimises against —
 * and returns the `eventID` the caller must send to the server so the
 * Conversions API event matches up and Meta counts the two as one.
 *
 * NEVER call this for a buyer registration. The campaign's cost per
 * acquisition rises when the delivery model learns on buyer-shaped audiences.
 */
export function trackSellerSignup(
  method: 'email' | 'phone_otp' | 'google',
): string {
  const eventID = newEventId()
  trackEvent(
    'CompleteRegistration',
    {
      content_name: 'Seller account',
      registration_method: method,
      status: true,
    },
    eventID,
  )
  return eventID
}

/**
 * Buyer account created on a seller storefront. Fires a custom event
 * (`BuyerSignup`) rather than `CompleteRegistration`, so the seller campaign's
 * delivery model stays trained on sellers alone. We still see it in Events
 * Manager and can report on it or build a buyer-side audience later.
 */
export function trackBuyerSignup(method: 'email' | 'phone_otp' | 'google'): void {
  trackCustomEvent('BuyerSignup', {
    content_name: 'Customer account',
    registration_method: method,
    status: true,
  })
}

/* ------------------------------------------------------------------ */
/* Shopping funnel                                                      */
/* ------------------------------------------------------------------ */

/** Every price on this platform is rupees — see `formatPrice`. */
const CURRENCY = 'INR'

/**
 * One purchasable line, in the shape every funnel event needs.
 *
 * `id` is the **product id** (`StoreProduct.id`) — the `g:id` of the product
 * feed (`/api/v1/public/feeds/products.xml`) that fills the Meta catalogue and
 * Google Merchant Center, so every event matches a catalogue item. Not the
 * slug: a slug is unique only within its store. Cart lines and placed-order
 * lines both carry the product id.
 */
export interface PixelLine {
  id: string
  /** Unit price in rupees. */
  price: number
  quantity: number
}

/** Rupees, rounded — float sums like 1299.9999999 read badly in reporting. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The `content_*` / `value` block Meta expects on every commerce event. */
function contentPayload(lines: PixelLine[]) {
  return {
    content_type: 'product',
    content_ids: lines.map((l) => l.id),
    contents: lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      item_price: l.price,
    })),
    num_items: lines.reduce((n, l) => n + l.quantity, 0),
    value: round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0)),
    currency: CURRENCY,
  }
}

/** Product detail page opened. */
export function trackViewContent(line: PixelLine, name: string): void {
  trackEvent('ViewContent', { ...contentPayload([line]), content_name: name })
}

/** Item added to the cart (Buy Now counts — it adds, then jumps to checkout). */
export function trackAddToCart(line: PixelLine, name: string): void {
  trackEvent('AddToCart', { ...contentPayload([line]), content_name: name })
}

/** Checkout opened for one store's cart group. */
export function trackInitiateCheckout(lines: PixelLine[]): void {
  trackEvent('InitiateCheckout', contentPayload(lines))
}

/**
 * Order paid (or placed, for cash on delivery). Unguarded: the at-most-once
 * per order check lives in `track.ts`, shared with GA4 — always report a
 * purchase through there.
 *
 * `value` is the order total rather than the sum of the lines, because that is
 * what the customer actually paid: it includes shipping.
 */
export function trackPurchase(total: number, lines: PixelLine[]): void {
  trackEvent('Purchase', { ...contentPayload(lines), value: round2(total) })
}

/** Minimal shape of a data router — enough to observe its navigations. */
type ObservableRouter = {
  subscribe(fn: (state: { location: { pathname: string; search: string } }) => void): () => void
}

/**
 * Reports a `PageView` for every client-side navigation on `router`.
 *
 * The router notifies on each state transition (loading → idle), so we compare
 * against the last reported url and drop the repeats; the initial load is
 * already covered by the snippet's own `fbq('track', 'PageView')`.
 */
export function trackRouterPageViews(router: ObservableRouter): () => void {
  let last = window.location.pathname + window.location.search
  return router.subscribe((state) => {
    const url = state.location.pathname + state.location.search
    if (url === last) return
    last = url
    trackEvent('PageView')
  })
}
