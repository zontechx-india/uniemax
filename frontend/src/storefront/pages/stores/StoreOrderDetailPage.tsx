import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import {
  formatPrice,
  sellerOrderApi,
} from '../../features/stores/storesApi'
import type { PlacedOrder } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ArrowLeftIcon, BoxIcon, MapPinIcon, UserIcon } from '../../layout/icons'
import {
  OrderStatusChip,
  formatOrderDateTime,
  paymentLabel,
} from './orderMeta'

/**
 * One order of the store — the seller's working view. Shows the items,
 * customer/delivery snapshot, payment summary and a lifecycle timeline, and
 * carries the STATUS ACTIONS: the next forward step (Confirm → Pack → Ship →
 * Deliver; pickup orders go Packed → Delivered, skipping Shipped) plus
 * Cancel while the order hasn't shipped. Every action confirms first —
 * status changes are visible to the customer immediately.
 */

/** The one action that moves this order forward, per status + fulfilment. */
function nextAction(
  order: PlacedOrder,
): { status: 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED'; label: string; description: string } | null {
  switch (order.status) {
    case 'PENDING':
      return {
        status: 'CONFIRMED',
        label: 'Confirm Order',
        description:
          'Accept this order and start processing it. The customer will see it as Confirmed.',
      }
    case 'CONFIRMED':
      return {
        status: 'PACKED',
        label: 'Mark as Packed',
        description:
          order.fulfilment === 'PICKUP'
            ? 'The items are packed and ready for pickup.'
            : 'The items are packed and ready to ship.',
      }
    case 'PACKED':
      return order.fulfilment === 'PICKUP'
        ? {
            status: 'DELIVERED',
            label: 'Mark as Delivered',
            description:
              'The customer has picked up the order. A cash-on-delivery order is marked paid.',
          }
        : {
            status: 'SHIPPED',
            label: 'Mark as Shipped',
            description: 'The order has been handed to the courier.',
          }
    case 'SHIPPED':
      return {
        status: 'DELIVERED',
        label: 'Mark as Delivered',
        description:
          'The order reached the customer. A cash-on-delivery order is marked paid.',
      }
    default:
      return null
  }
}

const CANCELLABLE = new Set(['PENDING', 'CONFIRMED', 'PACKED'])

export function StoreOrderDetailPage() {
  // `refreshDashboard` keeps the nav's pending-order badge (and the dashboard
  // tiles) honest the moment this page moves an order along.
  const { store, refreshDashboard } = useManagedStore()
  const { orderId = '' } = useParams()

  const [order, setOrder] = useState<PlacedOrder | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<'advance' | 'cancel' | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    let cancelled = false
    setOrder(null)
    setLoadError(null)
    sellerOrderApi
      .get(store.id, orderId)
      .then((data) => {
        if (!cancelled) setOrder(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [store.id, orderId])

  const action = order ? nextAction(order) : null

  const advance = async () => {
    if (!order || !action) return
    setBusy(true)
    setActionError(null)
    try {
      setOrder(await sellerOrderApi.updateStatus(store.id, order.id, action.status))
      setConfirming(null)
      refreshDashboard()
    } catch (err) {
      setActionError(toApiError(err).message)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!order) return
    setBusy(true)
    setActionError(null)
    try {
      setOrder(
        await sellerOrderApi.cancel(
          store.id,
          order.id,
          cancelReason.trim() || null,
        ),
      )
      setConfirming(null)
      setCancelReason('')
      refreshDashboard()
    } catch (err) {
      setActionError(toApiError(err).message)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Link
        to=".."
        relative="path"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All orders
      </Link>

      {loadError && (
        <div className="mt-4">
          <ErrorNote>{loadError}</ErrorNote>
        </div>
      )}
      {order === null && !loadError && (
        <p className="py-16 text-center text-sm text-muted">Loading order…</p>
      )}

      {order && (
        <div className="mt-3 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
              {order.orderNumber}
            </h2>
            <OrderStatusChip status={order.status} />
            <span className="text-xs text-muted">
              Placed {formatOrderDateTime(order.placedAt)}
              {order.fulfilment === 'PICKUP' && <> · Store pickup</>}
            </span>
          </div>

          {actionError && <ErrorNote>{actionError}</ErrorNote>}

          {/* Actions */}
          {(action || CANCELLABLE.has(order.status)) && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-4">
              {action && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming('advance')}
                  className="rounded-md bg-brand-gradient px-5 py-2.5 text-sm font-bold text-brand-contrast transition hover:opacity-90 disabled:bg-none disabled:bg-line disabled:text-muted"
                >
                  {action.label}
                </button>
              )}
              {CANCELLABLE.has(order.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming('cancel')}
                  className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
                >
                  Cancel Order
                </button>
              )}
              {order.status === 'SHIPPED' && (
                <span className="text-xs text-muted">
                  A shipped order can no longer be cancelled.
                </span>
              )}
            </div>
          )}
          {order.status === 'CANCELLED' && (
            <InfoNote>
              This order was cancelled
              {order.cancelledAt && (
                <> on {formatOrderDateTime(order.cancelledAt)}</>
              )}
              {order.cancelReason && <> — “{order.cancelReason}”</>}. Its items
              were returned to stock.
            </InfoNote>
          )}

          <div className="items-start gap-5 space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:space-y-0">
            <div className="space-y-5">
              {/* Items */}
              <section className="rounded-lg border border-line">
                <h3 className="border-b border-line px-4 py-3 font-body text-sm font-semibold tracking-normal text-fg">
                  Items ({order.items.length})
                </h3>
                <ul className="divide-y divide-line px-4">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          loading="lazy"
                          decoding="async"
                          className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
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
                      <span className="shrink-0 text-sm font-bold text-fg">
                        {formatPrice(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="font-semibold text-fg">
                      {formatPrice(order.subtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Shipping</dt>
                    <dd className="text-muted">
                      {Number(order.shippingCharge) === 0
                        ? 'Free'
                        : formatPrice(order.shippingCharge)}
                      {order.shippingMethod && (
                        <span className="ml-1.5 text-xs">
                          · {order.shippingMethod}
                        </span>
                      )}
                    </dd>
                  </div>
                  {Number(order.tax) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Tax</dt>
                      <dd className="text-muted">{formatPrice(order.tax)}</dd>
                    </div>
                  )}
                  {Number(order.discount) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Discount</dt>
                      <dd className="text-success">
                        − {formatPrice(order.discount)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-line pt-1.5">
                    <dt className="font-semibold text-fg">Total</dt>
                    <dd className="font-bold text-fg">
                      {formatPrice(order.total)}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Customer + delivery snapshot */}
              <section className="rounded-lg border border-line p-4">
                <h3 className="flex items-center gap-2 font-body text-sm font-semibold tracking-normal text-fg">
                  <UserIcon className="h-4 w-4 text-muted" />
                  Customer
                </h3>
                <div className="mt-2 space-y-0.5 text-sm text-fg">
                  {order.customerName && <p>{order.customerName}</p>}
                  {order.customerPhone && (
                    <p>
                      <a
                        href={`tel:${order.customerPhone}`}
                        className="text-brand hover:underline"
                      >
                        {order.customerPhone}
                      </a>
                    </p>
                  )}
                  {order.customerEmail && (
                    <p className="text-muted">{order.customerEmail}</p>
                  )}
                  {!order.customerName &&
                    !order.customerPhone &&
                    !order.customerEmail && (
                      <p className="text-muted">
                        No contact details collected.
                      </p>
                    )}
                </div>

                <h3 className="mt-4 flex items-center gap-2 font-body text-sm font-semibold tracking-normal text-fg">
                  <MapPinIcon className="h-4 w-4 text-muted" />
                  {order.fulfilment === 'PICKUP' ? 'Fulfilment' : 'Delivery address'}
                </h3>
                <div className="mt-2 text-sm text-fg">
                  {order.fulfilment === 'PICKUP' ? (
                    <p className="text-muted">
                      Store pickup — the customer collects this order from
                      your business location.
                    </p>
                  ) : (
                    <p>
                      {[
                        order.addressLine,
                        order.state,
                        order.pincode,
                        order.country,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'No address collected.'}
                    </p>
                  )}
                </div>

                {order.billingAddress && (
                  <>
                    <h3 className="mt-4 flex items-center gap-2 font-body text-sm font-semibold tracking-normal text-fg">
                      <UserIcon className="h-4 w-4 text-muted" />
                      Billing address
                    </h3>
                    <div className="mt-2 text-sm text-fg">
                      <p>{order.billingAddress.name}</p>
                      <p>
                        {[
                          order.billingAddress.addressLine,
                          order.billingAddress.state,
                          order.billingAddress.pincode,
                          order.billingAddress.country,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                      {order.billingAddress.phone && (
                        <p className="text-muted">{order.billingAddress.phone}</p>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="space-y-5">
              {/* Payment */}
              <section className="rounded-lg border border-line p-4">
                <h3 className="font-body text-sm font-semibold tracking-normal text-fg">
                  Payment
                </h3>
                <p className="mt-2 text-sm font-semibold text-fg">
                  {paymentLabel(order.paymentMethod, order.paymentStatus)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {order.paymentMethod === 'ONLINE'
                    ? 'Online payment'
                    : 'Cash on delivery'}
                  {order.paymentRef === 'DEV-SIMULATED' && (
                    <> · simulated (development)</>
                  )}
                </p>
              </section>

              {/* Lifecycle timeline */}
              <section className="rounded-lg border border-line p-4">
                <h3 className="font-body text-sm font-semibold tracking-normal text-fg">
                  Timeline
                </h3>
                <ol className="mt-3 space-y-3">
                  <TimelineRow label="Placed" at={order.placedAt} />
                  {order.status === 'CANCELLED' ? (
                    <>
                      {order.confirmedAt && (
                        <TimelineRow label="Confirmed" at={order.confirmedAt} />
                      )}
                      {order.packedAt && (
                        <TimelineRow label="Packed" at={order.packedAt} />
                      )}
                      <TimelineRow label="Cancelled" at={order.cancelledAt} />
                    </>
                  ) : (
                    <>
                      <TimelineRow label="Confirmed" at={order.confirmedAt} />
                      <TimelineRow label="Packed" at={order.packedAt} />
                      {order.fulfilment === 'DELIVERY' && (
                        <TimelineRow label="Shipped" at={order.shippedAt} />
                      )}
                      <TimelineRow
                        label={
                          order.fulfilment === 'PICKUP'
                            ? 'Picked up'
                            : 'Delivered'
                        }
                        at={order.deliveredAt}
                      />
                    </>
                  )}
                </ol>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Advance confirmation */}
      <ConfirmDialog
        open={confirming === 'advance' && !!action}
        title={action?.label ?? ''}
        description={
          <>
            {action?.description}
            <span className="mt-1.5 block text-xs">
              Order {order?.orderNumber} — the customer sees status changes
              immediately.
            </span>
          </>
        }
        confirmLabel={action?.label}
        tone="neutral"
        busy={busy}
        onConfirm={() => void advance()}
        onCancel={() => setConfirming(null)}
      />

      {/* Cancel confirmation (optional reason) */}
      <ConfirmDialog
        open={confirming === 'cancel'}
        title="Cancel this order?"
        description={
          <>
            The items go back into stock and the customer sees the order as
            Cancelled
            {order?.paymentStatus === 'PAID' && (
              <> (its payment is marked refunded)</>
            )}
            . This cannot be undone.
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Reason (optional — e.g. out of stock)"
              className="mt-3 w-full rounded-md border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </>
        }
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        tone="danger"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

/** One timeline entry — filled dot + timestamp when reached, hollow ahead. */
function TimelineRow({ label, at }: { label: string; at: string | null }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
          at ? 'bg-brand' : 'border border-line bg-surface-alt'
        }`}
      />
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${at ? 'text-fg' : 'text-muted'}`}
        >
          {label}
        </p>
        {at && (
          <p className="text-xs text-muted">{formatOrderDateTime(at)}</p>
        )}
      </div>
    </li>
  )
}
