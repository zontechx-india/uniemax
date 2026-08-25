import { Link } from 'react-router-dom'
import { TicketThread } from '../../features/support/TicketThread'
import { ArrowLeftIcon } from '../../layout/icons'

/**
 * One of the seller's store tickets. The thread itself is shared with the
 * account-level Help & Support (`features/support/TicketThread`); all this
 * page owns is where "back" goes.
 */
export function StoreSupportTicketPage() {
  return (
    <TicketThread
      back={
        <Link
          to=".."
          relative="path"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          All tickets
        </Link>
      }
    />
  )
}
