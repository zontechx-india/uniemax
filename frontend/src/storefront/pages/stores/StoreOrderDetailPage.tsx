import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { copyToClipboard } from '../../../shared/share'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { formatPrice, sellerOrderApi } from '../../features/stores/storesApi'
import type { PlacedOrder } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  ArrowLeftIcon,
  BoxIcon,
  ChatIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  MapPinIcon,
  PhoneCallIcon,
  UserIcon,
} from '../../layout/icons'
import { OrderStatusChip, formatOrderDateTime, paymentLabel, timeAgo } from './orderMeta'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { MediaImg } from '../../../shared/media/MediaImg'
import { GlassCard } from './ui/GlassCard'
import { RowMenu } from './ui/RowMenu'
import { showToast } from './ui/Toast'

/**
 * One order of the store — the seller's working view.
 *
 * Top to bottom on a phone: the order (who, how much, how paid, its status),
 * the CUSTOMER with big **Call** and **WhatsApp** buttons and the address
 * with **Copy address** (for the courier slip), the items, then the
 * timeline as a stepper. The ONE next step — Confirm order → Mark as
 * packed → Mark as sent → Mark as delivered (pickup orders: Packed →
 * Picked up) — sits in a sticky bar at the bottom of the screen, so it is
 * under the thumb wherever the seller has scrolled. Cancel lives in that
 * bar's "⋯" menu, away from the main button. Every status change confirms
 * first — the customer sees it immediately.
 */

/** The one action that moves this order forward, per status + fulfilment. */
function nextAction(
  order: PlacedOrder,
): { status: 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED'; label: string; description: string } | null {
  switch (order.status) {
    case 'PENDING':
      return {
        status: 'CONFIRMED',
        label: 'Confirm order',
        description:
          'Say yes to this order. The customer will see that you have accepted it.',
      }
    case 'CONFIRMED':
      return {
        status: 'PACKED',
        label: 'Mark as packed',
        description:
          order.fulfilment === 'PICKUP'
            ? 'The items are packed and ready for the customer to collect.'
            : 'The items are packed and ready to send.',
      }
    case 'PACKED':
      return order.fulfilment === 'PICKUP'
        ? {
            status: 'DELIVERED',
            label: 'Mark as picked up',
            description:
              'The customer has collected the order. A cash-on-delivery order is marked paid.',
          }
        : {
            status: 'SHIPPED',
            label: 'Mark as sent',
            description: 'You have handed the order to the courier or delivery person.',
          }
    case 'SHIPPED':
      return {
        status: 'DELIVERED',
        label: 'Mark as delivered',
        description:
          'The order reached the customer. A cash-on-delivery order is marked paid.',
      }
    default:
      return null
  }
}

const CANCELLABLE = new Set(['PENDING', 'CONFIRMED', 'PACKED'])

/** wa.me wants digits with the country code; a bare 10-digit number is Indian. */
function whatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

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
      showToast('Order updated')
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
      showToast('Order cancelled')
    } catch (err) {
      setActionError(toApiError(err).message)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  const address = order
    ? [order.addressLine, order.state, order.pincode, order.country].filter(Boolean).join(', ')
    : ''

  const copyAddress = async () => {
    if (!order) return
    const text = [order.customerName, address, order.customerPhone].filter(Boolean).join('\n')
    try {
      await copyToClipboard(text)
      showToast('Address copied')
    } catch {
      showToast('Could not copy — hold the address to copy it', 'danger')
    }
  }

  const cancellable = order ? CANCELLABLE.has(order.status) : false

  return (
    <div className="space-y-4">
      <Link
        to=".."
        relative="path"
        className="-ml-2 inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
      >
        <ArrowLeftIcon className="h-5 w-5" />
        All orders
      </Link>

      {loadError && <ErrorNote>{loadError}</ErrorNote>}
      {order === null && !loadError && (
        <div aria-busy="true" aria-label="Loading order" className="space-y-3">
          <div className="glass-card h-32 animate-pulse rounded-glass" />
          <div className="glass-card h-48 animate-pulse rounded-glass" />
        </div>
      )}

      {order && (
        <>
          {/* The order at a glance */}
          <section className="glass-tint rounded-glass p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusChip status={order.status} />
              <span className="text-hint text-muted">
                {timeAgo(order.placedAt)} · {formatOrderDateTime(order.placedAt)}
              </span>
            </div>
            <h2 className="mt-2 font-figure text-[26px] leading-tight font-bold text-fg">
              {formatPrice(order.total)}
            </h2>
            <p className="mt-0.5 text-[15px] text-fg">
              {order.items.length} item{order.items.length === 1 ? '' : 's'} ·{' '}
              <span className="font-semibold">{paymentLabel(order.paymentMethod, order.paymentStatus)}</span>
              {order.fulfilment === 'PICKUP' && <> · Customer collects</>}
            </p>
            <p className="mt-0.5 text-hint text-muted">
              Order {order.orderNumber}
              {order.paymentRef === 'DEV-SIMULATED' && <> · simulated payment (development)</>}
            </p>
          </section>

          {actionError && <ErrorNote>{actionError}</ErrorNote>}

          {order.status === 'CANCELLED' && (
            <InfoNote>
              This order was cancelled
              {order.cancelledByCustomer && <> by the customer</>}
              {order.cancelledAt && <> on {formatOrderDateTime(order.cancelledAt)}</>}
              {order.cancelReason && <> — “{order.cancelReason}”</>}. Its items
              were put back in stock.
            </InfoNote>
          )}

          <div className="items-start gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:space-y-0">
            <div className="space-y-4">
              {/* Customer — first, because a seller's next move is usually to call. */}
              <GlassCard icon={UserIcon} title={order.customerName ?? 'Customer'}>
                <div className="space-y-3">
                  {(order.customerPhone || order.customerEmail) && (
                    <p className="text-[15px] text-fg">
                      {order.customerPhone}
                      {order.customerEmail && (
                        <span className="block text-hint text-muted">{order.customerEmail}</span>
                      )}
                    </p>
                  )}
                  {order.customerPhone ? (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${order.customerPhone}`}
                        className={buttonClass({ variant: 'ring', size: 'lg', full: true })}
                      >
                        <PhoneCallIcon className="h-5 w-5" />
                        Call
                      </a>
                      <a
                        href={`https://wa.me/${whatsAppNumber(order.customerPhone)}?text=${encodeURIComponent(
                          `Hello${order.customerName ? ` ${order.customerName}` : ''}, this is ${store.name} about your order ${order.orderNumber}.`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp text-[15px] font-bold text-whatsapp-contrast transition hover:opacity-90"
                      >
                        <ChatIcon className="h-5 w-5" />
                        WhatsApp
                      </a>
                    </div>
                  ) : (
                    !order.customerEmail && (
                      <p className="text-hint text-muted">No contact details were given.</p>
                    )
                  )}

                  <div className="border-t border-line pt-3">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
                      <MapPinIcon className="h-4 w-4 text-muted" />
                      {order.fulfilment === 'PICKUP' ? 'Customer collects' : 'Send to'}
                    </p>
                    {order.fulfilment === 'PICKUP' ? (
                      <p className="mt-1 text-[15px] text-muted">
                        The customer comes to your shop to collect this order.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-[15px] leading-relaxed text-fg">
                          {address || 'No address was given.'}
                        </p>
                        {address && (
                          <button
                            type="button"
                            onClick={() => void copyAddress()}
                            className={buttonClass({ variant: 'ring', size: 'md', className: 'mt-2.5' })}
                          >
                            <ClipboardIcon className="h-4 w-4" />
                            Copy address
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {order.billingAddress && (
                    <div className="border-t border-line pt-3">
                      <p className="text-[14px] font-semibold text-fg">Bill to</p>
                      <p className="mt-1 text-[15px] text-fg">{order.billingAddress.name}</p>
                      <p className="text-hint text-muted">
                        {[
                          order.billingAddress.addressLine,
                          order.billingAddress.state,
                          order.billingAddress.pincode,
                          order.billingAddress.country,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        {order.billingAddress.phone && <> · {order.billingAddress.phone}</>}
                      </p>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Items */}
              <GlassCard
                icon={BoxIcon}
                title={`What they ordered (${order.items.length})`}
                padded={false}
              >
                <ul className="divide-y divide-line px-4 sm:px-5">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      {item.imageUrl ? (
                        <MediaImg
                          sizes="56px"
                          src={item.imageUrl}
                          alt={item.productName}
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-14 shrink-0 rounded-xl border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-fg/5 text-muted">
                          <BoxIcon className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug font-semibold break-words text-fg">
                          {item.productName}
                        </p>
                        {item.variantName && (
                          <p className="mt-0.5 text-hint font-semibold text-brand">{item.variantName}</p>
                        )}
                        <p className="mt-0.5 text-hint text-muted">
                          <span className="font-semibold text-fg">{item.quantity}</span> ×{' '}
                          {formatPrice(item.unitPrice)}
                          {item.sku && <> · Code {item.sku}</>}
                        </p>
                      </div>
                      <span className="shrink-0 text-[15px] font-bold text-fg">
                        {formatPrice(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1.5 border-t border-line px-4 py-3 text-[15px] sm:px-5">
                  <Line label="Items" value={formatPrice(order.subtotal)} />
                  <Line
                    label="Delivery"
                    value={
                      <>
                        {Number(order.shippingCharge) === 0 ? 'Free' : formatPrice(order.shippingCharge)}
                        {order.shippingMethod && (
                          <span className="ml-1.5 text-hint text-muted">· {order.shippingMethod}</span>
                        )}
                      </>
                    }
                  />
                  {Number(order.tax) > 0 && <Line label="Tax" value={formatPrice(order.tax)} />}
                  {Number(order.discount) > 0 && (
                    <Line label="Discount" value={<span className="text-success">− {formatPrice(order.discount)}</span>} />
                  )}
                  <div className="flex justify-between border-t border-line pt-2">
                    <dt className="font-bold text-fg">Total</dt>
                    <dd className="font-bold text-fg">{formatPrice(order.total)}</dd>
                  </div>
                </dl>
              </GlassCard>
            </div>

            {/* Timeline */}
            <GlassCard title="What has happened">
              <ol>
                <TimelineRow label="Order placed" at={order.placedAt} />
                {order.status === 'CANCELLED' ? (
                  <>
                    {order.confirmedAt && <TimelineRow label="Confirmed" at={order.confirmedAt} />}
                    {order.packedAt && <TimelineRow label="Packed" at={order.packedAt} />}
                    <TimelineRow label="Cancelled" at={order.cancelledAt} cancelled last />
                  </>
                ) : (
                  <>
                    <TimelineRow label="Confirmed" at={order.confirmedAt} />
                    <TimelineRow label="Packed" at={order.packedAt} />
                    {order.fulfilment === 'DELIVERY' && (
                      <TimelineRow label="Sent" at={order.shippedAt} />
                    )}
                    <TimelineRow
                      label={order.fulfilment === 'PICKUP' ? 'Picked up' : 'Delivered'}
                      at={order.deliveredAt}
                      last
                    />
                  </>
                )}
              </ol>
            </GlassCard>
          </div>

          {/* The ONE next step, under the thumb. Sticky, not fixed: it lives
              inside the glass panel, and rises above the phone tab bar. */}
          {(action || cancellable) && (
            <div className="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
              <div className="glass-strong flex items-center gap-2 rounded-glass p-2 sm:p-3">
                {action ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="sheen"
                    disabled={busy}
                    onClick={() => setConfirming('advance')}
                    className="min-w-0 flex-1 text-[15px]"
                  >
                    <CheckIcon className="h-5 w-5" />
                    {action.label}
                  </Button>
                ) : (
                  <p className="min-w-0 flex-1 px-2 text-hint text-muted">
                    Waiting for the order to be delivered.
                  </p>
                )}
                {cancellable && (
                  <RowMenu
                    title={`Order ${order.orderNumber}`}
                    actions={[
                      {
                        label: 'Cancel this order',
                        icon: CloseIcon,
                        note: 'Items go back in stock. The customer is told.',
                        danger: true,
                        onSelect: () => setConfirming('cancel'),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          )}
          {order.status === 'SHIPPED' && (
            <p className="text-hint text-muted">A sent order can no longer be cancelled.</p>
          )}
        </>
      )}

      {/* Advance confirmation */}
      <ConfirmDialog
        open={confirming === 'advance' && !!action}
        title={`${action?.label ?? ''}?`}
        description={
          <>
            {action?.description}
            <span className="mt-1.5 block text-hint">
              Order {order?.orderNumber} — the customer sees this straight away.
            </span>
          </>
        }
        confirmLabel={action ? `Yes, ${action.label.toLowerCase()}` : 'Yes'}
        // "Cancel" next to "Confirm order" reads as "cancel the order".
        cancelLabel="Go back"
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
            {order?.paymentStatus === 'PAID' && <> (its payment is marked refunded)</>}
            . This cannot be undone.
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Why? The customer will see this (optional) — e.g. out of stock"
              className="mt-3 w-full rounded-md border border-line bg-input px-3 py-2.5 text-[15px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </>
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        tone="danger"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-fg">{value}</dd>
    </div>
  )
}

/** One timeline step — a stepper circle on a line; ticked with its time once reached. */
function TimelineRow({
  label,
  at,
  cancelled = false,
  last = false,
}: {
  label: string
  at: string | null
  cancelled?: boolean
  last?: boolean
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className={`absolute top-8 bottom-0 left-[13px] w-0.5 rounded-full ${at ? 'bg-success/50' : 'bg-fg/10'}`}
        />
      )}
      <span
        aria-hidden
        className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          at
            ? cancelled
              ? 'bg-fg/20 text-fg'
              : 'bg-success text-brand-contrast'
            : 'glass-inset'
        }`}
      >
        {at && (cancelled ? <CloseIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />)}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`text-[15px] font-semibold ${at ? 'text-fg' : 'text-muted'}`}>{label}</p>
        <p className="text-hint text-muted">{at ? formatOrderDateTime(at) : 'Not yet'}</p>
      </div>
    </li>
  )
}
