import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, InfoNote, Select } from '../../../shared/ui/form'
import { CATEGORY_LABELS, storeInboxApi } from '../../features/support/supportApi'
import type {
  SupportTicketDetail,
  TicketStatus,
} from '../../features/support/supportApi'
import { STATUS_LABELS } from '../../features/support/supportApi'
import {
  TicketStatusChip,
  formatTicketDateTime,
} from '../../features/support/ticketMeta'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ArrowLeftIcon, MailIcon, PhoneCallIcon } from '../../layout/icons'

/**
 * One customer request, as the **seller** answers it.
 *
 * Deliberately simpler than the admin console's equivalent: a status control
 * and a reply box, and no priority — that is the platform's triage
 * vocabulary, and a shop's inbox is small enough to read without one.
 *
 * Replying picks the request up on its own (Open → In progress), so the
 * inbox's "needs reply" tab can never quietly lie about what has been
 * handled. Every reply and status change reaches the customer immediately,
 * in-app and on their devices.
 */

const STATUS_OPTIONS: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

export function StoreCustomerSupportTicketPage() {
  const { store } = useManagedStore()
  const { ticketId } = useParams()

  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticketId) return
    let cancelled = false
    setTicket(null)
    setLoadError(null)
    storeInboxApi
      .get(store.id, ticketId)
      .then((data) => {
        if (!cancelled) setTicket(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [store.id, ticketId])

  const run = async (action: () => Promise<SupportTicketDetail>) => {
    setBusy(true)
    setActionError(null)
    try {
      setTicket(await action())
    } catch (err) {
      setActionError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const sendReply = (event: FormEvent) => {
    event.preventDefault()
    if (!ticketId) return
    void run(async () => {
      const updated = await storeInboxApi.reply(store.id, ticketId, reply.trim())
      setReply('')
      return updated
    })
  }

  const backLink = (
    <Link
      to=".."
      relative="path"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      All requests
    </Link>
  )

  if (loadError) {
    return (
      <div className="space-y-3">
        {backLink}
        <ErrorNote>{loadError}</ErrorNote>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="space-y-3">
        {backLink}
        <p className="py-8 text-center text-sm text-muted">Loading request…</p>
      </div>
    )
  }

  const closed = ticket.status === 'CLOSED'
  const customerName = ticket.customer?.name ?? 'Customer'

  return (
    <div className="space-y-4">
      {backLink}

      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-body text-lg font-semibold tracking-normal text-fg">
            {ticket.subject}
          </h2>
          <TicketStatusChip status={ticket.status} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {ticket.ticketNumber} · {CATEGORY_LABELS[ticket.category]} · Raised{' '}
          {formatTicketDateTime(ticket.createdAt)}
        </p>

        {/* How to reach them outside the thread — a snapshot taken when they
            wrote in, so it stays valid even if their account details change. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="font-medium text-fg">{customerName}</span>
          {ticket.contactPhone && (
            <a
              href={`tel:${ticket.contactPhone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-1.5 hover:text-brand"
            >
              <PhoneCallIcon className="h-3.5 w-3.5" />
              {ticket.contactPhone}
            </a>
          )}
          {ticket.contactEmail && (
            <a
              href={`mailto:${ticket.contactEmail}`}
              className="inline-flex items-center gap-1.5 break-all hover:text-brand"
            >
              <MailIcon className="h-3.5 w-3.5" />
              {ticket.contactEmail}
            </a>
          )}
        </div>
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((message) => {
          const fromStore = message.authorRole === 'STORE'
          return (
            <li
              key={message.id}
              className={`rounded-lg border p-4 ${
                fromStore ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-alt'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-fg">
                  {fromStore ? 'You' : customerName}
                </p>
                <p className="text-xs text-muted">
                  {formatTicketDateTime(message.createdAt)}
                </p>
              </div>
              {/* Line breaks preserved — a pasted order number list is
                  unreadable reflowed into one paragraph. */}
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg">
                {message.body}
              </p>
            </li>
          )
        })}
      </ol>

      {closed ? (
        <InfoNote>
          This request is closed and takes no further replies from either side.
        </InfoNote>
      ) : (
        <form onSubmit={sendReply} className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              Reply to {customerName}
            </span>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={4}
              minLength={10}
              maxLength={4000}
              required
              placeholder="They are notified as soon as you send this."
              className="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent"
            />
          </label>

          {actionError && <ErrorNote>{actionError}</ErrorNote>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="h-11 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
            >
              {busy ? 'Sending…' : 'Send reply'}
            </button>

            <label className="flex items-center gap-2 text-sm text-muted">
              Status
              <Select
                className="h-11 w-40"
                value={ticket.status}
                disabled={busy}
                onChange={(event) => {
                  if (!ticketId) return
                  void run(() =>
                    storeInboxApi.setStatus(
                      store.id,
                      ticketId,
                      event.target.value as TicketStatus,
                    ),
                  )
                }}
              >
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <p className="text-xs text-muted">
            Marking a request resolved tells the customer — and they can reopen
            it by replying. Closing it ends the conversation for both of you.
          </p>
        </form>
      )}
    </div>
  )
}
