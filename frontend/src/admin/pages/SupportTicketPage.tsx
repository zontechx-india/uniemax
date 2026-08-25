import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { TicketPriority, TicketStatus } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import {
  Button,
  Card,
  CardHeader,
  Detail,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextArea,
} from '../ui/primitives'
import {
  TICKET_CATEGORY_LABELS,
  TicketPriorityChip,
  TicketScopeChip,
  TicketStatusChip,
} from '../ui/statusMeta'
import { formatDateTime } from '../ui/format'
import { BackIcon } from '../layout/icons'

/**
 * One support ticket — from a seller about their store or a shopper about
 * their account: the thread, the reply box, and triage.
 *
 * Two deliberate behaviours the admin does not have to think about:
 *   - **Replying picks the ticket up.** An OPEN ticket becomes IN_PROGRESS on
 *     the first reply, so the queue reflects reality without anyone also
 *     remembering to change a dropdown.
 *   - **The reporter is notified on reply and on every status change**, in-app
 *     and by push — which is why status is a save-on-change control rather
 *     than a draft the admin can leave half-set.
 *
 * A CLOSED ticket is read-only on both sides: reopening happens by the
 * reporter raising a new one, so a thread always has exactly one subject.
 */

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
]

export default function SupportTicketPage() {
  const { ticketId = '' } = useParams()
  const navigate = useNavigate()
  const { data: ticket, loading, error, refresh } = useAdminQuery(
    () => adminApi.getTicket(ticketId),
    [ticketId],
  )

  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!ticket || loading) return <Skeleton rows={10} />

  const closed = ticket.status === 'CLOSED'

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const sendReply = () =>
    run(async () => {
      await adminApi.replyTicket(ticket.id, reply.trim())
      setReply('')
    }, 'Could not send the reply')

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/support')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        All tickets
      </button>

      <PageHeader
        title={ticket.subject}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusChip status={ticket.status} />
            <TicketPriorityChip priority={ticket.priority} />
            <TicketScopeChip storeId={ticket.storeId} />
            <span className="text-muted">
              {ticket.ticketNumber} · {TICKET_CATEGORY_LABELS[ticket.category]}
            </span>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- Thread ------------------------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Conversation"
            subtitle={`Raised ${formatDateTime(ticket.createdAt)}`}
          />

          <ol className="space-y-3">
            {ticket.messages.map((message) => {
              const fromSupport = message.authorType === 'ADMIN'
              return (
                <li
                  key={message.id}
                  className={`rounded-lg border p-3 ${
                    fromSupport ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-alt'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-fg">
                      {fromSupport
                        ? `Support${message.authorName ? ` · ${message.authorName}` : ''}`
                        : (message.authorName ?? 'Reporter')}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(message.createdAt)}</p>
                  </div>
                  {/* Line breaks preserved — a pasted error log is unreadable
                      reflowed into one paragraph. */}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{message.body}</p>
                </li>
              )
            })}
          </ol>

          {closed ? (
            <p className="mt-4 rounded-md border border-line bg-surface-alt px-3 py-2 text-sm text-muted">
              This ticket is closed and takes no further replies.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <TextArea
                label="Reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="They are notified in-app and on their devices as soon as you send this."
                maxLength={4000}
              />
              {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
              <Button
                variant="primary"
                disabled={busy || reply.trim().length < 10}
                onClick={() => void sendReply()}
              >
                {busy ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          )}
        </Card>

        {/* ---- Triage + who raised it --------------------------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Triage" />
            <div className="space-y-3">
              <SelectInput
                label="Status"
                value={ticket.status}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () =>
                      adminApi.updateTicket(ticket.id, {
                        status: event.target.value as TicketStatus,
                      }),
                    'Could not update the ticket',
                  )
                }
                options={STATUSES}
              />
              <SelectInput
                label="Priority"
                value={ticket.priority}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () =>
                      adminApi.updateTicket(ticket.id, {
                        priority: event.target.value as TicketPriority,
                      }),
                    'Could not update the ticket',
                  )
                }
                options={PRIORITIES}
              />
              <p className="text-xs text-muted">
                Status changes are saved immediately and the reporter is told.
                Priority is internal — they never see it.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Raised by" />
            <dl>
              <Detail label="Account">
                <Link
                  to={`/customers/${ticket.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {ticket.customer.name ?? ticket.customer.email ?? ticket.customer.id}
                </Link>
              </Detail>
              <Detail label="Store">
                {ticket.storeId ? (
                  <Link to={`/stores/${ticket.storeId}`} className="text-accent hover:underline">
                    {ticket.storeName}
                  </Link>
                ) : (
                  // Not a gap in the data: a shopper's ticket is about their
                  // account, not any one store.
                  <span className="text-muted">Written as a shopper</span>
                )}
              </Detail>
              <Detail label="Reply-to email">
                {ticket.contactEmail ? (
                  <a href={`mailto:${ticket.contactEmail}`} className="text-accent hover:underline">
                    {ticket.contactEmail}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Phone">
                {ticket.contactPhone ? (
                  <a
                    href={`tel:${ticket.contactPhone.replace(/[^\d+]/g, '')}`}
                    className="text-accent hover:underline"
                  >
                    {ticket.contactPhone}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Last activity">{formatDateTime(ticket.lastMessageAt)}</Detail>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
