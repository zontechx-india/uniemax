import { Link } from 'react-router-dom'
import { usePageTitle } from '../../shared/usePageTitle'
import { TicketThread } from '../features/support/TicketThread'
import { ArrowLeftIcon } from '../layout/icons'

/**
 * One of the customer's own support tickets (`/support/:ticketId`). The
 * thread is shared with the seller's store tickets
 * (`features/support/TicketThread`); all this page owns is where "back" goes.
 */
export function SupportTicketPage() {
  usePageTitle('Support ticket')

  return (
    <div className="mx-auto max-w-3xl">
      <TicketThread
        back={
          <Link
            to="/support"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Help &amp; Support
          </Link>
        }
      />
    </div>
  )
}
