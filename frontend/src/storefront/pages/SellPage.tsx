import { useState } from 'react'
import type { ComponentType, MouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { Button } from '../../shared/ui/Button'
import { useMarketSession } from '../app/marketSession'
import { openAuthDialog } from '../features/auth/authDialogStore'
import { ChatToOrder } from '../features/selling/ChatToOrder'
import { ClaimStoreForm } from '../features/selling/ClaimStoreForm'
import { Reveal } from '../features/selling/Reveal'
import { SellFaq } from '../features/selling/SellFaq'
import { SELLER_STEPS } from '../features/selling/sellerPitch'
import {
  HeroVisual,
  OrderStatusVisual,
  PaymentChoiceVisual,
  StepProductVisual,
  StepPublishVisual,
  StepStoreVisual,
} from '../features/selling/sellVisuals'
import { useStartSelling } from '../features/selling/startSelling'
import { ThemeShowcase } from '../features/selling/ThemeShowcase'
import { useInView } from '../features/selling/useInView'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import {
  BellIcon,
  CardIcon,
  ClipboardIcon,
  GlobeIcon,
  LifebuoyIcon,
  SmartphoneIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
} from '../layout/icons'

/**
 * Seller landing page (`/sell`) — where seller ads point.
 *
 * Most arrivals tap a Facebook or Instagram ad and land here in an in-app
 * browser, on a phone, on mobile data, deciding within seconds. So:
 *
 * - **The first phone screen is the whole offer**: the promise, and a
 *   "Name your store" field whose button starts sign-up. The name rides into
 *   the Create Store wizard, so typing it is never wasted.
 * - **Everything after answers a doubt**, in the order doubts arrive: what it
 *   costs (trust strip), why not keep selling in chats, what's included,
 *   whether it can look like MY brand, how much work it is, and the fine
 *   print (FAQ). Then the same form again.
 * - **Nothing is invented.** No seller counts, sales figures or testimonials
 *   until real ones exist; every capability named is shipped, and every
 *   picture is the real UI with illustrative content (`demoStores.ts`).
 * - **Light by construction**: no API calls of its own, no images — the
 *   product shots are markup — and motion is CSS, only ever transform and
 *   opacity.
 *
 * Its look is its own (`sell-light` / `sell-dark` in `index.css`): navy
 * bands, cool neutrals, the brand purple kept for the buttons.
 */
export function SellPage() {
  // Server twin: `sellPage` in backend/src/modules/seo/pageShell.service.ts.
  useSeo({
    title: ['Create your free online store'],
    description:
      'Open your own online store on UnieMax — free to start. Your own branding and store link, Cash on Delivery and online payments, delivery by pincode and instant order alerts. Set it all up from your phone.',
    canonical: '/sell',
  })

  // One name for the whole page: typed in the hero, it is already in the
  // closing form, and the header and sticky buttons carry it too.
  const [storeName, setStoreName] = useState('')
  const start = useStartSelling()

  // The mobile sticky button shows only while neither form is on screen.
  const [heroFormRef, heroFormOnScreen] = useInView<HTMLDivElement>()
  const [closingRef, closingOnScreen] = useInView<HTMLElement>()
  const showSticky = heroFormOnScreen === false && closingOnScreen !== true

  return (
    <div className="sell-light relative min-h-screen overflow-x-clip bg-bg text-fg">
      <SellHeader onStart={() => start('sell_header', storeName)} />

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section className="sell-dark relative isolate overflow-hidden bg-bg">
          <div aria-hidden="true" className="sell-glow absolute inset-0 -z-10" />
          <div aria-hidden="true" className="sell-grid absolute inset-0 -z-10" />
          <div
            className={`${CONTENT_COLUMN} grid items-center gap-14 pb-16 pt-24 sm:pt-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:pb-24 lg:pt-36`}
          >
            <div className="max-w-xl">
              <p className="sell-enter inline-flex items-center gap-2.5 rounded-pill border border-line bg-surface/70 px-3.5 py-1.5 text-xs font-medium text-fg">
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  <span className="sell-ping absolute inset-0 rounded-full bg-emerald-400" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Free to start · Made for Indian sellers
              </p>
              <h1 className="mt-6 text-balance font-heading text-[2.6rem] font-bold leading-[1.04] tracking-tight text-fg sm:text-6xl lg:text-[4.4rem]">
                Your own online store.
                <span className="text-brand-gradient-on-dark block">Ready to take orders.</span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
                Create your shop from your phone, add your products and share
                one link. Customers order in a few taps — and you get paid by
                Cash on Delivery or online payment.
              </p>
              <div ref={heroFormRef} className="sell-enter mt-8" style={{ animationDelay: '80ms' }}>
                <ClaimStoreForm
                  value={storeName}
                  onChange={setStoreName}
                  placement="sell_hero"
                  variant="primary"
                />
              </div>
            </div>

            <HeroVisual />
          </div>
        </section>

        {/* Trust strip — the four facts that most often stop a start. ------- */}
        <section aria-label="At a glance" className="border-b border-line bg-surface">
          <ul
            className={`${CONTENT_COLUMN} grid grid-cols-2 gap-x-4 gap-y-6 py-8 sm:gap-x-8 lg:grid-cols-4 lg:py-10`}
          >
            {TRUST.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{title}</span>
                  <span className="block text-xs text-muted sm:text-sm">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* From chats to orders -------------------------------------------- */}
        <section className="bg-surface-alt">
          <div className={`${CONTENT_COLUMN} ${BAND}`}>
            <SectionHeading
              eyebrow="Selling on WhatsApp or Instagram?"
              title="Stop taking orders one chat at a time"
              body="Share your store link instead. Customers see every price, size and photo, check delivery to their pincode and order themselves — the order, address and payment choice arrive in one place."
            />
            <div className="mx-auto mt-12 max-w-5xl">
              <ChatToOrder />
            </div>
          </div>
        </section>

        {/* Features --------------------------------------------------------- */}
        <section id="features" className="bg-surface">
          <div className={`${CONTENT_COLUMN} ${BAND}`}>
            <SectionHeading
              eyebrow="Everything included"
              title="Everything you need to sell online"
              body="Payments, delivery, orders and marketing tools come built in — nothing to install, nothing to code."
            />
            <div className="mt-12 grid gap-4 sm:gap-5 lg:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <FeatureCard key={feature.title} {...feature} delay={(index % 3) * 90} />
              ))}
            </div>
          </div>
        </section>

        {/* Make it yours ---------------------------------------------------- */}
        <section className="overflow-hidden bg-surface-alt">
          <div className={`${CONTENT_COLUMN} ${BAND}`}>
            <ThemeShowcase />
          </div>
        </section>

        {/* How it works ----------------------------------------------------- */}
        <section id="how-it-works" className="bg-surface">
          <div className={`${CONTENT_COLUMN} ${BAND}`}>
            <SectionHeading
              eyebrow="How it works"
              title="Live in three steps"
              body="No website to build and no developer to hire — you can do all of it from your phone."
            />
            <ol className="mt-12 grid gap-4 sm:gap-5 lg:grid-cols-3">
              {SELLER_STEPS.map((step, index) => (
                <li key={step.title}>
                  <Reveal delay={index * 100} className="h-full">
                    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 sm:p-7">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-base font-bold text-brand-contrast">
                        {index + 1}
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-fg">{step.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{step.body}</p>
                      <div className="mt-6">{STEP_VISUALS[index]}</div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="bg-surface-alt">
          <div
            className={`${CONTENT_COLUMN} ${BAND} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}
          >
            <div>
              <SectionHeading
                align="left"
                eyebrow="FAQ"
                title="Good questions, straight answers"
                body="What it costs, how you get paid and what you need — before you start."
              />
              <p className="mt-6 text-sm text-muted">
                Something else?{' '}
                <Link to="/contact" className="font-semibold text-brand hover:underline">
                  Contact us
                </Link>
              </p>
            </div>
            <SellFaq />
          </div>
        </section>

        {/* Closing call ----------------------------------------------------- */}
        <section ref={closingRef} className="sell-dark relative isolate overflow-hidden bg-bg">
          <div aria-hidden="true" className="sell-glow absolute inset-0 -z-10" />
          <div className={`${CONTENT_COLUMN} py-20 sm:py-24 lg:py-28`}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold leading-[1.1] tracking-tight text-fg sm:text-5xl">
                Ready to open your store?
              </h2>
              <p className="mt-4 text-base text-muted sm:text-lg">
                Start free, add products at your own pace, and publish when
                you’re ready.
              </p>
            </div>
            <div className="mx-auto mt-10 max-w-xl">
              <ClaimStoreForm
                value={storeName}
                onChange={setStoreName}
                placement="sell_final"
                variant="primary"
              />
            </div>
          </div>
        </section>
      </main>

      <SellFooter />

      <StickyCta show={showSticky} onStart={() => start('sell_sticky', storeName)} />
    </div>
  )
}

/** Vertical rhythm for the page's content bands. */
const BAND = 'py-16 sm:py-20 lg:py-28'

const TRUST: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: TagIcon, title: 'Free to start', body: 'No card needed' },
  { icon: ClipboardIcon, title: 'GSTIN optional', body: 'Add it if you have one' },
  { icon: CardIcon, title: 'COD + online payments', body: 'Get paid your way' },
  { icon: SmartphoneIcon, title: 'Made for mobile', body: 'Run it all from your phone' },
]

interface Feature {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  /** A picture of the feature — wide cards only. */
  visual?: ReactNode
  /** Spans two columns from `lg`, text beside the visual. */
  wide?: boolean
}

/** Shipped capabilities only — each maps to a working screen. */
const FEATURES: Feature[] = [
  {
    icon: CardIcon,
    title: 'Cash on Delivery and online payments',
    body: 'Take Cash on Delivery from day one. Add your PAN and bank account to accept secure online payments too — and turn COD off for any product.',
    visual: <PaymentChoiceVisual />,
    wide: true,
  },
  {
    icon: TruckIcon,
    title: 'Delivery on your terms',
    body: 'Deliver to the pincodes you choose, offer store pickup, or both. Charge a flat rate, or ship free above an amount you set.',
  },
  {
    icon: TagIcon,
    title: 'Products the way you sell them',
    body: 'Sizes, colours and other variants, each with its own photo, price and stock — with the MRP shown beside your price.',
  },
  {
    icon: BellIcon,
    title: 'Never miss an order',
    body: 'Every new order reaches you instantly by email and push notification. Move it from confirmed to delivered — stock updates by itself.',
    visual: <OrderStatusVisual />,
    wide: true,
  },
  {
    icon: GlobeIcon,
    title: 'Listed on the marketplace',
    body: 'Published stores appear on UnieMax, where shoppers search products across every store.',
  },
  {
    icon: UsersIcon,
    title: 'Partners who sell for you',
    body: 'Invite affiliates and set their commission. They share their own links to your products, and every sale they bring is tracked.',
  },
  {
    icon: LifebuoyIcon,
    title: 'Customers looked after',
    body: 'Shoppers can call, email or raise a support ticket with your shop, and you answer from your dashboard.',
  },
]

/** One picture per `SELLER_STEPS` entry, in the same order. */
const STEP_VISUALS: ReactNode[] = [
  <StepStoreVisual key="store" />,
  <StepProductVisual key="product" />,
  <StepPublishVisual key="publish" />,
]

function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string
  title: string
  body?: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-3 font-heading text-3xl font-bold leading-[1.1] tracking-tight text-fg sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{body}</p>}
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  visual,
  wide = false,
  delay,
}: Feature & { delay: number }) {
  return (
    <Reveal delay={delay} className={wide ? 'lg:col-span-2' : ''}>
      <article
        className={`h-full rounded-2xl border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:shadow-lifted sm:p-7 ${
          wide ? 'lg:grid lg:grid-cols-2 lg:items-center lg:gap-8' : ''
        }`}
      >
        <div>
          {/* Icon beside the title on a phone (seven cards stack there),
              above it from `sm`. */}
          <div className="flex items-center gap-3 sm:block">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold leading-snug text-fg sm:mt-5">{title}</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:mt-2">{body}</p>
        </div>
        {visual && <div className="mt-6 lg:mt-0">{visual}</div>}
      </article>
    </Reveal>
  )
}

/** In-page sections the header links to (desktop). */
const SECTIONS = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'faq', label: 'FAQ' },
] as const

/** Glide to a section without pushing a `#hash` onto the history stack. */
function jumpTo(id: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  }
}

/**
 * Logo, section links (desktop) and one way in for sellers who already have
 * an account — no search, no cart. Signing in here goes to their stores,
 * not back to this pitch.
 */
function SellHeader({ onStart }: { onStart: () => void }) {
  const { state } = useMarketSession()
  const navigate = useNavigate()

  return (
    <header className="sell-dark absolute inset-x-0 top-0 z-20">
      <div className={`${CONTENT_COLUMN} flex h-16 items-center justify-between gap-4 sm:h-20`}>
        <Link to="/" aria-label="UnieMax home" className="flex shrink-0 items-center">
          <AppLogoLockup tone="on-dark" className="h-8 sm:h-9" />
        </Link>

        <nav aria-label="On this page" className="hidden items-center gap-8 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={jumpTo(section.id)}
              className="text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-5">
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
              Sign in
            </button>
          )}
          <span className="hidden sm:block">
            <Button size="sm" onClick={onStart}>
              Start free
            </Button>
          </span>
        </div>
      </div>
    </header>
  )
}

function SellFooter() {
  return (
    <footer className="sell-dark border-t border-line bg-bg">
      <div
        className={`${CONTENT_COLUMN} flex flex-col items-center gap-5 py-8 text-sm text-muted sm:flex-row sm:justify-between`}
      >
        <AppLogoLockup tone="on-dark" className="h-7" />
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link to="/" className="transition-colors hover:text-fg">
            Browse stores
          </Link>
          <Link to="/contact" className="transition-colors hover:text-fg">
            Contact
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-fg">
            Terms
          </Link>
        </nav>
        <p>© {new Date().getFullYear()} UnieMax</p>
      </div>
    </footer>
  )
}

/**
 * Phones only: once the hero form has scrolled away, the next step stays one
 * tap from the thumb — and steps aside again when the closing form arrives.
 * `inert` while hidden, so it can't be tabbed to off screen.
 */
function StickyCta({ show, onStart }: { show: boolean; onStart: () => void }) {
  return (
    <div
      inert={!show}
      className={`sell-light fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 shadow-[0_-12px_32px_-16px_rgb(13_19_33/0.35)] transition-transform duration-300 sm:hidden ${
        show ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">Your own online store</p>
          <p className="text-xs text-muted">Free to start · No card needed</p>
        </div>
        <Button size="md" onClick={onStart}>
          Create store
        </Button>
      </div>
    </div>
  )
}
