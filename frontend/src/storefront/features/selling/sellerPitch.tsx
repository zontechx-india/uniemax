import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { trackSellerCtaClick } from '../../../shared/analytics/track'
import { useMarketSession } from '../../app/marketSession'
import { useStartSelling } from './startSelling'

/**
 * The seller pitch, shared by the homepage's Become-a-Seller panel and the
 * `/sell` landing page — one copy of the promise, so the two never drift.
 */

export const SELLER_PROOF_POINTS = [
  'Free to start — publish when you are ready',
  'Your own branding, theme and web address',
  'Cash on Delivery and online payments built in',
] as const

/**
 * What actually happens, in the order it happens. Three steps because that is
 * how many there are: the Create Store wizard, the product wizard, and the
 * Publish switch in the Store Builder.
 */
export const SELLER_STEPS = [
  {
    title: 'Create your store',
    body: 'Name it and add your logo — no logo yet? We make one from your initials.',
  },
  {
    title: 'Add your products',
    body: 'Photos, prices, sizes and stock, guided one product at a time.',
  },
  {
    title: 'Publish and share',
    body: 'Your shop goes live at its own link, ready to share on WhatsApp and Instagram.',
  },
] as const

/**
 * "Create a store" CTA that works for everyone: guests get the auth dialog
 * (opened on Register, with the seller copy) and land on the creation page
 * once signed in. Signed-in visitors get a real link, so it still opens in a
 * new tab.
 */
export function CreateStoreLink({
  placement,
  className,
  children,
}: {
  /** Which button this is, for analytics (`seller_cta_click`), e.g. `home_header`. */
  placement: string
  className?: string
  children: ReactNode
}) {
  const { state } = useMarketSession()
  const start = useStartSelling()
  if (state.status === 'authed') {
    return (
      <Link
        to="/mystores/new"
        onClick={() => trackSellerCtaClick(placement)}
        className={className}
      >
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => start(placement)} className={className}>
      {children}
    </button>
  )
}
