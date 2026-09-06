import { AppLogoLockup } from '../../../shared/ui/AppLogo'
import { Hero } from '../../../shared/ui/form'

/**
 * The UnieMax marketing pane beside the sign-in form — the `/login` page's
 * left column (lg+) and the marketplace `AuthDialog`'s brand panel share it,
 * so the dialog is visibly the login page in a box.
 */
export function StorefrontHero({ className }: { className?: string }) {
  return (
    <Hero
      image="/auth_hero_1.jpg"
      className={className}
      logo={<AppLogoLockup tone="on-dark" className="h-8" />}
    >
      <div>
        <h2 className="text-4xl font-bold leading-tight font-heading">
          Gear up.
          <br />
          <span className="text-brand-gradient-on-dark">Play your best.</span>
        </h2>
        <p className="mt-3 max-w-sm text-white/80">
          Premium cricket bats delivered to your door. Cash on delivery
          available.
        </p>
      </div>
    </Hero>
  )
}
