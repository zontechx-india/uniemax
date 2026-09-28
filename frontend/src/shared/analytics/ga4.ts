/**
 * Google Analytics 4 (`G-5L4JD4WH2V`) — storefront only.
 *
 * The gtag.js loader lives in the head of `index.html` and runs only on the
 * production hosts (uniemax.com, www.uniemax.com), so everywhere else
 * `window.gtag` is undefined and every call here is a no-op — as it is when
 * an ad blocker stops the script. Tracking can never break a page.
 *
 * Page views are NOT sent from here: the web stream's Enhanced measurement
 * reports each client-side navigation from the History API, and a manual
 * `page_view` on top would count every page twice.
 *
 * Call sites do not import this module directly — they go through
 * `track.ts`, which reports each moment to Meta and GA4 together.
 */

declare global {
  interface Window {
    /** Defined by the loader in `index.html` on production hosts only. */
    gtag?: (...args: unknown[]) => void
  }
}

/** Every price on this platform is rupees — see `formatPrice`. */
const CURRENCY = 'INR'

/** One purchasable line — the same shape the Meta Pixel events use. */
export interface GaLine {
  /** Product slug — unique platform-wide, carried by cart AND order lines. */
  id: string
  /** Unit price in rupees. */
  price: number
  quantity: number
  name?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function event(name: string, params?: Record<string, unknown>): void {
  window.gtag?.('event', name, params)
}

/** GA4's ecommerce `items[]` + `value` + `currency` block. */
function commerce(lines: GaLine[]) {
  return {
    currency: CURRENCY,
    value: round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0)),
    items: lines.map((l) => ({
      item_id: l.id,
      ...(l.name ? { item_name: l.name } : {}),
      price: l.price,
      quantity: l.quantity,
    })),
  }
}

export function viewItem(line: GaLine): void {
  event('view_item', commerce([line]))
}

export function addToCart(line: GaLine): void {
  event('add_to_cart', commerce([line]))
}

export function beginCheckout(lines: GaLine[]): void {
  event('begin_checkout', commerce(lines))
}

/**
 * Order paid (or placed, for COD). `value` is the order total, shipping
 * included. The at-most-once guard lives in `track.ts`, shared with Meta.
 */
export function purchase(orderId: string, total: number, lines: GaLine[]): void {
  event('purchase', {
    ...commerce(lines),
    transaction_id: orderId,
    value: round2(total),
  })
}

/** A NEW account — never a returning sign-in. */
export function signUp(method: string): void {
  event('sign_up', { method })
}

/**
 * A "Create your store" button was tapped. `placement` says which one, so
 * the /sell page's buttons can be told apart from the homepage's.
 */
export function sellerCtaClick(placement: string): void {
  event('seller_cta_click', { placement, page_path: window.location.pathname })
}

/** The Create Store wizard's first step succeeded — a seller now exists. */
export function storeCreated(): void {
  event('store_created')
}
