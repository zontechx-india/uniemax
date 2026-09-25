import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { shareOrCopy } from '../../../shared/share'
import { buttonClass } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { formatPrice, publicStoreUrl } from '../../features/stores/storesApi'
import type { Store, StoreDashboard } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  ChatIcon,
  CheckIcon,
  EyeIcon,
  GlobeIcon,
  ShareIcon,
} from '../../layout/icons'
import { SellerOrderRow } from './orderMeta'
import { SetupChecklist } from './SetupChecklist'
import { whatsAppShareUrl } from './StorePublishCard'

/**
 * Dashboard section of Store Management — the landing view: today's orders,
 * the order pipeline (Pending → Processing → Shipped → Completed +
 * Cancelled/Refunded), revenue, and the latest orders. Tiles and rows link
 * into the Orders section, where statuses are progressed.
 */

const PIPELINE: {
  key: keyof StoreDashboard['stats']
  label: string
  /** Deep link into the Orders section (relative to the manage layout). */
  to?: string
  hint?: string
}[] = [
  { key: 'pending', label: 'Pending Orders', to: 'orders?status=PENDING' },
  // Processing spans two statuses (Confirmed + Packed) — link to the full
  // list rather than pretending one status covers it.
  { key: 'processing', label: 'Processing', to: 'orders' },
  { key: 'shipped', label: 'Shipped', to: 'orders?status=SHIPPED' },
  { key: 'completed', label: 'Completed', to: 'orders?status=DELIVERED' },
  { key: 'cancelled', label: 'Cancelled', to: 'orders?status=CANCELLED' },
  { key: 'refunded', label: 'Refunded', hint: 'via cancelled paid orders' },
]

export function StoreDashboardPage() {
  // The layout owns this data — it also feeds the Orders badge in the nav, and
  // keeping it there means re-entering this section is instant instead of
  // re-fetching (see ManagedStoreContext).
  const {
    store,
    onStoreChange,
    dashboard,
    dashboardError: error,
    refreshDashboard,
  } = useManagedStore()

  // Snapshot at mount: with data already in hand we are RE-entering the
  // section, so pull a fresh copy. Empty means the layout's own initial load
  // is already in flight — asking again would just duplicate it.
  const reEntered = useRef(dashboard !== null)
  // Once a LIVE store has orders, they are the daily job: the optional
  // online-payments setup moves below them. (Unpublished, "get live" leads.)
  const setupBelow =
    store.isPublished && (dashboard?.stats.totalOrders ?? 0) > 0
  useEffect(() => {
    if (reEntered.current) refreshDashboard()
  }, [refreshDashboard])

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Dashboard
      </h2>
      <p className="mt-1 text-sm text-muted">
        How {store.name} is doing — orders land here the moment customers
        place them.
      </p>

      {/* Above the numbers on purpose: until the store is live there are no
          numbers to read, and this is the only thing worth doing. */}
      <div className="mt-5 space-y-5">
        {store.isPublished && dashboard?.stats.totalOrders === 0 && (
          <FirstOrderCard store={store} />
        )}
        {!setupBelow && (
          <SetupChecklist store={store} onStoreChange={onStoreChange} />
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {dashboard === null && !error && (
        <p className="py-16 text-center text-sm text-muted">
          Loading your dashboard…
        </p>
      )}

      {/* Nine tiles reading 0 teach a new seller nothing — the numbers
          appear with the first order. */}
      {dashboard && dashboard.stats.totalOrders > 0 && (
        <div className="mt-5 space-y-5">
          {/* Headline tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Same selected treatment as the section nav: brand left edge
                over the Light-Purple tint, ink label, in both schemes. */}
            <div className="rounded-lg border-l-[3px] border-brand bg-brand-soft p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg">
                Today's Orders
              </p>
              <p className="mt-1 text-3xl font-bold text-fg">
                {dashboard.stats.today}
              </p>
            </div>
            <div className="rounded-lg border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Total Orders
              </p>
              <p className="mt-1 text-3xl font-bold text-fg">
                {dashboard.stats.totalOrders}
              </p>
            </div>
            <div className="col-span-2 rounded-lg border border-line p-4 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Revenue
              </p>
              <p className="mt-1 text-3xl font-bold text-fg">
                {formatPrice(dashboard.stats.revenue)}
              </p>
            </div>
          </div>

          {/* Order pipeline */}
          <div>
            <h3 className="font-body text-sm font-semibold uppercase tracking-wide text-muted">
              Order pipeline
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PIPELINE.map(({ key, label, to, hint }) =>
                to ? (
                  <Link
                    key={key}
                    to={to}
                    className="rounded-lg border border-line p-3.5 transition hover:bg-surface-alt"
                  >
                    <p className="text-xs font-semibold text-muted">{label}</p>
                    <p className="mt-0.5 text-2xl font-bold text-fg">
                      {dashboard.stats[key]}
                    </p>
                  </Link>
                ) : (
                  <div key={key} className="rounded-lg border border-line p-3.5">
                    <p className="text-xs font-semibold text-muted">{label}</p>
                    <p className="mt-0.5 text-2xl font-bold text-fg">
                      {dashboard.stats[key]}
                    </p>
                    {hint && (
                      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Latest orders */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-body text-sm font-semibold uppercase tracking-wide text-muted">
                Latest orders
              </h3>
              <Link
                to="orders"
                className="text-xs font-semibold text-brand hover:underline"
              >
                View all orders →
              </Link>
            </div>
            {dashboard.recentOrders.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {dashboard.recentOrders.map((order) => (
                  <li key={order.id}>
                    <SellerOrderRow order={order} to={`orders/${order.id}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {setupBelow && (
            <SetupChecklist store={store} onStoreChange={onStoreChange} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The moment after publishing, until the first order: the store is live, so
 * the one useful thing left is getting the link in front of customers. This
 * replaces an empty stats grid, and leads with WhatsApp — how most small
 * sellers here reach their buyers.
 */
function FirstOrderCard({ store }: { store: Store }) {
  const url = publicStoreUrl(store.slug)
  const [copied, setCopied] = useState(false)

  const share = async () => {
    if ((await shareOrCopy({ title: store.name, url })) === 'copied') {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section className="rounded-lg border border-success/40 bg-success/5 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-base font-semibold text-fg">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        Your store is live
      </p>
      <p className="mt-1 text-sm text-muted">
        Share your link to get your first order — it will show up here the
        moment it&apos;s placed.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg transition hover:bg-surface-alt"
      >
        <GlobeIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
      </a>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={whatsAppShareUrl(store.name, url)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ size: 'sm' })}
        >
          <ChatIcon className="h-3.5 w-3.5" />
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void share()}
          className={buttonClass({ variant: 'ring', size: 'sm' })}
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ShareIcon className="h-3.5 w-3.5" />}
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({ variant: 'ring', size: 'sm' })}
        >
          <EyeIcon className="h-3.5 w-3.5" />
          View store
        </a>
      </div>
    </section>
  )
}
