import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { buttonClass } from '../../shared/ui/Button'
import { SupportContactCard } from '../features/support/SupportContactCard'

/**
 * The marketplace footer's info pages (About, Contact, Privacy, Terms,
 * Refund & Returns, Shipping) —
 * public, no session and no dashboard shell, so a shared link lands here for
 * anonymous visitors without bouncing through /login.
 *
 * About and Contact carry real content: what the platform is, and the same
 * live support contact the Help pages use (`SupportContactCard`). Refund &
 * Returns and Shipping are the platform policies — Google Merchant Center
 * links the return policy from every listing and checks the page exists, so
 * the facts here (7-day window, who pays return postage) must match what is
 * entered there. Privacy and Terms are legal texts the business has to
 * supply; until it does, they say so and still offer a way to reach support
 * rather than a dead end.
 *
 * `/support` is deliberately NOT here: it is a real page in the account
 * subtree, because a support ticket has to know who is writing it.
 */
interface InfoPage {
  title: string
  /**
   * The head — must match `INFO_PAGES` in
   * `backend/src/modules/seo/pageShell.service.ts`, which writes it into the
   * first byte for crawlers and link previews.
   */
  seo: { title: string; description?: string; robots?: string }
  body: ReactNode
  /** Long left-aligned text (the policies) rather than a centred blurb. */
  article?: boolean
}

const HOLDING = 'noindex, follow'

const PAGES: Record<string, InfoPage> = {
  '/about': {
    title: 'About UnieMax',
    seo: {
      title: 'About',
      description:
        'UnieMax is a marketplace of independent stores. Buy directly from each seller with Cash on Delivery or secure online payment — or open your own store for free.',
    },
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
          <Link to="/mystores/new" className={buttonClass({ variant: 'secondary', size: 'md' })}>
            Create your store
          </Link>
        </div>
      </>
    ),
  },
  '/contact': {
    title: 'Contact us',
    seo: {
      title: 'Contact us',
      description:
        'Contact UnieMax support by email or phone, Monday to Saturday, 10 AM to 7 PM IST — for questions about your account, an order or selling on UnieMax.',
    },
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
  '/refund-policy': {
    title: 'Refund & Returns Policy',
    seo: {
      title: 'Refund & Returns Policy',
      description:
        'UnieMax refund and returns policy: return eligible products within 7 days of delivery, free returns for damaged or wrong items, and refunds within 7 working days.',
    },
    body: <RefundPolicy />,
    article: true,
  },
  '/shipping-policy': {
    title: 'Shipping Policy',
    seo: {
      title: 'Shipping Policy',
      description:
        'How shipping works on UnieMax: each store ships its own orders within India, sets its own delivery areas and charges, and shows the exact charge before you pay.',
    },
    body: <ShippingPolicy />,
    article: true,
  },
  '/privacy': {
    title: 'Privacy Policy',
    seo: { title: 'Privacy Policy', robots: HOLDING },
    body: <PendingLegal />,
  },
  '/terms': {
    title: 'Terms & Conditions',
    seo: { title: 'Terms & Conditions', robots: HOLDING },
    body: <PendingLegal />,
  },
}

/** A titled block inside a long policy page. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  )
}

function RefundPolicy() {
  return (
    <>
      <p>
        Every store on UnieMax is run by its own seller, who packs and ships
        your order. This policy applies to every order placed on UnieMax, in
        every store.
      </p>
      <Section title="7-day returns">
        <p>
          You can ask to return a product within <strong>7 days of delivery</strong>.
          The product must be unused, in its original packaging, with all tags,
          accessories and the invoice.
        </p>
      </Section>
      <Section title="What cannot be returned">
        <ul className="list-disc space-y-1 pl-5">
          <li>Food, groceries and other perishable items</li>
          <li>Personal care, beauty and hygiene products once opened</li>
          <li>Innerwear and products sold as non-returnable on the product page</li>
          <li>Custom-made or personalised products</li>
        </ul>
        <p>
          If any of these arrive damaged, defective or wrong, they are covered
          by the next section.
        </p>
      </Section>
      <Section title="Damaged, defective or wrong item">
        <p>
          Tell us within <strong>48 hours of delivery</strong>, with photos of the
          product and the package. We will arrange a free replacement or a full
          refund, including any shipping you paid.
        </p>
      </Section>
      <Section title="How to request a return">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open the store&apos;s Help page (linked in every store&apos;s header and footer), or contact UnieMax support below.</li>
          <li>Share your order number, the product and the reason for the return.</li>
          <li>The seller confirms the return and tells you where to send the product.</li>
        </ol>
        <p>
          For a change of mind, you pay the cost of sending the product back.
          For a damaged, defective or wrong item, return shipping is free.
        </p>
      </Section>
      <Section title="Refunds">
        <p>
          Once the seller receives and checks the returned product, the refund
          is processed within <strong>7 working days</strong>. Online payments are
          refunded to the same payment method. Cash on Delivery orders are
          refunded to your bank account or UPI ID.
        </p>
      </Section>
      <Section title="Cancellations">
        <p>
          You can cancel an order from your Orders page until the seller
          confirms it. After that, contact the store or UnieMax support. If you
          paid online for a cancelled order, the full amount is refunded to the
          same payment method.
        </p>
      </Section>
      <Section title="Contact">
        <SupportContactCard mailSubject="Return or refund request" />
      </Section>
    </>
  )
}

function ShippingPolicy() {
  return (
    <>
      <p>
        Every store on UnieMax ships its own orders, so delivery areas, charges
        and times are set by each seller.
      </p>
      <Section title="Where we deliver">
        <p>
          Stores deliver within India. Some stores deliver only to certain
          pincodes — the product page lets you check your pincode before you
          order. Some stores also offer pickup from the shop.
        </p>
      </Section>
      <Section title="Shipping charges">
        <p>
          Each store sets its own charge: free delivery, a flat charge per
          order, or free delivery above an order value. The product page shows
          the store&apos;s charge, and checkout shows the exact amount before you
          pay. One order pays one shipping charge.
        </p>
      </Section>
      <Section title="Delivery time">
        <p>
          Delivery time depends on the store and on your location. You can
          follow every step of your order — confirmed, packed, shipped,
          delivered — from your Orders page.
        </p>
      </Section>
      <Section title="Payment">
        <p>
          Pay online by UPI, card or net banking, or with Cash on Delivery where
          the store offers it.
        </p>
      </Section>
      <Section title="Problems with delivery">
        <p>
          If your order is late, or arrives damaged or incomplete, contact the
          store&apos;s Help page or UnieMax support. Damaged items are covered by
          our <Link to="/refund-policy" className="font-semibold text-brand hover:underline">Refund &amp; Returns Policy</Link>.
        </p>
        <SupportContactCard mailSubject="Delivery question" />
      </Section>
    </>
  )
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
  const page: InfoPage = PAGES[pathname] ?? {
    title: 'Coming soon',
    seo: { title: 'Coming soon', robots: HOLDING },
    body: <PendingLegal />,
  }
  useSeo({ title: [page.seo.title], description: page.seo.description, robots: page.seo.robots })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12 text-center">
      <Link to="/" className="mb-8 flex items-center">
        <AppLogoLockup className="h-9" />
      </Link>

      <h1 className="font-heading text-3xl font-bold text-fg">{page.title}</h1>
      {page.article ? (
        <article className="mt-6 w-full max-w-2xl space-y-6 text-left text-base leading-7 text-muted">
          {page.body}
        </article>
      ) : (
        <div className="mt-4 w-full max-w-xl space-y-4 text-sm leading-6 text-muted">
          {page.body}
        </div>
      )}
      <Link to="/" className="mt-8 text-sm font-semibold text-muted hover:text-fg">
        ← Back to Home
      </Link>
    </div>
  )
}
