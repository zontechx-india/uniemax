import { usePrivatePageTitle } from '../../shared/seo'
import type { Customer } from '../../shared/auth/authApi'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { AuthLayout, Brand } from '../../shared/ui/form'
import { CustomerAuthPanel } from '../features/auth/CustomerAuthPanel'
import { StorefrontHero } from '../features/auth/StorefrontHero'
import type { AuthIntent } from '../features/auth/authDialogStore'

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
export function LoginPage({
  onSignedIn,
  intent = 'shop',
}: {
  onSignedIn: (customer: Customer) => void
  /** `sell` when the guest was heading to store management (`/mystores…`). */
  intent?: AuthIntent
}) {
  usePrivatePageTitle('Sign in')
  const selling = intent === 'sell'
  return (
    <AuthLayout
      hero={<StorefrontHero intent={intent} />}
      footer={<p className="text-xs text-muted">© UnieMax · Terms · Privacy</p>}
    >
      {/* The lockup already sets the name, so there is no title line here. */}
      <Brand
        badge={<AppLogoLockup className="h-11" />}
        badgeClass=""
        subtitle={selling ? 'Sign in or create a free account to set up your store' : 'Sign in to continue shopping'}
      />

      <CustomerAuthPanel variant="page" onSignedIn={onSignedIn} />

      {!selling && (
        <p className="mt-4 text-center text-sm text-muted">
          Browse and fill your cart without an account — sign in to place an order and see your orders.
        </p>
      )}
    </AuthLayout>
  )
}
