import { Link, useNavigate } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { buttonClass } from '../../shared/ui/Button'
import { useMarketSession } from '../app/marketSession'
import { openAuthDialog } from '../features/auth/authDialogStore'
import {
  CreateStoreLink,
  SELLER_PROOF_POINTS,
  SELLER_STEPS,
} from '../features/selling/sellerPitch'
import { CONTENT_COLUMN, SECTION_PADDING } from '../layout/contentWidth'
import { CheckIcon } from '../layout/icons'

/**
 * Seller landing page (`/sell`) — where seller ads point.
 *
 * The marketplace homepage speaks to shoppers and keeps its seller pitch at
 * the very bottom; a visitor who tapped "build your online store" and landed
 * there saw a shop, not what they came for, and left. This page is that
 * promise and nothing else: the offer and the Create-your-store button fit the
 * first phone screen, with no search, cart or product rails to wander into.
 *
 * Deliberately light — no API calls of its own — because most arrivals come
 * through an in-app browser on mobile data and leave in seconds.
 */
export function SellPage() {
  useSeo({
    title: ['Create your free online store'],
    description:
      'Open your own online store on UnieMax in minutes — free to start, your own branding and web address, Cash on Delivery and online payments built in. No technical knowledge required.',
    canonical: '/sell',
  })

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <SellHeader />

      <main className="flex-1">
        {/* Hero — the whole pitch, above the fold on a 360px phone. */}
        <section className="border-b border-line bg-surface">
          <div className={`${CONTENT_COLUMN} py-8 sm:py-14 lg:py-20`}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                For sellers
              </p>
              <h1 className="mt-3 font-heading text-3xl font-bold leading-[1.1] text-fg sm:text-5xl">
                Create your online store — free
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-base text-muted sm:text-lg">
                Your own shop with its own link, ready to share with your
                customers. Set it up from your phone in minutes — no technical
                knowledge required.
              </p>

              <CreateStoreLink
                placement="sell_hero"
                className={buttonClass({
                  size: 'lg',
                  full: true,
                  className: 'mt-6 sm:w-auto sm:px-10',
                })}
              >
                Create your free store
              </CreateStoreLink>
              <p className="mt-3 text-xs text-muted">
                Sign up with your phone number or email.
              </p>

              <ul className="mx-auto mt-6 max-w-md space-y-2.5 text-left sm:mt-8">
                {SELLER_PROOF_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-fg">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works — the three steps, then the same button again for the
            visitor who scrolled to find out what they are signing up to do. */}
        <section>
          <div className={`${CONTENT_COLUMN} ${SECTION_PADDING}`}>
            <div className="mx-auto max-w-2xl">
              <h2 className="text-center font-heading text-2xl font-semibold text-fg sm:text-3xl">
                How it works
              </h2>
              <ol className="mt-6 space-y-5">
                {SELLER_STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient font-heading text-sm font-bold text-brand-contrast"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-1">
                      <span className="block text-base font-semibold text-fg">
                        {step.title}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-8 text-center">
                <CreateStoreLink
                  placement="sell_bottom"
                  className={buttonClass({
                    size: 'lg',
                    full: true,
                    className: 'sm:w-auto sm:px-10',
                  })}
                >
                  Create your free store
                </CreateStoreLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div
          className={`${CONTENT_COLUMN} flex flex-col items-center gap-3 py-6 text-xs text-muted sm:flex-row sm:justify-between`}
        >
          <p>© {new Date().getFullYear()} UnieMax · All rights reserved</p>
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link to="/" className="hover:text-fg">
              Browse stores
            </Link>
            <Link to="/contact" className="hover:text-fg">
              Contact
            </Link>
            <Link to="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-fg">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/**
 * Logo and one way in for sellers who already have an account — nothing else.
 * Signing in here goes to their stores, not back to this pitch.
 */
function SellHeader() {
  const { state } = useMarketSession()
  const navigate = useNavigate()

  return (
    <header className="border-b border-line bg-bg">
      <div className={`${CONTENT_COLUMN} flex h-16 items-center justify-between gap-3`}>
        <Link to="/" aria-label="UnieMax home" className="flex shrink-0 items-center">
          <AppLogoLockup className="h-8 sm:h-9" />
        </Link>
        {state.status === 'authed' ? (
          <Link
            to="/mystores"
            className="text-sm font-semibold text-muted transition-colors hover:text-fg"
          >
            My stores
          </Link>
        ) : (
          <button
            type="button"
            onClick={() =>
              openAuthDialog({
                intent: 'sell',
                onSignedIn: () => navigate('/mystores'),
              })
            }
            className="text-sm font-semibold text-muted transition-colors hover:text-fg"
          >
            Already selling? Sign in
          </button>
        )}
      </div>
    </header>
  )
}
