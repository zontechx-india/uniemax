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
 *   - `trackCompleteRegistration()` — the sign-up conversion Meta ad delivery
 *     optimises against (see `LoginPage`).
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
