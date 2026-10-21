import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { copyToClipboard } from '../../../shared/share'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { formatPrice, sellerOrderApi } from '../../features/stores/storesApi'
import type {
  OrderShipment,
  PlacedOrder,
  ShipmentTrackingInput,
} from '../../features/stores/storesApi'
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
  ReturnIcon,
  TruckIcon,
  UserIcon,
} from '../../layout/icons'
import { OrderStatusChip, formatOrderDateTime, paymentLabel, timeAgo } from './orderMeta'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { MediaImg } from '../../../shared/media/MediaImg'
import { DeliveredDialog } from './orders/DeliveredDialog'
import type { PickedPhoto } from './orders/DeliveredDialog'
import { ParcelCard } from './orders/ParcelCard'
import { ShipDialog } from './orders/ShipDialog'
import { SupplierParts } from '../../../packages/dropship'
import { GlassCard } from './ui/GlassCard'
import { RowMenu } from './ui/RowMenu'
import type { RowMenuAction } from './ui/RowMenu'
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

/** Which courier sheet is open — sending, adding tracking, sending again, or correcting. */
type ShipSheet =
  | { kind: 'send' | 'add' | 'again' }
  | { kind: 'edit'; parcel: OrderShipment }

const SHIP_SHEET_COPY: Record<ShipSheet['kind'], { title: string; submit: string; done: string }> = {
  send: { title: 'Mark as sent', submit: 'Mark as sent', done: 'Order sent' },
  add: { title: 'Add tracking', submit: 'Save tracking', done: 'Tracking saved' },
  again: { title: 'Send it again', submit: 'Send again', done: 'Order sent again' },
  edit: { title: 'Edit tracking', submit: 'Save tracking', done: 'Tracking updated' },
}

const onTheWay = (parcel: OrderShipment) => !parcel.deliveredAt && !parcel.returnedAt

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
  const [confirming, setConfirming] = useState<'advance' | 'cancel' | 'returned' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  // Cancelling after a parcel came back asks whether those items go back in
  // stock — no answer is assumed.
  const [restockAnswer, setRestockAnswer] = useState<boolean | null>(null)
  const [shipSheet, setShipSheet] = useState<ShipSheet | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)

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

  const parcels = order?.shipments ?? []
  // The store acts on its OWN parcels; another party's move on their side.
  const openParcels = parcels.filter((p) => onTheWay(p) && p.source === 'SELLER')
  const cameBackIds = new Set(parcels.filter((p) => p.returnedAt).map((p) => p.id))
  // Lines another party ships (a package's tag) — the store never sends or
  // delivers them; the order moves on as their parcels do.
  const hasTagged = !!order?.items.some((item) => item.fulfilledBy)
  const ownUnsent =
    order?.items.filter(
      (item) =>
        !item.fulfilledBy && (item.shipmentId === null || cameBackIds.has(item.shipmentId)),
    ).length ?? 0
  const baseAction = order ? nextAction(order) : null
  const action =
    hasTagged &&
    baseAction &&
    ((baseAction.status === 'SHIPPED' && ownUnsent === 0) ||
      (baseAction.status === 'DELIVERED' && openParcels.length === 0))
      ? null
      : baseAction
  const allBack = parcels.length > 0 && cameBackIds.size === parcels.length
  const hasReturnedItems = !!order?.items.some(
    (item) => item.shipmentId !== null && cameBackIds.has(item.shipmentId),
  )
  // A sent order whose every parcel came back is sent again (or cancelled).
  const sendAgain = order?.status === 'SHIPPED' && allBack

  /** The sticky button: sending and delivering a delivery order open their sheets. */
  const primary = () => {
    if (!order || !action) return
    setSheetError(null)
    if (order.fulfilment === 'DELIVERY' && action.status === 'SHIPPED') {
      setShipSheet({ kind: 'send' })
    } else if (order.fulfilment === 'DELIVERY' && action.status === 'DELIVERED' && openParcels.length > 0) {
      setDelivering(true)
    } else {
      setConfirming('advance')
    }
  }

  const submitShip = async (input: ShipmentTrackingInput) => {
    if (!order || !shipSheet) return
    setBusy(true)
    setSheetError(null)
    try {
      const updated =
        shipSheet.kind === 'edit'
          ? await sellerOrderApi.updateTracking(store.id, order.id, shipSheet.parcel.id, input)
          : await sellerOrderApi.ship(store.id, order.id, input)
      setOrder(updated)
      showToast(SHIP_SHEET_COPY[shipSheet.kind].done)
      setShipSheet(null)
      refreshDashboard()
    } catch (err) {
      setSheetError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const submitDelivered = async (photo: PickedPhoto | null) => {
    const parcel = openParcels[0]
    if (!order || !parcel) return
    setBusy(true)
    setSheetError(null)
    setUploadProgress(photo ? 0 : null)
    try {
      setOrder(
        await sellerOrderApi.markDelivered(store.id, order.id, parcel.id, photo, setUploadProgress),
      )
      setDelivering(false)
      refreshDashboard()
      showToast('Order delivered')
    } catch (err) {
      setSheetError(toApiError(err).message)
    } finally {
      setBusy(false)
      setUploadProgress(null)
    }
  }

  const markCameBack = async () => {
    const parcel = openParcels[0]
    if (!order || !parcel) return
    setBusy(true)
    setActionError(null)
    try {
      setOrder(await sellerOrderApi.markReturned(store.id, order.id, parcel.id))
      setConfirming(null)
      showToast('Marked as came back')
    } catch (err) {
      setActionError(toApiError(err).message)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

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
          hasReturnedItems ? (restockAnswer ?? undefined) : undefined,
        ),
      )
      setConfirming(null)
      setCancelReason('')
      setRestockAnswer(null)
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

  const cancellable = order
    ? CANCELLABLE.has(order.status) || (order.status === 'SHIPPED' && allBack)
    : false

  const menuActions: RowMenuAction[] = []
  if (openParcels.length > 0) {
    menuActions.push({
      label: 'Parcel came back',
      icon: ReturnIcon,
      note: 'The courier returned it. Then send it again or cancel.',
      onSelect: () => setConfirming('returned'),
    })
  }
  if (cancellable) {
    menuActions.push({
      label: 'Cancel this order',
      icon: CloseIcon,
      note: hasReturnedItems
        ? 'You choose whether the returned items go back in stock.'
        : 'Items go back in stock. The customer is told.',
      danger: true,
      onSelect: () => {
        setRestockAnswer(null)
        setConfirming('cancel')
      },
    })
  }
  const showParcels =
    !!order &&
    order.fulfilment === 'DELIVERY' &&
    (parcels.length > 0 || order.status === 'SHIPPED')
  const keptOutOfStock =
    !!order &&
    order.status === 'CANCELLED' &&
    cameBackIds.size > 0 &&
    parcels.every((p) => !p.returnedAt || !p.restocked)

  return (
    <div className="space-y-4">
      <Link
        to=".."
        relative="path"
        className="-ml-2 inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-base font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
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
            <h2 className="mt-2 font-figure text-3xl leading-tight font-bold text-fg">
              {formatPrice(order.total)}
            </h2>
            <p className="mt-0.5 text-base text-fg">
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
              {order.cancelReason && <> — “{order.cancelReason}”</>}.{' '}
              {keptOutOfStock
                ? 'The items that came back were kept out of stock.'
                : 'Its items were put back in stock.'}
            </InfoNote>
          )}

          <div className="items-start gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:space-y-0">
            <div className="space-y-4">
              {/* Customer — first, because a seller's next move is usually to call. */}
              <GlassCard icon={UserIcon} title={order.customerName ?? 'Customer'}>
                <div className="space-y-3">
                  {(order.customerPhone || order.customerEmail) && (
                    <p className="text-base text-fg">
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
                        className={buttonClass({ variant: 'secondary', size: 'lg', full: true })}
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
                        className="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp text-base font-bold text-whatsapp-contrast transition hover:opacity-90"
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
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <MapPinIcon className="h-4 w-4 text-muted" />
                      {order.fulfilment === 'PICKUP' ? 'Customer collects' : 'Send to'}
                    </p>
                    {order.fulfilment === 'PICKUP' ? (
                      <p className="mt-1 text-base text-muted">
                        The customer comes to your shop to collect this order.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-base leading-relaxed text-fg">
                          {address || 'No address was given.'}
                        </p>
                        {address && (
                          <button
                            type="button"
                            onClick={() => void copyAddress()}
                            className={buttonClass({ variant: 'secondary', size: 'md', className: 'mt-2.5' })}
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
                      <p className="text-sm font-semibold text-fg">Bill to</p>
                      <p className="mt-1 text-base text-fg">{order.billingAddress.name}</p>
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

              {/* Parcel — courier, tracking, delivered / came back */}
              {showParcels && (
                <ParcelCard
                  order={order}
                  onEdit={(parcel) => {
                    setSheetError(null)
                    setShipSheet({ kind: 'edit', parcel })
                  }}
                  onAddTracking={() => {
                    setSheetError(null)
                    setShipSheet({ kind: 'add' })
                  }}
                />
              )}

              {/* Parts another party ships (a supplier): status, parcel, earnings, problems */}
              {hasTagged && (
                <SupplierParts
                  storeId={store.id}
                  orderId={order.id}
                  onCancelOrder={() => {
                    setActionError(null)
                    setConfirming('cancel')
                  }}
                  onChanged={() => {
                    void sellerOrderApi.get(store.id, order.id).then(setOrder).catch(() => {})
                  }}
                />
              )}

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
                        <p className="text-base leading-snug font-semibold break-words text-fg">
                          {item.productName}
                        </p>
                        {item.variantName && (
                          <p className="mt-0.5 text-hint font-semibold text-brand">{item.variantName}</p>
                        )}
                        {item.fulfilledBy && (
                          <p className="mt-0.5 text-hint text-muted">
                            {shippedByLabel(parcels.find((p) => p.id === item.shipmentId))}
                          </p>
                        )}
                        <p className="mt-0.5 text-hint text-muted">
                          <span className="font-semibold text-fg">{item.quantity}</span> ×{' '}
                          {formatPrice(item.unitPrice)}
                          {item.sku && <> · Code {item.sku}</>}
                        </p>
                      </div>
                      <span className="shrink-0 text-base font-bold text-fg">
                        {formatPrice(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1.5 border-t border-line px-4 py-3 text-base sm:px-5">
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
                    {order.shippedAt && <TimelineRow label="Sent" at={order.shippedAt} note={sentNote(parcels)} />}
                    {cameBackAt(parcels) && <TimelineRow label="Came back" at={cameBackAt(parcels)} />}
                    <TimelineRow label="Cancelled" at={order.cancelledAt} cancelled last />
                  </>
                ) : (
                  <>
                    <TimelineRow label="Confirmed" at={order.confirmedAt} />
                    <TimelineRow label="Packed" at={order.packedAt} />
                    {order.fulfilment === 'DELIVERY' && (
                      <TimelineRow label="Sent" at={order.shippedAt} note={sentNote(parcels)} />
                    )}
                    {cameBackAt(parcels) && <TimelineRow label="Came back" at={cameBackAt(parcels)} />}
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
          {(action || sendAgain || menuActions.length > 0) && (
            <div className="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
              <div className="glass-strong flex items-center gap-2 rounded-glass p-2 sm:p-3">
                {sendAgain ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="primary"
                    disabled={busy}
                    onClick={() => {
                      setSheetError(null)
                      setShipSheet({ kind: 'again' })
                    }}
                    className="min-w-0 flex-1 text-base"
                  >
                    <TruckIcon className="h-5 w-5" />
                    Send again
                  </Button>
                ) : action ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="primary"
                    disabled={busy}
                    onClick={primary}
                    className="min-w-0 flex-1 text-base"
                  >
                    <CheckIcon className="h-5 w-5" />
                    {action.label}
                  </Button>
                ) : (
                  <p className="min-w-0 flex-1 px-2 text-hint text-muted">
                    {hasTagged
                      ? 'Waiting for the other parcels.'
                      : 'Waiting for the order to be delivered.'}
                  </p>
                )}
                {menuActions.length > 0 && (
                  <RowMenu title={`Order ${order.orderNumber}`} actions={menuActions} />
                )}
              </div>
            </div>
          )}
          {order.status === 'SHIPPED' && !allBack && (
            <p className="text-hint text-muted">
              {openParcels.length > 0
                ? 'A sent order can’t be cancelled while it is on its way. If the parcel comes back, choose “Parcel came back” in the ⋯ menu.'
                : 'A sent order can no longer be cancelled.'}
            </p>
          )}
          {sendAgain && (
            <p className="text-hint text-muted">
              The parcel came back. Send it again, or cancel the order from the ⋯ menu.
            </p>
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
            {hasReturnedItems ? 'The customer' : 'The items go back into stock and the customer'} sees
            the order as Cancelled
            {order?.paymentStatus === 'PAID' && <> (its payment is marked refunded)</>}
            . This cannot be undone.
            {hasReturnedItems && (
              <fieldset className="mt-3">
                <legend className="text-sm font-semibold text-fg">
                  Put the items that came back into stock?
                </legend>
                <div className="mt-2 grid gap-2">
                  <RestockChoice
                    checked={restockAnswer === true}
                    onSelect={() => setRestockAnswer(true)}
                    title="Yes, put them back in stock"
                    note="They can be sold again."
                  />
                  <RestockChoice
                    checked={restockAnswer === false}
                    onSelect={() => setRestockAnswer(false)}
                    title="No, keep them out of stock"
                    note="For example, they came back damaged."
                  />
                </div>
              </fieldset>
            )}
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Why? The customer will see this (optional) — e.g. out of stock"
              className="mt-3 w-full rounded-md border border-line bg-input px-3 py-2.5 text-base text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </>
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        tone="danger"
        busy={busy}
        confirmDisabled={hasReturnedItems && restockAnswer === null}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(null)}
      />

      {/* The parcel came back undelivered */}
      <ConfirmDialog
        open={confirming === 'returned'}
        title="Did the parcel come back?"
        description={
          <>
            Use this when the courier returned it to you undelivered — a wrong
            address, or the customer refused it. Then send it again, or cancel
            the order.
          </>
        }
        confirmLabel="Yes, it came back"
        cancelLabel="Go back"
        tone="neutral"
        busy={busy}
        onConfirm={() => void markCameBack()}
        onCancel={() => setConfirming(null)}
      />

      {/* Courier + tracking: send, add tracking, send again, edit */}
      <ShipDialog
        open={shipSheet !== null}
        title={shipSheet ? SHIP_SHEET_COPY[shipSheet.kind].title : ''}
        submitLabel={shipSheet ? SHIP_SHEET_COPY[shipSheet.kind].submit : ''}
        parcel={shipSheet?.kind === 'edit' ? shipSheet.parcel : null}
        busy={busy}
        error={sheetError}
        onSubmit={(input) => void submitShip(input)}
        onClose={() => setShipSheet(null)}
      />

      {/* Delivered — optional proof photo */}
      <DeliveredDialog
        open={delivering}
        cod={order?.paymentMethod === 'COD' && order.paymentStatus === 'PENDING'}
        busy={busy}
        progress={uploadProgress}
        error={sheetError}
        onSubmit={(photo) => void submitDelivered(photo)}
        onClose={() => setDelivering(false)}
      />
    </div>
  )
}

/** Who ships a line another party fulfils — its parcel's sender, once sent. */
function shippedByLabel(parcel: OrderShipment | undefined): string {
  return parcel?.senderName ? `Shipped by ${parcel.senderName}` : 'Shipped separately'
}

/** "Delhivery · 2123456789012" for the timeline's Sent step. */
function sentNote(parcels: OrderShipment[]): string | undefined {
  const last = parcels[parcels.length - 1]
  if (!last) return undefined
  return last.trackingNumber ? `${last.carrier} · ${last.trackingNumber}` : last.carrier
}

/** When the latest parcel that came back did so. */
function cameBackAt(parcels: OrderShipment[]): string | null {
  const back = parcels.filter((p) => p.returnedAt).map((p) => p.returnedAt!)
  return back.length > 0 ? back[back.length - 1]! : null
}

/** One answer to the restock question — a radio drawn as a tappable card. */
function RestockChoice({
  checked,
  onSelect,
  title,
  note,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  note: string
}) {
  return (
    <label
      className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition ${
        checked ? 'border-brand bg-brand-soft' : 'border-line hover:bg-fg/5'
      }`}
    >
      <input
        type="radio"
        name="restock-returned"
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
      />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-hint text-muted">{note}</span>
      </span>
    </label>
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
  note,
  cancelled = false,
  last = false,
}: {
  label: string
  at: string | null
  /** One extra line once reached — the courier and tracking number for "Sent". */
  note?: string
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
        <p className={`text-base font-semibold ${at ? 'text-fg' : 'text-muted'}`}>{label}</p>
        <p className="text-hint text-muted">{at ? formatOrderDateTime(at) : 'Not yet'}</p>
        {at && note && <p className="text-hint break-words text-muted">{note}</p>}
      </div>
    </li>
  )
}
