import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { CATEGORY_LABELS, supportApi } from './supportApi'
import type { SupportTicketDetail } from './supportApi'
import { TicketStatusChip, formatTicketDateTime } from './ticketMeta'

/**
 * One ticket thread as the reporter sees it — fetch, conversation, reply box
 * and Close — shared by all three entry points (account → UnieMax, store →
 * UnieMax, shopper → a shop), which differ only in the back link above it.
 *
 * Each message is attributed from its **role**, not the person who typed it:
 * "UnieMax Support" or the shop's name, never an individual. The reporter is
 * talking to an organisation, and naming a staff member invites them to chase
 * that person instead of the queue. The role is derived server-side, because
 * on a store thread the seller replies from a Customer account and the raw
 * author type says `CUSTOMER` for both sides.
 *
 * A **closed** ticket is read-only on both sides. Replying to a *resolved*
 * one, by contrast, reopens it — "resolved" is the answering side's opinion,
 * and the person who raised it gets to disagree without filing a duplicate.
 */
export function TicketThread({ back }: { back: ReactNode }) {
  const { ticketId } = useParams()
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (!ticketId) return
    let cancelled = false
    setTicket(null)
    setLoadError(null)
    supportApi
      .get(ticketId)
      .then((data) => {
        if (!cancelled) setTicket(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!ticketId) return
    setBusy(true)
    setActionError(null)
    try {
      setTicket(await supportApi.reply(ticketId, reply.trim()))
      setReply('')
    } catch (err) {
      setActionError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const closeTicket = async () => {
    if (!ticketId) return
    setBusy(true)
    setActionError(null)
    try {
      setTicket(await supportApi.close(ticketId))
      setConfirmClose(false)
    } catch (err) {
      setActionError(toApiError(err).message)
      setConfirmClose(false)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        {back}
        <ErrorNote>{loadError}</ErrorNote>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="space-y-3">
        {back}
        <p className="py-8 text-center text-sm text-muted">Loading ticket…</p>
      </div>
    )
  }

  const closed = ticket.status === 'CLOSED'

  return (
    <div className="space-y-4">
      {back}

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-body text-lg font-semibold tracking-normal text-fg">
              {ticket.subject}
            </h2>
            <TicketStatusChip status={ticket.status} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {ticket.ticketNumber} · {CATEGORY_LABELS[ticket.category]}
            {ticket.storeName ? ` · ${ticket.storeName}` : ''} · Raised{' '}
            {formatTicketDateTime(ticket.createdAt)}
          </p>
        </div>
        {!closed && (
          <button
            type="button"
            onClick={() => setConfirmClose(true)}
            disabled={busy}
            className="h-9 rounded-md border border-line px-3 text-sm font-medium text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
          >
            Close ticket
          </button>
        )}
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((message) => {
          const fromSupport = message.authorRole !== 'REPORTER'
          return (
            <li
              key={message.id}
              className={`rounded-lg border p-4 ${
                fromSupport ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-alt'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-fg">
                  {message.authorRole === 'REPORTER'
                    ? 'You'
                    : message.authorRole === 'STORE'
                      ? (ticket.storeName ?? 'The store')
                      : 'UnieMax Support'}
                </p>
                <p className="text-xs text-muted">
                  {formatTicketDateTime(message.createdAt)}
                </p>
              </div>
              {/* Preserve the reporter's line breaks — a pasted error log is
                  unreadable reflowed into one paragraph. */}
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{message.body}</p>
            </li>
          )
        })}
      </ol>

      {closed ? (
        <InfoNote>
          This is closed. Raise a new one from Help &amp; Support if you still
          need help.
        </InfoNote>
      ) : (
        <form onSubmit={sendReply} className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              Add a reply
            </span>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={4}
              minLength={10}
              maxLength={4000}
              required
              placeholder="Anything new since you wrote in?"
              className="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent"
            />
          </label>

          {ticket.status === 'RESOLVED' && (
            <InfoNote>
              This was marked resolved — replying reopens it.
            </InfoNote>
          )}
          {actionError && <ErrorNote>{actionError}</ErrorNote>}

          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
          >
            {busy ? 'Sending…' : 'Send reply'}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmClose}
        busy={busy}
        title="Close this ticket?"
        tone="neutral"
        confirmLabel="Close ticket"
        description="A closed ticket takes no more replies from either side. If the issue comes back, raise a new ticket."
        onConfirm={() => void closeTicket()}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  )
}
