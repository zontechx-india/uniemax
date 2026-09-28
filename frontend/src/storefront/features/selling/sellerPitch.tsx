import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { trackSellerCtaClick } from '../../../shared/analytics/track'
import { useMarketSession } from '../../app/marketSession'
import { openAuthDialog } from '../auth/authDialogStore'

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
    body: 'Name it, add your logo and business details. A few minutes.',
  },
  {
    title: 'Add your products',
    body: 'Photos, prices and stock, guided one product at a time.',
  },
  {
    title: 'Publish',
    body: 'Your shop goes live at its own address, ready to share.',
  },
] as const

/**
 * "Create a store" CTA that works for everyone: guests get the auth dialog
 * (opened on Register, with the seller copy) and land on the creation page
 * once signed in.
 */
export function CreateStoreLink({
  placement,
  className,
  children,
}: {
  /** Which button this is, for analytics (`seller_cta_click`), e.g. `sell_hero`. */
  placement: string
  className?: string
  children: ReactNode
}) {
  const { state } = useMarketSession()
  const navigate = useNavigate()
  const track = () => trackSellerCtaClick(placement)
  if (state.status === 'authed') {
    return (
      <Link to="/mystores/new" onClick={track} className={className}>
        {children}
      </Link>
    )
  }
  // Guest (or still probing): sign in right here, then carry on to the
  // wizard — the dialog can't navigate itself (it sits outside the router),
  // so the follow-up is passed in.
  return (
    <button
      type="button"
      onClick={() => {
        track()
        openAuthDialog({
          intent: 'sell',
          initialView: 'register',
          onSignedIn: () => navigate('/mystores/new'),
        })
      }}
      className={className}
    >
      {children}
    </button>
  )
}
