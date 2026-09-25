import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { usePageTitle } from '../../shared/usePageTitle'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { buttonClass } from '../../shared/ui/Button'
import { SupportContactCard } from '../features/support/SupportContactCard'

/**
 * The marketplace footer's info pages (About, Contact, Privacy, Terms) —
 * public, no session and no dashboard shell, so a shared link lands here for
 * anonymous visitors without bouncing through /login.
 *
 * About and Contact carry real content: what the platform is, and the same
 * live support contact the Help pages use (`SupportContactCard`). Privacy and
 * Terms are legal texts the business has to supply; until it does, they say
 * so and still offer a way to reach support rather than a dead end.
 *
 * `/support` is deliberately NOT here: it is a real page in the account
 * subtree, because a support ticket has to know who is writing it.
 */
const PAGES: Record<string, { title: string; body: ReactNode }> = {
  '/about': {
    title: 'About UnieMax',
    body: (
      <>
        <p>
          UnieMax is a marketplace of independent stores. Every shop here is run
          by its own seller — you buy directly from them, with Cash on Delivery
          or secure online payment.
        </p>
        <p>
          For sellers, UnieMax is the simplest way to get a shop online: add your
          products, pick a look, and share one link. No technical knowledge
          needed, and it&apos;s free to start.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link to="/" className={buttonClass({ size: 'md' })}>
            Explore stores
          </Link>
          <Link to="/mystores/new" className={buttonClass({ variant: 'ring', size: 'md' })}>
            Create your store
          </Link>
        </div>
      </>
    ),
  },
  '/contact': {
    title: 'Contact us',
    body: (
      <>
        <p>
          Questions about UnieMax, your account or selling here — we&apos;re
          happy to help. For an order, the quickest route is the store&apos;s own
          Help page, linked in every store&apos;s header and footer.
        </p>
        <div className="text-left">
          <SupportContactCard mailSubject="UnieMax enquiry" />
        </div>
        <p>
          Signed in?{' '}
          <Link to="/support" className="font-semibold text-brand hover:underline">
            Raise a support ticket
          </Link>{' '}
          and follow the reply in your account.
        </p>
      </>
    ),
  },
  '/privacy': { title: 'Privacy Policy', body: <PendingLegal /> },
  '/terms': { title: 'Terms & Conditions', body: <PendingLegal /> },
}

function PendingLegal() {
  return (
    <>
      <p>
        We&apos;re finalising this page. If you have a question about your data
        or how UnieMax works in the meantime, contact us:
      </p>
      <div className="text-left">
        <SupportContactCard mailSubject="Question about UnieMax policies" />
      </div>
    </>
  )
}

export function InfoComingSoonPage() {
  const { pathname } = useLocation()
  const page = PAGES[pathname] ?? { title: 'Coming soon', body: <PendingLegal /> }
  usePageTitle(page.title)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12 text-center">
      <Link to="/" className="mb-8 flex items-center">
        <AppLogoLockup className="h-9" />
      </Link>

      <h1 className="font-heading text-3xl font-bold text-fg">{page.title}</h1>
      <div className="mt-4 w-full max-w-xl space-y-4 text-sm leading-6 text-muted">
        {page.body}
      </div>
      <Link to="/" className="mt-8 text-sm font-semibold text-muted hover:text-fg">
        ← Back to Home
      </Link>
    </div>
  )
}
