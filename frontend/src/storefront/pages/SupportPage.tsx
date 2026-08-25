import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../../shared/usePageTitle'
import { toApiError } from '../../shared/auth/http'
import { useCustomerSession } from '../app/sessionContext'
import { NewTicketForm } from '../features/support/NewTicketForm'
import { SupportContactCard } from '../features/support/SupportContactCard'
import { TicketList } from '../features/support/TicketList'
import { CUSTOMER_CATEGORIES, supportApi } from '../features/support/supportApi'
import type { SupportTicket } from '../features/support/supportApi'
import { PlusIcon } from '../layout/icons'

/**
 * Help & Support (`/support`) — how a **shopper** reaches the UnieMax team,
 * reached from the account menu.
 *
 * It is the same feature as a seller's store Support section, pointed at the
 * other half of the audience: same contact card, same form, same thread
 * (`features/support/`), differing in exactly two things —
 *
 *   - the list is scoped `ACCOUNT`, so a customer who also sells does not see
 *     their store threads mixed into their personal ones (those live under
 *     each store, where the store's context is);
 *   - the categories on offer are the shopper's problems (orders, refunds,
 *     reporting a store) rather than a seller's (payouts, store setup).
 *
 * A ticket here goes to **UnieMax**, not to the shop that was ordered from —
 * a customer↔seller channel is a separate feature.
 */
export function SupportPage() {
  usePageTitle('Help & Support')

  const { customer } = useCustomerSession()
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    let cancelled = false
    supportApi
      .list({ scope: 'ACCOUNT', pageSize: 50 })
      .then(({ items }) => {
        if (!cancelled) setTickets(items)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-body text-2xl font-semibold tracking-normal text-fg">
        Help &amp; Support
      </h1>
      <p className="mt-1 text-sm text-muted">
        Reach the UnieMax team about an order, a payment or your account —
        call, email, or raise a ticket and follow the answer here.
      </p>

      <div className="mt-5">
        <SupportContactCard mailSubject="Support request" />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-body text-base font-semibold tracking-normal text-fg">
          Your tickets
        </h2>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            New ticket
          </button>
        )}
      </div>

      {composing && (
        <NewTicketForm
          categories={CUSTOMER_CATEGORIES}
          intro={
            <>
              Tell us what happened. If it is about an order, including the
              order number from{' '}
              <Link to="/orders" className="font-medium text-brand hover:underline">
                My Orders
              </Link>{' '}
              gets you an answer in one reply instead of three.
            </>
          }
          subjectPlaceholder="e.g. Order not delivered yet"
          defaultEmail={customer.email ?? ''}
          defaultPhone={customer.phone ?? ''}
          onCancel={() => setComposing(false)}
          onCreated={(ticket) => {
            setTickets((rows) => [ticket, ...(rows ?? [])])
            setComposing(false)
          }}
        />
      )}

      {!(composing && (tickets?.length ?? 0) === 0) && (
        <div className="mt-4">
          <TicketList
            tickets={tickets}
            error={loadError}
            emptyHint="Raise one when an order, a payment or your account needs the UnieMax team."
          />
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        Selling on UnieMax? Questions about a shop you own — payouts, catalog,
        store settings — go under that store's own Help &amp; Support, where we
        can see the store.
      </p>
    </div>
  )
}
