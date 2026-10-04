import { Link } from 'react-router-dom'
import { formatPrice } from '../../features/stores/storesApi'
import type { OrderStatus, SellerOrderSummary } from '../../features/stores/storesApi'
import { ChevronRightIcon } from '../../layout/icons'

/**
 * Presentation of the order lifecycle, shared by the seller's Dashboard,
 * Orders list and Order detail so a status always looks the same everywhere.
 */

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; chip: string }
> = {
  PENDING: { label: 'Pending', chip: 'bg-warning/10 text-warning' },
  CONFIRMED: { label: 'Confirmed', chip: 'bg-accent/10 text-accent' },
  PACKED: { label: 'Packed', chip: 'bg-accent/10 text-accent' },
  SHIPPED: { label: 'Shipped', chip: 'bg-brand/10 text-brand' },
  DELIVERED: { label: 'Delivered', chip: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Cancelled', chip: 'bg-surface-alt text-muted' },
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.PENDING
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-pill px-2.5 text-[12px] font-semibold ${meta.chip}`}
    >
      {meta.label}
    </span>
  )
}

/**
 * "Just now", "25 min ago", "3 h ago", "Yesterday", then the date. How long
 * an order has waited is what a seller acts on; the calendar date is not.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'Yesterday'
  return formatOrderDate(iso)
}

/** One line summarizing how (and whether) the order is paid. */
export function paymentLabel(
  method: 'ONLINE' | 'COD',
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED',
): string {
  if (status === 'REFUNDED') return 'Refunded'
  if (status === 'FAILED') return 'Payment failed'
  if (method === 'ONLINE') {
    return status === 'PAID' ? 'Paid online' : 'Payment pending'
  }
  return status === 'PAID' ? 'Paid · COD' : 'Cash on Delivery'
}

export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatOrderDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * One order in a seller list (Orders section, Dashboard "Latest orders"):
 * WHO ordered and the amount lead, in the largest type; then how long ago,
 * how many items and how it is paid; the status on the right. The whole row
 * is one big tap target. On a phone the chips drop under the text so the
 * name never shrinks to a column one word wide.
 */
export function SellerOrderRow({ order, to }: { order: SellerOrderSummary; to: string }) {
  const total = formatPrice(order.total)
  return (
    <Link
      to={to}
      className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition hover:bg-fg/5 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[15px] font-bold text-fg">
            {order.customerName ?? order.orderNumber}
          </p>
          <span className="shrink-0 text-[15px] font-bold text-fg">{total}</span>
        </div>
        <p className="mt-0.5 text-hint text-muted">
          {timeAgo(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
          {order.fulfilment === 'PICKUP' && <> · Pickup</>}
          {order.customerName && <> · {order.orderNumber}</>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OrderStatusChip status={order.status} />
          <span className="inline-flex h-6 items-center rounded-pill bg-fg/6 px-2.5 text-[12px] font-semibold text-muted">
            {paymentLabel(order.paymentMethod, order.paymentStatus)}
          </span>
        </div>
      </div>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  )
}
