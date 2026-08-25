import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { useCustomerSession } from '../../app/sessionContext'
import { NewTicketForm } from '../../features/support/NewTicketForm'
import { SupportContactCard } from '../../features/support/SupportContactCard'
import { TicketList } from '../../features/support/TicketList'
import { SELLER_CATEGORIES, supportApi } from '../../features/support/supportApi'
import type { SupportTicket } from '../../features/support/supportApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { PlusIcon } from '../../layout/icons'

/**
 * UnieMax Support section of Store Management — how a **seller** reaches the
 * platform team about their shop.
 *
 * Named for who is on the other end, because the section beside it
 * (Customer Support) is the shop's own inbox: "Help & Support" would describe
 * both equally once buyers can write in too.
 *
 * Two ways out of a problem, in the order they are useful: direct contact
 * (always on screen), then a tracked ticket the platform answers in-app.
 * Everything visual is shared with the account-level Help & Support page
 * (`features/support/`); what this page decides is the **scope** — the list
 * is filtered to THIS store and new tickets carry it, because the section is
 * opened from a store and "my tickets across everything I own" is a different
 * question that would make the page ambiguous.
 */
export function StoreSupportPage() {
  const { store } = useManagedStore()
  const { customer } = useCustomerSession()

  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTickets(null)
    setLoadError(null)
    supportApi
      .list({ storeId: store.id, pageSize: 50 })
      .then(({ items }) => {
        if (!cancelled) setTickets(items)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [store.id])

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        UnieMax Support
      </h2>
      <p className="mt-1 text-sm text-muted">
        Reach the UnieMax team about this store — payouts, catalog, settings,
        anything that looks broken. Messages from your own customers are in{' '}
        <Link
          to="../customer-support"
          relative="path"
          className="font-medium text-brand hover:underline"
        >
          Customer Support
        </Link>
        .
      </p>

      <div className="mt-5">
        <SupportContactCard mailSubject={`Support · ${store.name}`} />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-body text-base font-semibold tracking-normal text-fg">
          Store tickets
        </h3>
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
          categories={SELLER_CATEGORIES}
          storeId={store.id}
          intro={
            <>
              About <span className="font-medium text-fg">{store.name}</span>.
              Tell us what happened — order numbers and specifics help us answer
              in one reply instead of three.
            </>
          }
          subjectPlaceholder="e.g. Payout not received for last week"
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
            emptyHint="Raise one when something needs the UnieMax team — an order, a payout, or anything that looks broken."
          />
        </div>
      )}
    </div>
  )
}
