import { STATUS_LABELS } from './supportApi'
import type { TicketStatus } from './supportApi'

/**
 * Presentation of a support ticket's state, shared by the Support list and
 * the ticket thread so a status looks the same in both places.
 *
 * Tones follow the product's reserved meanings — amber = waiting on someone,
 * blue = being worked on, green = settled, grey = finished — and every chip
 * carries its label, so color is the second signal rather than the only one.
 */

const STATUS_CHIP: Record<TicketStatus, string> = {
  OPEN: 'bg-warning/10 text-warning',
  IN_PROGRESS: 'bg-accent/10 text-accent',
  RESOLVED: 'bg-success/10 text-success',
  CLOSED: 'bg-surface-alt text-muted',
}

export function TicketStatusChip({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** "2 Aug 2026, 10:45 am" — thread timestamps and last-activity lines. */
export function formatTicketDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
