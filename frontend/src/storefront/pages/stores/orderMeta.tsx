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
      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}
    >
      {meta.label}
    </span>
  )
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
 * One order in a seller list (Orders section, Dashboard "Latest orders").
 * One line from `sm`; on a phone the number and total lead, details under
 * them and the chips below — squeezed into one row, the details collapsed
 * into a column one word wide.
 */
export function SellerOrderRow({ order, to }: { order: SellerOrderSummary; to: string }) {
  const total = formatPrice(order.total)
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-alt"
    >
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-bold text-fg">{order.orderNumber}</p>
            <span className="shrink-0 text-sm font-bold text-fg sm:hidden">{total}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formatOrderDate(order.placedAt)}
            {order.customerName && <> · {order.customerName}</>} ·{' '}
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
            {order.fulfilment === 'PICKUP' && <> · Pickup</>}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:gap-4">
          <span className="rounded-pill bg-surface-alt px-2.5 py-0.5 text-[11px] font-semibold text-muted">
            {paymentLabel(order.paymentMethod, order.paymentStatus)}
          </span>
          <OrderStatusChip status={order.status} />
          <span className="hidden text-sm font-bold text-fg sm:inline">{total}</span>
        </div>
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  )
}
