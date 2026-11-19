import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ErrorNote } from '../../../../shared/ui/form'
import { storeLeadsApi } from '../../../features/stores/storesApi'
import type { CartLead, LeadItem, LeadKind, PaymentLead, StoreLeads } from '../../../features/stores/storesApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { BoxIcon, CartIcon, ChatIcon, PhoneCallIcon } from '../../../layout/icons'
import { formatOrderDate, timeAgo, whatsAppNumber } from '../orderMeta'
import { EmptyState } from '../ui/EmptyState'
import { StatusPill } from '../ui/StatusPill'
import type { StatusTone } from '../ui/StatusPill'
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
 * chosen kind in the URL.
 */

const KINDS: { key: LeadKind; label: string; about: string }[] = [
  {
    key: 'PAYMENT_PENDING',
    label: 'Not paid',
    about: 'Started paying online but did not finish. They gave you their details at checkout. Shown for 7 days.',
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

const PAYMENT_STATE: Record<PaymentLead['state'], { label: string; tone: StatusTone }> = {
  PAYING: { label: 'Paying now', tone: 'pending' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  EXPIRED: { label: 'Not paid', tone: 'neutral' },
}

function isKind(value: string | null): value is LeadKind {
  return KINDS.some((k) => k.key === value)
}

export function LeadsPanel() {
  const { store } = useManagedStore()
  const [params, setParams] = useSearchParams()
  const leadParam = params.get('lead')
  const kind: LeadKind = isKind(leadParam) ? leadParam : 'PAYMENT_PENDING'

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
      .list(store.id, kind, 1)
      .then((result) => {
        if (requestSeq.current !== seq) return
        setData(result)
        setRows(result.rows)
        setCounts(result.counts)
      })
      .catch((err: unknown) => {
        if (requestSeq.current === seq) setError(toApiError(err).message)
      })
  }, [store.id, kind, reload])

  const loadMore = async () => {
    const meta = data?.meta
    if (!meta || meta.page >= meta.totalPages || loadingMore) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const next = await storeLeadsApi.list(store.id, kind, meta.page + 1)
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
        const copy = new URLSearchParams(prev)
        if (next === 'PAYMENT_PENDING') copy.delete('lead')
        else copy.set('lead', next)
        return copy
      },
      { replace: true },
    )
  }

  const about = KINDS.find((k) => k.key === kind)!.about
  const meta = data?.meta

  return (
    <div className="space-y-3">
      <KindSwitch value={kind} counts={counts} onChange={setKind} />
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
          <EmptyState icon={CartIcon} title={EMPTY[kind].title} description={EMPTY[kind].description} />
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg">
            {rows.map((row) => (
              <li key={row.id}>
                {row.kind === 'PAYMENT_PENDING' ? (
                  <PaymentLeadRow lead={row} storeName={store.name} />
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

/** Unpaid checkout: who, amount, state, items — Call / WhatsApp. */
function PaymentLeadRow({ lead, storeName }: { lead: PaymentLead; storeName: string }) {
  const state = PAYMENT_STATE[lead.state]
  const phone = lead.customerPhone
  const message = `Hello${lead.customerName ? ` ${lead.customerName}` : ''}, this is ${storeName}. Your order ${lead.orderNumber} was not paid. Can I help you finish it?`
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
      {phone && (
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
 * Not paid · In cart now · Left in cart — a segmented switch with counts
 * (the Transactions page's native-radio pattern). Three equal cells; the
 * count sits under the label so the cells stay narrow on a phone.
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
  const name = useId()
  return (
    <div role="radiogroup" aria-label="Kind of lead" className="grid grid-cols-3 gap-1 rounded-md border border-line bg-input p-1 sm:max-w-md">
      {KINDS.map((k) => {
        const on = k.key === value
        const count = counts?.[k.key]
        return (
          <label
            key={k.key}
            className={`flex min-h-tap cursor-pointer flex-col items-center justify-center rounded-sm px-2 py-1 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
              on ? 'bg-brand-soft text-brand' : 'text-muted hover:text-fg'
            }`}
          >
            <input type="radio" name={name} value={k.key} checked={on} onChange={() => onChange(k.key)} className="sr-only" />
            <span className="text-sm font-medium leading-tight">{k.label}</span>
            <span className={`font-figure text-hint tabular-nums ${on ? 'text-brand' : 'text-muted'}`}>
              {count === undefined ? '–' : count}
            </span>
          </label>
        )
      })}
    </div>
  )
}
