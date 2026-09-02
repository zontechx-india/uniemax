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
 *   - `trackCompleteRegistration()` — the sign-up conversion (see `LoginPage`).
 *   - The shopping funnel — `ViewContent` → `AddToCart` → `InitiateCheckout` →
 *     `Purchase`. `Purchase` is what lets Meta report revenue and optimise for
 *     buyers rather than browsers, so it carries the order total and is fired
 *     at most once per order.
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

/** Fires a standard event. No-op when the pixel did not load. */
export function trackEvent(event: StandardEvent, params?: Record<string, unknown>): void {
  window.fbq?.('track', event, params)
}

/**
 * Account created. Fired once per new customer, never on a returning sign-in —
 * this is the event sign-up campaigns optimise against, so a repeat login
 * counted here would train delivery on the wrong people.
 */
export function trackCompleteRegistration(method: 'email' | 'phone_otp' | 'google'): void {
  trackEvent('CompleteRegistration', {
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
 * `id` is the **product slug**: `Product.slug` is `@unique` platform-wide, and
 * it is the only product identifier carried by BOTH cart lines and placed-order
 * lines. Using it everywhere keeps `content_ids` consistent across the funnel,
 * which is what a catalog feed (and therefore dynamic product ads) will need.
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

const PURCHASES_KEY = 'uniemax.pixel.purchases'
/** Enough history to cover any realistic revisit without growing unbounded. */
const PURCHASES_KEPT = 50
/** Guards the confirmation page's own poll-driven re-renders. */
const reportedThisLoad = new Set<string>()

/**
 * True the first time an order id is seen, false ever after.
 *
 * The confirmation page polls while an online payment settles, and its URL is
 * deliberately shareable and bookmarkable, so an unguarded `Purchase` would
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
 * order** — see `claimPurchase`.
 *
 * `value` is the order total rather than the sum of the lines, because that is
 * what the customer actually paid: it includes shipping.
 */
export function trackPurchase(
  orderId: string,
  total: number,
  lines: PixelLine[],
): void {
  if (!claimPurchase(orderId)) return
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
