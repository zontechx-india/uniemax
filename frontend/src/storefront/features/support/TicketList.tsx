import { Link } from 'react-router-dom'
import { ErrorNote } from '../../../shared/ui/form'
import { CATEGORY_LABELS } from './supportApi'
import type { SupportTicket } from './supportApi'
import { TicketStatusChip, formatTicketDateTime } from './ticketMeta'
import { ChatIcon, ChevronRightIcon, LifebuoyIcon } from '../../layout/icons'

/**
 * The reporter's own tickets, most recent activity first.
 *
 * `tickets === null` means "still loading" rather than "none" — an empty
 * array is a real answer and gets the empty state, so the two are never
 * confused. Rows link **relatively** (`to={ticket.id}`), which is what lets
 * the same list sit under `/support` and under
 * `/stores/{slug}/support` without knowing either path.
 */
export function TicketList({
  tickets,
  error,
  emptyHint,
  /** Store name shown per row — only useful where tickets can span stores. */
  showStore = false,
}: {
  tickets: SupportTicket[] | null
  error: string | null
  emptyHint: string
  showStore?: boolean
}) {
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (tickets === null) {
    return <p className="py-6 text-center text-sm text-muted">Loading tickets…</p>
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
        <LifebuoyIcon className="mx-auto h-7 w-7 text-muted" />
        <p className="mt-2 text-sm font-medium text-fg">No tickets yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{emptyHint}</p>
      </div>
    )
  }

  return (
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
                {ticket.ticketNumber} · {CATEGORY_LABELS[ticket.category]}
                {showStore && ticket.storeName ? ` · ${ticket.storeName}` : ''} ·
                Updated {formatTicketDateTime(ticket.lastMessageAt)}
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
  )
}
