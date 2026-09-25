import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Customer } from '../../shared/auth/authApi'
import { AppLogoFull } from '../../shared/ui/AppLogo'
import { useMarketSession } from '../app/marketSession'
import { LoginPage } from './LoginPage'

/**
 * `/login` — the sign-in page as a ROUTE (the homepage is public now, so
 * login is a destination rather than a gate). Honors `?next=` so guards can
 * bounce a guest here and return them to where they were going.
 */

/**
 * Only ever redirect within this app: a same-origin absolute path. Anything
 * else ("//evil.com", "https://…", garbage) falls back to home — `next` is
 * attacker-influencable (it arrives in a URL), so it must never become an
 * open redirect.
 */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/'
}

/**
 * Paths served by the anonymous shopping router (`app/publicRouter.tsx`) —
 * mirror of StorefrontApp's PUBLIC_PATH. Returning there (e.g. a guest sent
 * here from `/checkout/{slug}`) needs a full page load, because this login
 * page lives in the marketplace router where those routes don't exist.
 */
const SHOPPING_PATH = /^\/(store|cart|checkout|order)(\/|$)/

export function LoginRoute() {
  const { state, signedIn } = useMarketSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))

  // Already signed in (or becomes signed in) → leave the login page.
  useEffect(() => {
    if (state.status !== 'authed') return
    if (SHOPPING_PATH.test(next)) {
      window.location.replace(next)
    } else {
      navigate(next, { replace: true })
    }
  }, [state.status, next, navigate])

  if (state.status !== 'guest') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <AppLogoFull className="w-40 animate-pulse" />
      </div>
    )
  }

  const onSignedIn = (user: Customer) => {
    signedIn(user) // the effect above navigates once the state lands
  }

  return (
    <LoginPage
      onSignedIn={onSignedIn}
      intent={next.startsWith('/mystores') ? 'sell' : 'shop'}
    />
  )
}
