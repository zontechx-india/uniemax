import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote } from '../../../shared/ui/form'
import { storeInboxApi } from '../../features/support/supportApi'
import type { SupportTicket, TicketStatus } from '../../features/support/supportApi'
import { CATEGORY_LABELS } from '../../features/support/supportApi'
import { TicketStatusChip, formatTicketDateTime } from '../../features/support/ticketMeta'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ChatIcon, ChevronRightIcon, LifebuoyIcon } from '../../layout/icons'

/**
 * Customer Support section of Store Management — the shop's **inbox**:
 * requests shoppers raised from the storefront's Help & Support.
 *
 * Distinct from the store's *UnieMax Support* section next to it, which is
 * the seller writing to the platform. This one is the seller answering their
 * own buyers; UnieMax is not a party to these threads and never sees them.
 *
 * Opens on **Needs reply** (open + in progress), oldest activity first — same
 * reasoning as the admin console's queue: an inbox exists to show what is
 * still owed, which is the opposite of the newest-first ordering everywhere
 * else in store management.
 */

const TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Needs reply' },
  { value: '', label: 'All' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

export function StoreCustomerSupportPage() {
  const { store } = useManagedStore()

  const [tab, setTab] = useState<string>('open')
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(
    (value: string) => {
      let cancelled = false
      setTickets(null)
      setLoadError(null)
      storeInboxApi
        .list(store.id, {
          pageSize: 50,
          ...(value === 'open'
            ? { open: 'true' as const }
            : value
              ? { status: value as TicketStatus }
              : {}),
        })
        .then(({ items, meta }) => {
          if (cancelled) return
          setTickets(items)
          setOpenCount(meta.openCount)
        })
        .catch((err) => {
          if (!cancelled) setLoadError(toApiError(err).message)
        })
      return () => {
        cancelled = true
      }
    },
    [store.id],
  )

  useEffect(() => load(tab), [load, tab])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
            Customer Support
          </h2>
          <p className="mt-1 text-sm text-muted">
            Requests your customers raised from your storefront's Help &amp;
            Support. Answering one tells them straight away.
          </p>
        </div>
        {openCount > 0 && (
          <span className="rounded-pill bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
            {openCount} awaiting reply
          </span>
        )}
      </div>

      {/* Status tabs — one axis of choice, so they stay on one line. */}
      <div className="mt-5 -mb-px flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((option) => {
          const active = option.value === tab
          return (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setTab(option.value)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {loadError ? (
          <ErrorNote>{loadError}</ErrorNote>
        ) : tickets === null ? (
          <p className="py-6 text-center text-sm text-muted">Loading requests…</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <LifebuoyIcon className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-2 text-sm font-medium text-fg">
              {tab === 'open' ? 'Nothing waiting on you' : 'No requests here'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Customers reach you from Help &amp; Support on your storefront —
              in the top bar and the footer of{' '}
              <span className="font-medium text-fg">{store.name}</span>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={ticket.id}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-alt"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">
                        {ticket.subject}
                      </span>
                      <TicketStatusChip status={ticket.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {ticket.customer?.name ?? ticket.contactEmail ?? 'A customer'} ·{' '}
                      {CATEGORY_LABELS[ticket.category]} · Updated{' '}
                      {formatTicketDateTime(ticket.lastMessageAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                    <ChatIcon className="h-4 w-4" />
                    {ticket.messageCount}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
