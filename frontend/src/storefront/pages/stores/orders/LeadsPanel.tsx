import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl'
import { ErrorNote } from '../../../../shared/ui/form'
import { storeLeadsApi } from '../../../features/stores/storesApi'
import type { CartLead, LeadItem, LeadKind, PaymentLead, StoreLeads } from '../../../features/stores/storesApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { BoxIcon, CartIcon, ChatIcon, PhoneCallIcon } from '../../../layout/icons'
import { formatOrderDate, timeAgo, whatsAppNumber } from '../orderMeta'
import { EmptyState } from '../ui/EmptyState'
import { StatusPill } from '../ui/StatusPill'
import type { StatusTone } from '../ui/StatusPill'
import { LeadDateFilter } from './LeadDateFilter'
import { clearDates, hasDateFilter, isDefaultDates, readDates, toApiRange, writeDates } from './leadDates'
import type { LeadDates } from './leadDates'
import { money } from './settlementMeta'

/**
 * Orders → Leads: people who nearly bought (docs/API.md → Seller leads).
 *
 *   Not paid      online checkouts whose payment never went through — the
 *                 shopper gave this shop their name and phone, so the seller
 *                 can call or WhatsApp them (last 7 days)
 *   In cart now   signed-in shoppers with this shop's items in their cart,
 *                 active in the last 24 hours — anonymous
 *   Left in cart  the same, inactive 1 to 30 days — anonymous
 *
 * Dense, in the Transactions page's pattern. The product photos are the one
 * rich thing on the screen; everything else is quiet. `?lead=` keeps the
 * chosen kind in the URL, `?dates=` (leadDates.ts) the date filter, which
 * "Not paid" and "Left in cart" have. The filter resets when the kind
 * changes; the other tabs' counts are their default windows.
 */

const KINDS: { key: LeadKind; label: string; about: string }[] = [
  {
    key: 'PAYMENT_PENDING',
    label: 'Not paid',
    about:
      'Started paying online but did not finish. The order stays open for 1 hour, so they can still pay. You can call or WhatsApp them for 7 days.',
  },
  {
    key: 'ACTIVE',
    label: 'In cart now',
    about: 'Signed-in shoppers with your items in their cart in the last 24 hours. Their name and phone stay private.',
  },
  {
    key: 'ABANDONED',
    label: 'Left in cart',
    about: 'Signed-in shoppers who left your items in their cart 1 to 30 days ago. Their name and phone stay private.',
  },
]

const EMPTY: Record<LeadKind, { title: string; description: string }> = {
  PAYMENT_PENDING: {
    title: 'No unpaid checkouts',
    description: 'When a shopper starts paying online but does not finish, they show here.',
  },
  ACTIVE: {
    title: 'No one has your items in their cart right now',
    description: 'Signed-in shoppers who add your items show here for 24 hours.',
  },
  ABANDONED: {
    title: 'No carts left behind',
    description: 'Carts with your items that were left for more than a day show here.',
  },
}

/**
 * The pill on an unpaid checkout. "Paying now" was wrong most of the time —
 * the server can't tell an open payment page from a closed tab, only that
 * the payment window (`closesAt`, 60 min) is still open. So: "Payment open"
 * with the minutes left, then "Not paid" once the server has closed it.
 * Past `closesAt` the server closes it on its next run (up to ~10 min), so
 * the pill says "closing" meanwhile instead of a negative count.
 */
function paymentPill(lead: PaymentLead, now: number): { label: string; tone: StatusTone } {
  if (lead.state === 'EXPIRED' || !lead.closesAt) return { label: 'Not paid', tone: 'neutral' }
  const left = Math.ceil((new Date(lead.closesAt).getTime() - now) / 60_000)
  if (lead.state === 'FAILED') {
    return { label: left > 0 ? `Payment failed · ${left} min to retry` : 'Payment failed · closing', tone: 'danger' }
  }
  return { label: left > 0 ? `Payment open · ${left} min left` : 'Payment open · closing', tone: 'pending' }
}

/** A clock for the minutes-left pills; ticks only while one is on screen. */
function useMinuteClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function isKind(value: string | null): value is LeadKind {
  return KINDS.some((k) => k.key === value)
}

export function LeadsPanel() {
  const { store } = useManagedStore()
  const [params, setParams] = useSearchParams()
  const leadParam = params.get('lead')
  const kind: LeadKind = isKind(leadParam) ? leadParam : 'PAYMENT_PENDING'
  const dates = readDates(params, kind)
  // Presets start at local midnight, so this string is stable all day.
  const rangeKey = hasDateFilter(kind) ? JSON.stringify(toApiRange(dates)) : '{}'

  const [data, setData] = useState<StoreLeads | null>(null)
  const [rows, setRows] = useState<StoreLeads['rows'] | null>(null)
  const [counts, setCounts] = useState<StoreLeads['counts'] | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    setRows(null)
    setError(null)
    storeLeadsApi
      .list(store.id, kind, 1, JSON.parse(rangeKey))
      .then((result) => {
        if (requestSeq.current !== seq) return
        setData(result)
        setRows(result.rows)
        setCounts(result.counts)
      })
      .catch((err: unknown) => {
        if (requestSeq.current === seq) setError(toApiError(err).message)
      })
  }, [store.id, kind, rangeKey, reload])

  const loadMore = async () => {
    const meta = data?.meta
    if (!meta || meta.page >= meta.totalPages || loadingMore) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const next = await storeLeadsApi.list(store.id, kind, meta.page + 1, JSON.parse(rangeKey))
      if (requestSeq.current !== seq) return
      setRows((prev) => [...(prev ?? []), ...next.rows])
      setData(next)
    } catch (err) {
      if (requestSeq.current === seq) setError(toApiError(err).message)
    } finally {
      if (requestSeq.current === seq) setLoadingMore(false)
    }
  }

  const setKind = (next: LeadKind) => {
    setParams(
      (prev) => {
        // Each kind keeps different dates — start the new one on its default.
        const copy = clearDates(prev)
        if (next === 'PAYMENT_PENDING') copy.delete('lead')
        else copy.set('lead', next)
        return copy
      },
      { replace: true },
    )
  }

  const setDates = (next: LeadDates) => {
    setParams((prev) => writeDates(prev, kind, next), { replace: true })
  }

  const about = KINDS.find((k) => k.key === kind)!.about
  const empty = isDefaultDates(kind, dates)
    ? EMPTY[kind]
    : { title: 'Nothing in these dates', description: 'Try a longer date range.' }
  const meta = data?.meta
  const now = useMinuteClock(rows?.some((row) => row.kind === 'PAYMENT_PENDING' && row.closesAt !== null) ?? false)

  return (
    <div className="space-y-3">
      <KindSwitch value={kind} counts={counts} onChange={setKind} />
      {hasDateFilter(kind) && <LeadDateFilter kind={kind} value={dates} onChange={setDates} />}
      <p className="text-hint text-muted">{about}</p>

      {error && (
        <div className="space-y-2">
          <ErrorNote>{error}</ErrorNote>
          <Button variant="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {rows === null && !error && (
        <div aria-busy="true" aria-label="Loading leads" className="ws-card divide-y divide-line overflow-hidden rounded-lg">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[96px] animate-pulse bg-fg/3" />
          ))}
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="ws-card rounded-lg">
          <EmptyState icon={CartIcon} title={empty.title} description={empty.description} />
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg">
            {rows.map((row) => (
              <li key={row.id}>
                {row.kind === 'PAYMENT_PENDING' ? (
                  <PaymentLeadRow lead={row} storeName={store.name} now={now} />
                ) : (
                  <CartLeadRow lead={row} />
                )}
              </li>
            ))}
          </ul>
          {meta && meta.page < meta.totalPages && (
            <div className="flex justify-center">
              <Button variant="secondary" size="md" className="w-full sm:w-auto" loading={loadingMore} onClick={() => void loadMore()}>
                {`Show more (${meta.total - rows.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Unpaid checkout: who, amount, state, items — Call / WhatsApp. While the
 * order is still open the shopper can pay that same order, so the row says
 * so: it is the best moment to call. Call / WhatsApp only in the first 7
 * days (`canContact`, from the server) — later it feels like spam; older
 * rows are for looking back only.
 */
function PaymentLeadRow({ lead, storeName, now }: { lead: PaymentLead; storeName: string; now: number }) {
  const state = paymentPill(lead, now)
  const open = lead.closesAt !== null && lead.state !== 'EXPIRED'
  const phone = lead.customerPhone
  const hello = `Hello${lead.customerName ? ` ${lead.customerName}` : ''}, this is ${storeName}.`
  const message = open
    ? `${hello} Your order ${lead.orderNumber} is waiting for payment. Can I help you finish it?`
    : `${hello} Your order ${lead.orderNumber} was not paid. Can I help you finish it?`
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-fg">{lead.customerName ?? 'Customer'}</p>
        <p className="shrink-0 font-figure text-sm font-semibold tabular-nums text-fg">{money(lead.amount)}</p>
      </div>
      <p className="mt-0.5 truncate text-hint text-muted">
        {lead.orderNumber} · {timeAgo(lead.at)}
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
        {phone && <span className="min-w-0 truncate font-figure text-hint tabular-nums text-fg">{phone}</span>}
      </div>
      <Items items={lead.items} />
      {phone && open && (
        <p className="mt-2 text-hint text-muted">
          They can still pay. A quick call often helps.
        </p>
      )}
      {phone && !lead.canContact && (
        <p className="mt-2 text-hint text-muted">Over 7 days old, so Call and WhatsApp are off.</p>
      )}
      {phone && lead.canContact && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex">
          <a href={`tel:${phone}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <PhoneCallIcon className="h-4 w-4" />
            Call
          </a>
          <a
            href={`https://wa.me/${whatsAppNumber(phone)}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <ChatIcon className="h-4 w-4" />
            WhatsApp
          </a>
        </div>
      )}
    </div>
  )
}

/** A cart: anonymous — value, when active, what is in it. */
function CartLeadRow({ lead }: { lead: CartLead }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-fg">A shopper</p>
        <p className="shrink-0 font-figure text-sm font-semibold tabular-nums text-fg">{money(lead.value)}</p>
      </div>
      <p className="mt-0.5 truncate text-hint text-muted">
        Active {timeAgo(lead.at).toLowerCase()} · first added {formatOrderDate(lead.addedAt)}
      </p>
      <Items items={lead.items} />
    </div>
  )
}

/** Up to three product photos, then the item names in one line. */
function Items({ items }: { items: LeadItem[] }) {
  const shown = items.slice(0, 3)
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2.5">
      <div className="flex shrink-0 gap-1">
        {shown.map((item, index) =>
          item.imageUrl ? (
            <MediaImg
              key={index}
              src={item.imageUrl}
              sizes="36px"
              alt=""
              loading="lazy"
              decoding="async"
              className={`h-9 w-9 rounded-md border border-line object-cover ${item.available === false ? 'opacity-40' : ''}`}
            />
          ) : (
            <span key={index} className="flex h-9 w-9 items-center justify-center rounded-md bg-fg/5 text-muted">
              <BoxIcon className="h-4 w-4" />
            </span>
          ),
        )}
      </div>
      {/* Items that can't be bought now (sold out, hidden) are struck through. */}
      <p className="min-w-0 flex-1 truncate text-hint text-fg">
        {items.map((item, index) => (
          <span key={index}>
            {index > 0 && ', '}
            <span
              className={item.available === false ? 'text-muted line-through' : undefined}
              title={item.available === false ? 'Sold out or hidden now' : undefined}
            >
              {item.name}
              {item.quantity > 1 ? ` ×${item.quantity}` : ''}
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * Not paid · In cart now · Left in cart — the shared `SegmentedControl`
 * (rubber thumb: stretches on tap, can be dragged or flicked on a phone).
 * Each count is a small pill — tinted pending when unpaid checkouts are
 * waiting, the one count worth acting on.
 *
 * Phone: three equal cells across the width, the count under the label (a
 * label and a pill side by side do not fit a third of a phone). From sm: the
 * control sizes to its content with the count beside the label.
 */
function KindSwitch({
  value,
  counts,
  onChange,
}: {
  value: LeadKind
  counts: StoreLeads['counts'] | null
  onChange: (kind: LeadKind) => void
}) {
  return (
    <SegmentedControl
      label="Kind of lead"
      options={KINDS.map((k) => ({ value: k.key, label: k.label }))}
      value={value}
      onChange={onChange}
      className="w-full sm:w-fit"
      cellClassName="min-h-tap flex-col gap-1 px-1.5 py-1.5 sm:min-h-9 sm:flex-row sm:gap-2 sm:px-3 sm:py-0"
      renderOption={(option, on) => {
        const count = counts?.[option.value]
        const alert = option.value === 'PAYMENT_PENDING' && (count ?? 0) > 0
        return (
          <>
            <span className={`text-xs leading-tight whitespace-nowrap sm:text-sm ${on ? 'font-semibold' : 'font-medium'}`}>
              {option.label}
            </span>
            <span
              className={`inline-grid h-5 min-w-5 place-items-center rounded-pill px-1.5 font-figure text-xs leading-none font-semibold tabular-nums ${
                alert ? 'bg-pending-soft text-pending' : on ? 'bg-surface/20 text-surface' : 'bg-fg/6 text-muted'
              }`}
            >
              {count === undefined ? '–' : count}
            </span>
          </>
        )
      }}
    />
  )
}
