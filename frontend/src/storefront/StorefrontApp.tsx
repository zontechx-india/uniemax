import { useCallback } from 'react'
import { RouterProvider } from 'react-router-dom'
import { trackRouterPageViews } from '../shared/analytics/metaPixel'
import { customerAuth } from '../shared/auth/authApi'
import { useSession } from '../shared/auth/useSession'
import { MarketSessionProvider } from './app/marketSession'
import { router } from './app/router'
import { publicRouter } from './app/publicRouter'
import { AuthDialog } from './features/auth/AuthDialog'
import { cart } from './features/cart/cart'

/**
 * Storefront root.
 *
 * Two surfaces, decided once per full page load (at module scope, so a
 * client-side navigation can never swap routers mid-session):
 *
 *  - The SHOPPING surface — `/store/...`, `/cart...`, `/checkout/...`,
 *    `/order/...` (confirmation) — mounts `app/publicRouter.tsx`. Nothing
 *    there *requires* an account: browsing, the cart and a shared store link
 *    all work signed out.
 *
 *  - Everything else mounts the MARKETPLACE router (`app/router.tsx`). The
 *    homepage `/` is public: it renders instantly for guests and merely
 *    adapts once the cookie-session probe resolves. The account subtree is
 *    wrapped in `<RequireCustomer>`, which redirects guests to `/login` with
 *    a `?next=` return path.
 *
 * Signing in happens IN PLACE: every "Sign in" control opens `<AuthDialog/>`
 * (mounted here, once, beside the router so both surfaces share it), and on
 * success the shared session flips without a reload. `/login` remains as the
 * fallback for direct links and the guard redirect above.
 *
 * The session probe (GET /auth/me, one refresh retry on 401) runs for BOTH
 * surfaces. It used to be skipped on the shopping surface to save a request
 * on a shared store link, but sellers share `/store/{slug}`, not `/` — so the
 * store header carries the same account dropdown as the marketplace bar and
 * needs to know who is looking. Nothing waits on the probe: every public page
 * renders immediately and the account slot resolves from a skeleton.
 */
const PUBLIC_PATH = /^\/(store|cart|checkout|order)(\/|$)/

const activeRouter = PUBLIC_PATH.test(window.location.pathname)
  ? publicRouter
  : router

/**
 * Meta Pixel: the base snippet in `index.html` reports only the url the
 * browser loaded, so each router reports its own `PageView` from then on.
 * Both are subscribed here because the surface is chosen per page load —
 * whichever one this load does not mount never navigates, so it never reports.
 */
trackRouterPageViews(router)
trackRouterPageViews(publicRouter)

export function StorefrontApp() {
  const { state, signedIn, signOut } = useSession(customerAuth)

  /**
   * Logging out empties the cart as well as the session.
   *
   * The cart is device-local (localStorage, no server copy — public store
   * pages are anonymous), so signing out otherwise leaves the previous
   * customer's basket sitting there for whoever uses the browser next. It
   * runs in `finally`: `useSession.signOut` drops to guest even when the
   * revoke request fails, and a locally-signed-out account must not keep a
   * cart either.
   *
   * Only an EXPLICIT logout gets here. An expired session (the 401 path out
   * of checkout) redirects to `/login` without calling this, so the cart
   * survives to be paid for after signing back in.
   */
  const signOutAndClearCart = useCallback(async () => {
    try {
      await signOut()
    } finally {
      cart.clear()
    }
  }, [signOut])

  return (
    <MarketSessionProvider
      state={state}
      signedIn={signedIn}
      signOut={signOutAndClearCart}
    >
      <RouterProvider router={activeRouter} />
      <AuthDialog />
    </MarketSessionProvider>
  )
}
