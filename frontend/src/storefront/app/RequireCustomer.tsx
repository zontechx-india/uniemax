import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AppLogoFull } from '../../shared/ui/AppLogo'
import { SessionProvider } from './SessionProvider'
import { useMarketSession } from './marketSession'

/**
 * Route guard for the account subtree (dashboard pages, /mystores/…).
 *
 *   loading → splash (the probe is one request; don't flash a redirect)
 *   guest   → /login, carrying the intended destination in ?next= so the
 *             login page returns the customer exactly where they were going
 *   authed  → narrows the session for the existing `useCustomerSession()`
 *             consumers (AppLayout, AccountMenu, every account page)
 */
export function RequireCustomer() {
  const { state, signOut } = useMarketSession()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <AppLogoFull className="w-40 animate-pulse" />
      </div>
    )
  }

  if (state.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return (
    <SessionProvider customer={state.user} signOut={signOut}>
      <Outlet />
    </SessionProvider>
  )
}
