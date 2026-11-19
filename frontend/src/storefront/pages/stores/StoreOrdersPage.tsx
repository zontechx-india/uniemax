import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import type { ListMeta } from '../../../shared/auth/http'
import { buttonClass } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { sellerOrderApi } from '../../features/stores/storesApi'
import type {
  OrderStatus,
  SellerOrderSummary,
  StoreDashboard,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { CartIcon, SearchIcon } from '../../layout/icons'
import { ORDER_STATUS_META, SellerOrderRow } from './orderMeta'
import { LeadsPanel } from './orders/LeadsPanel'
import { EmptyState } from './ui/EmptyState'
import { PageHeader } from './ui/PageHeader'

/**
 * Orders section of Store Management — every order of the store, newest
 * first, filterable by lifecycle status (chips, deep-linkable via ?status=
 * so the dashboard can jump straight to a slice) and searchable by order
 * number / customer name / phone. Server-paginated with Load More; a card
 * opens the order's detail page where the status actions live.
 *
 * The status chips are 44px pills in one sideways-scrolling row (a fade on
 * the right says there are more), carrying the counts the layout's
 * dashboard fetch already knows — "Waiting 3" is the number a seller opens
 * this page for.
 */

const PAGE_SIZE = 20

/**
 * The statuses a seller can filter by. AWAITING_PAYMENT is left out: the API
 * hides unpaid online orders from the seller and rejects it as a filter —
 * those checkouts are under Leads → Not paid instead.
 */
type SellerStatus = Exclude<OrderStatus, 'AWAITING_PAYMENT'>
const SELLER_STATUSES = (Object.keys(ORDER_STATUS_META) as OrderStatus[]).filter(
  (key): key is SellerStatus => key !== 'AWAITING_PAYMENT',
)

const STATUS_TABS: { key: SellerStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  ...SELLER_STATUSES.map((key) => ({ key, label: ORDER_STATUS_META[key].label })),
]

/** Counts the dashboard already has. Confirmed + Packed share one counter there. */
function countFor(
  key: OrderStatus | 'ALL',
  stats: StoreDashboard['stats'] | undefined,
): number | null {
  if (!stats) return null
  switch (key) {
    case 'ALL':
      return stats.totalOrders
    case 'PENDING':
      return stats.pending
    case 'SHIPPED':
      return stats.shipped
    case 'DELIVERED':
      return stats.completed
    case 'CANCELLED':
      return stats.cancelled
    default:
      return null
  }
}

/** An old `?status=AWAITING_PAYMENT` link falls back to All, never a 400. */
function isSellerStatus(value: string | null): value is SellerStatus {
  return SELLER_STATUSES.some((key) => key === value)
}

export function StoreOrdersPage() {
  const { store, dashboard } = useManagedStore()
  const [params, setParams] = useSearchParams()
  // Orders | Leads (?tab=leads) — Leads lists people who nearly bought.
  const leadsTab = params.get('tab') === 'leads'
  const statusParam = params.get('status')
  const status: SellerStatus | 'ALL' = isSellerStatus(statusParam)
    ? statusParam
    : 'ALL'

  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // debounced
  const [orders, setOrders] = useState<SellerOrderSummary[] | null>(null)
  const [meta, setMeta] = useState<ListMeta | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Out-of-order responses (fast typing, tab hopping) must never win.
  const requestSeq = useRef(0)

  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 350)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    if (leadsTab) return
    const seq = ++requestSeq.current
    setOrders(null)
    setMeta(null)
    setError(null)
    sellerOrderApi
      .list(store.id, {
        status: status === 'ALL' ? undefined : status,
        q: q || undefined,
        page: 1,
        pageSize: PAGE_SIZE,
      })
      .then(({ items, meta }) => {
        if (requestSeq.current !== seq) return
        setOrders(items)
        setMeta(meta)
      })
      .catch((err) => {
        if (requestSeq.current !== seq) return
        setError(toApiError(err).message)
      })
  }, [store.id, status, q, leadsTab])

  const loadMore = async () => {
    if (!meta || meta.page >= meta.totalPages || loadingMore) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const next = await sellerOrderApi.list(store.id, {
        status: status === 'ALL' ? undefined : status,
        q: q || undefined,
        page: meta.page + 1,
        pageSize: PAGE_SIZE,
      })
      if (requestSeq.current !== seq) return
      setOrders((prev) => [...(prev ?? []), ...next.items])
      setMeta(next.meta)
    } catch (err) {
      if (requestSeq.current === seq) setError(toApiError(err).message)
    } finally {
      if (requestSeq.current === seq) setLoadingMore(false)
    }
  }

  const setStatus = (next: SellerStatus | 'ALL') => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === 'ALL') copy.delete('status')
        else copy.set('status', next)
        return copy
      },
      { replace: true },
    )
  }

  const filtered = q !== '' || status !== 'ALL'

  const header = (
    <>
      <PageHeader
        icon={CartIcon}
        title="Orders"
        description="New orders show here. Open one to confirm it, then mark it packed and sent."
      />
      <OrdersTabs leads={leadsTab} />
    </>
  )

  if (leadsTab) {
    return (
      <div className="space-y-4">
        {header}
        <LeadsPanel />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {header}

      {/* Status chips — one row that scrolls sideways on a phone. */}
      <div className="-mx-4 [mask-image:linear-gradient(to_right,#000_88%,transparent)] sm:mx-0 sm:[mask-image:none]">
        <div
          role="group"
          aria-label="Show orders"
          className="flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:px-0"
        >
          {STATUS_TABS.map(({ key, label }) => {
            const on = status === key
            const count = countFor(key, dashboard?.stats)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setStatus(key)}
                className={`inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition ${
                  on
                    ? 'border-brand bg-brand text-brand-contrast'
                    : 'border-line bg-surface/70 text-fg hover:border-brand/50'
                }`}
              >
                {label}
                {count !== null && count > 0 && (
                  <span
                    className={`rounded-pill px-1.5 text-xs font-bold ${
                      on ? 'bg-brand-contrast/20' : key === 'PENDING' ? 'bg-pending text-brand-contrast' : 'bg-fg/8 text-muted'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">Search orders</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or order number"
          className="h-field w-full rounded-xl border border-line bg-input pr-4 pl-11 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      {orders === null && !error && (
        <div aria-busy="true" aria-label="Loading orders" className="space-y-2">
          {[0, 1, 2].map((key) => (
            <div key={key} className="ws-card h-[88px] animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {orders !== null && orders.length === 0 && (
        <div className="ws-card rounded-lg">
          <EmptyState
            icon={CartIcon}
            title={filtered ? 'No orders here' : 'No orders yet'}
            description={
              filtered
                ? 'Try another status, or search for a different name or number.'
                : 'Share your shop link. Orders show up here the moment customers place them.'
            }
          />
        </div>
      )}

      {orders !== null && orders.length > 0 && (
        <>
          <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg">
            {orders.map((order) => (
              <li key={order.id}>
                <SellerOrderRow order={order} to={order.id} />
              </li>
            ))}
          </ul>

          {meta && meta.page < meta.totalPages && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className={buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full sm:w-auto' })}
              >
                {loadingMore
                  ? 'Loading…'
                  : `Show more orders (${meta.total - orders.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Orders | Leads — underline tabs (ADMIN_UI_THEME §7.5 `tabs`), links so the
 * tab is in the URL and Back works. Switching drops the other tab's filters.
 */
function OrdersTabs({ leads }: { leads: boolean }) {
  // Phone: two halves of the width, so each tab is a full-width thumb target.
  // From sm: content-width tabs, left-aligned, as in the console.
  const tab = (on: boolean) =>
    `-mb-px inline-flex min-h-tap flex-1 items-center justify-center border-b-2 px-3 text-sm transition-colors sm:flex-none ${
      on ? 'border-brand font-semibold text-fg' : 'border-transparent font-medium text-muted hover:text-fg'
    }`
  return (
    <nav aria-label="Orders and leads" className="flex gap-1 border-b border-line sm:gap-2">
      <Link to={{ search: '' }} replace aria-current={leads ? undefined : 'page'} className={tab(!leads)}>
        Orders
      </Link>
      <Link to={{ search: '?tab=leads' }} replace aria-current={leads ? 'page' : undefined} className={tab(leads)}>
        Leads
      </Link>
    </nav>
  )
}
