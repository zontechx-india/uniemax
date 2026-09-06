import type { Customer } from '../../shared/auth/authApi'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { AuthLayout, Brand } from '../../shared/ui/form'
import { CustomerAuthPanel } from '../features/auth/CustomerAuthPanel'
import { StorefrontHero } from '../features/auth/StorefrontHero'

/**
 * `/login` as a full page — the FALLBACK host for the sign-in flows.
 *
 * Every "Sign in" control in the app opens `features/auth/AuthDialog` in
 * place instead; this page exists for the cases that have no page to stay
 * on: a direct/bookmarked link, and `RequireCustomer` bouncing a guest off
 * an account route with `?next=` (handled by `LoginRoute`). The flows
 * themselves live in `CustomerAuthPanel`, shared with the dialog — this file
 * is only the split-screen frame around them.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (customer: Customer) => void }) {
  return (
    <AuthLayout
      hero={<StorefrontHero />}
      footer={<p className="text-xs text-muted">© UnieMax · Terms · Privacy</p>}
    >
      {/* The lockup already sets the name, so there is no title line here. */}
      <Brand
        badge={<AppLogoLockup className="h-11" />}
        badgeClass=""
        subtitle="Sign in to continue shopping"
      />

      <CustomerAuthPanel variant="page" onSignedIn={onSignedIn} />

      <p className="mt-4 text-center text-sm text-muted">
        Browsing and checkout work without an account — sign in to see your orders.
      </p>
    </AuthLayout>
  )
}
