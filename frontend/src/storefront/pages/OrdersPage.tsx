import { useEffect, useState } from 'react'
import { usePrivatePageTitle } from '../../shared/seo'
import { call, http, toApiError } from '../../shared/auth/http'
import { formatPrice, storeHomeUrl } from '../features/stores/storesApi'
import type { PlacedOrder } from '../features/stores/storesApi'
import { orderStatusCopy } from '../features/stores/orderStatus'
import { BoxIcon, CartIcon, ChevronRightIcon } from '../layout/icons'

/**
 * Orders (/orders) — the signed-in customer's order history, newest first.
 * Each order card shows the store, status/payment chips, its items with
 * thumbnails, and links to the store plus the shareable confirmation page.
 * (`/order/{slug}/{id}` lives in the anonymous public router, so those are
 * plain <a> links — crossing routers takes a full page load.)
 */

/** Chip colour per status tone; the words come from `orderStatusCopy`. */
const TONE_CLASS: Record<string, string> = {
  wait: 'bg-warning/10 text-warning',
  progress: 'bg-accent/10 text-accent',
  done: 'bg-success/10 text-success',
  stopped: 'bg-danger/10 text-danger',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function OrdersPage() {
  usePrivatePageTitle('My Orders')

  const [orders, setOrders] = useState<PlacedOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    call<PlacedOrder[]>(http.get('/api/v1/orders'))
      .then((rows) => {
        if (!cancelled) setOrders(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-body text-2xl font-semibold tracking-normal text-fg">
        My Orders
      </h1>
      <p className="mt-1 text-sm text-muted">
        Everything you've ordered across UnieMax stores, newest first.
      </p>

      <div className="mt-5 space-y-4">
        {orders === null && !error && (
          <p className="py-16 text-center text-sm text-muted">
            Loading your orders…
          </p>
        )}
        {error && (
          <p className="rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {orders !== null && orders.length === 0 && (
          <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-alt text-muted">
              <CartIcon className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-body text-lg font-semibold tracking-normal text-fg">
              No orders yet
            </h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted">
              When you place an order from any store, it will show up here.
            </p>
            <a
              href="/"
              className="mt-5 rounded-md bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
            >
              Explore stores
            </a>
          </div>
        )}

        {(orders ?? []).map((order) => {
          const status = orderStatusCopy(order)
          return (
            <section
              key={order.id}
              className="overflow-hidden rounded-lg border border-line bg-surface"
            >
              {/* Order header */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-5 py-3.5">
                <div className="min-w-0 basis-full [overflow-wrap:anywhere] sm:flex-1 sm:basis-auto">
                  {/* The shop and the date are what a buyer recognises; the
                      order number is for quoting to the seller. */}
                  <p className="text-sm font-bold text-fg">
                    <a
                      href={storeHomeUrl(order.storeSlug)}
                      className="hover:text-brand hover:underline"
                    >
                      {order.storeName}
                    </a>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(order.placedAt)} · Order {order.orderNumber}
                  </p>
                </div>
                <span
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASS[status.tone]}`}
                >
                  {status.label}
                </span>
                <span className="rounded-pill bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-muted">
                  {order.paymentMethod === 'ONLINE'
                    ? order.paymentStatus === 'PAID'
                      ? 'Paid online'
                      : 'Online payment pending'
                    : order.status === 'DELIVERED'
                      ? 'Paid on delivery'
                      : order.status === 'CANCELLED'
                        ? 'Nothing to pay'
                        : 'Pay on delivery'}
                </span>
                <span className="text-sm font-bold text-fg">
                  {formatPrice(order.total)}
                </span>
              </div>

              {/* Items */}
              <ul className="divide-y divide-line px-5">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        loading="lazy"
                        decoding="async"
                        className="h-11 w-11 shrink-0 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
                        <BoxIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {item.productName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {item.variantName && (
                          <span className="mr-2 rounded-sm bg-surface-alt px-1.5 py-0.5 font-semibold">
                            {item.variantName}
                          </span>
                        )}
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-fg">
                      {formatPrice(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Footer actions */}
              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <span className="text-xs text-muted">
                  {order.fulfilment === 'PICKUP'
                    ? 'Store pickup'
                    : order.addressLine
                      ? `Deliver to: ${order.addressLine}`
                      : 'Delivery'}
                </span>
                <a
                  href={`/order/${order.storeSlug}/${order.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline"
                >
                  Track order
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
