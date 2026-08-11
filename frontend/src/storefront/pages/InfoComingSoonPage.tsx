import { Link, useLocation } from 'react-router-dom'
import { usePageTitle } from '../../shared/usePageTitle'
import { AppLogoLockup } from '../../shared/ui/AppLogo'

/**
 * Public placeholder for the marketplace footer pages (About, Privacy,
 * Terms, Support, Contact). It needs no session and no dashboard shell —
 * a shared link must land here for anonymous visitors without bouncing
 * through /login.
 */
const TITLES: Record<string, string> = {
  '/about': 'About',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms & Conditions',
  '/support': 'Support',
  '/contact': 'Contact',
}

export function InfoComingSoonPage() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Coming soon'
  usePageTitle(title)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <Link
        to="/"
        className="mb-8 flex items-center"
      >
        <AppLogoLockup className="h-9" />
      </Link>

      <h1 className="font-heading text-3xl font-bold text-fg">{title}</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        This page is on its way. In the meantime, explore the stores on our
        marketplace.
      </p>
      <Link
        to="/"
        className="mt-8 rounded-md bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-brand-contrast transition hover:opacity-90"
      >
        Back to Home
      </Link>
    </div>
  )
}
