import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote } from '../../../shared/ui/form'
import { formatPrice } from '../../features/stores/storesApi'
import type { StoreDashboard } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { CartIcon, ChevronRightIcon } from '../../layout/icons'
import { OrderStatusChip, formatOrderDate, paymentLabel } from './orderMeta'

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
  const { store, dashboard, dashboardError: error, refreshDashboard } =
    useManagedStore()

  // Snapshot at mount: with data already in hand we are RE-entering the
  // section, so pull a fresh copy. Empty means the layout's own initial load
  // is already in flight — asking again would just duplicate it.
  const reEntered = useRef(dashboard !== null)
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

      {dashboard && (
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
            {dashboard.recentOrders.length === 0 ? (
              <div className="mt-2 flex flex-col items-center rounded-lg border border-line px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface-alt text-muted">
                  <CartIcon className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-fg">
                  No orders yet
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Share your store link — orders will show up here the moment
                  they're placed.
                </p>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {dashboard.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`orders/${order.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-surface-alt"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-fg">
                          {order.orderNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatOrderDate(order.placedAt)}
                          {order.customerName && <> · {order.customerName}</>} ·{' '}
                          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                          {order.fulfilment === 'PICKUP' && <> · Pickup</>}
                        </p>
                      </div>
                      <span className="rounded-pill bg-surface-alt px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                        {paymentLabel(order.paymentMethod, order.paymentStatus)}
                      </span>
                      <OrderStatusChip status={order.status} />
                      <span className="text-sm font-bold text-fg">
                        {formatPrice(order.total)}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
