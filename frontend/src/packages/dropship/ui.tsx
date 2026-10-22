import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toApiError } from '../../shared/auth/http'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeTone } from '../../shared/ui/Badge'
import type { Actor, InviteStatus, LinkStatus, ReturnFeePayer, SupplierOrderStatus, Terms } from './api'

/**
 * Small pieces every supplier screen shares. Words follow
 * docs/dropshipping/glossary.md — never "dropship", "link", "copy".
 */

export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const id = ++latest.current
    setLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (id !== latest.current) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (id !== latest.current) return
        setError(toApiError(err).message)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, setData, loading, error, reload: () => setNonce((n) => n + 1) }
}

export function money(value: number | null | undefined): string {
  if (value == null) return '—'
  // A loss reads "−₹20", not "₹-20".
  if (value < 0) return `−${money(-value)}`
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const dayText = (n: number) => (n === 1 ? '1 day' : `${n} days`)
export const returnsText = (days: number) =>
  days === 0 ? 'No returns' : `Returns within ${dayText(days)}`
export const codText = (on: boolean) => (on ? 'Cash on delivery allowed' : 'Online payment only')
export const feePayerText = (who: ReturnFeePayer, side: 'seller' | 'supplier', other: string) =>
  who === 'SELLER'
    ? side === 'seller'
      ? 'You pay it'
      : `${other} pays it`
    : side === 'seller'
      ? `${other} bears it`
      : 'You bear it'

const LINK_WORDS: Record<LinkStatus, { text: string; tone: BadgeTone }> = {
  PENDING: { text: 'Waiting for approval', tone: 'pending' },
  ACTIVE: { text: 'Active', tone: 'success' },
  PAUSED: { text: 'Paused', tone: 'warning' },
  ENDED: { text: 'Ended', tone: 'neutral' },
}

const INVITE_WORDS: Record<InviteStatus, { text: string; tone: BadgeTone }> = {
  SENT: { text: 'Waiting to join', tone: 'pending' },
  ACCEPTED: { text: 'Joined', tone: 'success' },
  REVOKED: { text: 'Cancelled', tone: 'neutral' },
  EXPIRED: { text: 'Link expired', tone: 'danger' },
}

export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  const w = LINK_WORDS[status]
  return <Badge tone={w.tone} dot>{w.text}</Badge>
}

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const w = INVITE_WORDS[status]
  return <Badge tone={w.tone} dot>{w.text}</Badge>
}

/** "Paused by you" / "Paused by Sri Textiles". */
export function statusByText(by: Actor | null, me: Actor, other: string): string | null {
  if (!by) return null
  if (by === me) return 'by you'
  if (by === 'ADMIN' || by === 'SYSTEM') return 'by UnieMax'
  return `by ${other}`
}

/**
 * One answer to a question asked with no answer pre-selected (D-5, D-17) —
 * a radio card, so the whole row is the tap target.
 */
export function ChoiceCard({
  name,
  checked,
  onSelect,
  title,
  note,
  disabled = false,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  title: string
  note?: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition ${
        checked ? 'border-brand bg-brand-soft' : 'border-line hover:bg-fg/5'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
      />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        {note && <span className="block text-xs text-muted">{note}</span>}
      </span>
    </label>
  )
}

/** A question with its answers, as a fieldset so screen readers group them. */
export function Question({
  legend,
  error,
  children,
}: {
  legend: string
  error?: string | undefined
  children: ReactNode
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-fg">{legend}</legend>
      <div className="space-y-2">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** Label + value line in a terms summary. */
export function TermLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-fg">{value}</dd>
    </div>
  )
}

/** The change log both sides see (T-11): newest first, each with its date. */
export function TermsLog({ log, viewer }: { log: Terms['log']; viewer: 'seller' | 'supplier' }) {
  if (log.length === 0) return <p className="text-sm text-muted">No changes yet.</p>
  const who = (actor: Actor) =>
    actor === 'ADMIN' || actor === 'SYSTEM'
      ? 'UnieMax'
      : actor === 'SELLER'
        ? viewer === 'seller' ? 'You' : 'Seller'
        : viewer === 'supplier' ? 'You' : 'Supplier'
  return (
    <ol className="space-y-3">
      {log.map((entry) => (
        <li key={entry.id} className="border-l-2 border-line pl-3">
          <p className="text-sm text-fg">{entry.text}</p>
          <p className="text-xs text-muted">
            {who(entry.changedAs)} · {dateTime(entry.createdAt)} · applies to orders placed from then
          </p>
        </li>
      ))}
    </ol>
  )
}

/** A shareable invite message as a wa.me link, to the supplier's number when we have it. */
export function whatsappHref(text: string, phone?: string | null): string {
  const digits = phone?.replace(/\D/g, '') ?? ''
  const to = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}

/** Supplier order status words, per side (glossary → Supplier order status words). */
const ORDER_WORDS: Record<SupplierOrderStatus, { supplier: string; seller: string; tone: BadgeTone }> = {
  AWAITING_PAYMENT: { supplier: 'Waiting for payment', seller: 'Waiting for payment', tone: 'neutral' },
  EXPIRED: { supplier: 'Not paid', seller: 'Not paid in time', tone: 'neutral' },
  NEW: { supplier: 'New', seller: 'With supplier', tone: 'pending' },
  ACCEPTED: { supplier: 'Confirmed', seller: 'Supplier confirmed', tone: 'brand' },
  SHIPPED: { supplier: 'Shipped', seller: 'Shipped', tone: 'brand' },
  DELIVERED: { supplier: 'Delivered', seller: 'Delivered', tone: 'success' },
  REJECTED: { supplier: "Couldn't ship", seller: "Supplier couldn't ship", tone: 'danger' },
  CANCELLED: { supplier: 'Cancelled', seller: 'Cancelled', tone: 'danger' },
  RETURNED: { supplier: 'Came back', seller: 'Came back to supplier', tone: 'danger' },
}

export function OrderStatusBadge({ status, side }: { status: SupplierOrderStatus; side: 'supplier' | 'seller' }) {
  const w = ORDER_WORDS[status]
  return (
    <Badge tone={w.tone} dot>
      {w[side]}
    </Badge>
  )
}

export function orderStatusText(status: SupplierOrderStatus, side: 'supplier' | 'seller'): string {
  return ORDER_WORDS[status][side]
}

/** "Ship by 23 Oct" — and when it has passed, it says so. */
export function shipByText(iso: string | null, late: boolean): string | null {
  if (!iso) return null
  const day = new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return late ? `Was due ${day}` : `Ship by ${day}`
}
