import { http, call } from '../auth/http'

/**
 * Browser → backend bridge for Meta's Conversions API.
 *
 * The browser fires `CompleteRegistration` with an `eventID`; the server fires
 * the same event with the same id over the Conversions API. Meta matches on
 * the pair and counts them as one, which lifts Event Match Quality (hashed
 * email/phone, IP, user agent, `_fbp`/`_fbc` can only be gathered server-side
 * reliably).
 *
 * The route is customer-authenticated — only an already signed-in customer can
 * claim their own seller signup — and server-side de-duplicated by customer
 * id, so a page refresh or a repeat sign-in never fires it twice.
 *
 * Failures are swallowed: an ad blocker, a network glitch or the server being
 * reachable but refusing to send (missing CAPI token) must never break the
 * sign-up flow. The browser `fbq` event still lands independently.
 */

/** Fire-and-forget — the caller does not wait on the result. */
export function reportSellerSignup(input: {
  eventId: string
  method: 'email' | 'phone_otp' | 'google'
  fbp?: string
  fbc?: string
}): void {
  // Fire-and-forget: never await on an auth flow's happy path.
  void call(
    http.post('/api/v1/analytics/meta/seller-signup', {
      eventId: input.eventId,
      method: input.method,
      fbp: input.fbp,
      fbc: input.fbc,
      eventSourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    }),
  ).catch(() => {
    // Tracking must never surface to the UI. The browser pixel still fired.
  })
}
