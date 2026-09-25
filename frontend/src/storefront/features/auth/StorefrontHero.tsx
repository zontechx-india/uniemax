import { AppLogoLockup } from '../../../shared/ui/AppLogo'
import { Hero } from '../../../shared/ui/form'
import type { AuthIntent } from './authDialogStore'

/**
 * Platform copy, never one vertical's: UnieMax is white-label, and a seller
 * of sarees or groceries signing up under a sports-shop slogan reads as the
 * wrong site.
 */
const COPY: Record<AuthIntent, { title: string; accent: string; body: string }> = {
  shop: {
    title: 'Shop straight',
    accent: 'from the seller.',
    body: 'Independent stores, one cart. Cash on delivery available.',
  },
  sell: {
    title: 'Your store,',
    accent: 'online in minutes.',
    body: 'Add your products, share one link, take orders — no technical knowledge needed.',
  },
}

/**
 * The UnieMax marketing pane beside the sign-in form — the `/login` page's
 * left column (lg+) and the marketplace `AuthDialog`'s brand panel share it,
 * so the dialog is visibly the login page in a box.
 */
export function StorefrontHero({
  className,
  intent = 'shop',
}: {
  className?: string
  intent?: AuthIntent
}) {
  const copy = COPY[intent]
  return (
    <Hero
      image="/auth_hero_1.jpg"
      className={className}
      logo={<AppLogoLockup tone="on-dark" className="h-8" />}
    >
      <div>
        <h2 className="text-4xl font-bold leading-tight font-heading">
          {copy.title}
          <br />
          <span className="text-brand-gradient-on-dark">{copy.accent}</span>
        </h2>
        <p className="mt-3 max-w-sm text-white/80">{copy.body}</p>
      </div>
    </Hero>
  )
}
