import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { OrderDetail } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { Card, CardHeader, Chip, Detail, ErrorState, PageHeader, Skeleton } from '../ui/primitives'
import { OrderStatusChip, PaymentChip } from '../ui/statusMeta'
import { formatDateTime, formatMoneyExact } from '../ui/format'
import { BackIcon } from '../layout/icons'

/**
 * One order, everything known about it — the page a support conversation is
 * answered from.
 *
 * Read-only: the seller moves an order along (they hold the stock), and a
 * platform admin overriding that would leave the seller's dashboard lying.
 * What the console adds is the joins the seller can't see — the customer
 * account behind the order and the gateway reference behind the payment.
 */

/** The lifecycle, drawn from the order's own timestamps. */
function Timeline({ order }: { order: OrderDetail }) {
  const stages: { label: string; at: string | null }[] = [
    { label: 'Placed', at: order.placedAt },
    { label: 'Confirmed', at: order.confirmedAt },
    { label: 'Packed', at: order.packedAt },
    // A pickup order never ships — the stage is skipped, not pending.
    ...(order.fulfilment === 'PICKUP' ? [] : [{ label: 'Shipped', at: order.shippedAt }]),
    { label: order.fulfilment === 'PICKUP' ? 'Picked up' : 'Delivered', at: order.deliveredAt },
    ...(order.cancelledAt ? [{ label: 'Cancelled', at: order.cancelledAt }] : []),
  ]

  return (
    <ol className="space-y-3">
      {stages.map((stage) => {
        const done = stage.at !== null
        const cancelled = stage.label === 'Cancelled'
        return (
          <li key={stage.label} className="flex gap-3">
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill ${
                cancelled ? 'bg-danger' : done ? 'bg-success' : 'bg-line'
              }`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className={`text-sm ${done ? 'font-medium text-fg' : 'text-muted'}`}>
                {stage.label}
              </p>
              <p className="text-xs text-muted">
                {done ? formatDateTime(stage.at) : 'Not reached'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function OrderDetailPage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const { data: order, loading, error, refresh } = useAdminQuery(
    () => adminApi.getOrder(orderId),
    [orderId],
  )

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!order || loading) return <Skeleton rows={10} />

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        Back
      </button>

      <PageHeader
        title={order.orderNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusChip status={order.status} />
            <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />
            <span>Placed {formatDateTime(order.placedAt)}</span>
          </span>
        }
      />

      {order.cancelReason ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <span className="font-medium text-fg">Cancelled by the seller:</span>{' '}
          <span className="text-muted">{order.cancelReason}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`Items (${order.itemCount})`} />
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-md bg-surface-alt" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{item.productName}</p>
                    {item.variantName ? (
                      <Chip className="mt-1">{item.variantName}</Chip>
                    ) : null}
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted">
                      {item.quantity} × {formatMoneyExact(item.unitPrice)}
                    </p>
                    <p className="font-medium text-fg">{formatMoneyExact(item.lineTotal)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="mt-3">
              <Detail label="Subtotal">{formatMoneyExact(order.subtotal)}</Detail>
              <Detail label="Shipping">
                {formatMoneyExact(order.shippingCharge)}
                {order.shippingMethod ? (
                  <span className="text-muted"> · {order.shippingMethod}</span>
                ) : null}
              </Detail>
              {Number(order.tax) > 0 ? (
                <Detail label="Tax">{formatMoneyExact(order.tax)}</Detail>
              ) : null}
              {Number(order.discount) > 0 ? (
                <Detail label="Discount">− {formatMoneyExact(order.discount)}</Detail>
              ) : null}
              <Detail label="Total">
                <span className="text-base">{formatMoneyExact(order.total)}</span>
              </Detail>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title={order.fulfilment === 'PICKUP' ? 'Pickup & contact' : 'Delivery & contact'}
            />
            <dl>
              <Detail label="Name">{order.customerName ?? '—'}</Detail>
              <Detail label="Phone">
                {order.customerPhone ? (
                  <a href={`tel:${order.customerPhone}`} className="text-accent hover:underline">
                    {order.customerPhone}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Email">{order.customerEmail ?? '—'}</Detail>
              {order.fulfilment === 'DELIVERY' ? (
                <>
                  <Detail label="Address">{order.addressLine ?? '—'}</Detail>
                  <Detail label="Pincode">{order.pincode ?? '—'}</Detail>
                  <Detail label="State">
                    {[order.state, order.country].filter(Boolean).join(', ') || '—'}
                  </Detail>
                  {order.billingAddress ? (
                    <Detail label="Billing address">
                      {[
                        order.billingAddress.name,
                        order.billingAddress.addressLine,
                        order.billingAddress.pincode,
                        order.billingAddress.state,
                        order.billingAddress.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Detail>
                  ) : null}
                </>
              ) : (
                <Detail label="Fulfilment">Customer collects from the store</Detail>
              )}
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Store" />
            <p className="font-medium text-fg">{order.storeName}</p>
            {order.store ? (
              <Link
                to={`/stores/${order.store.id}`}
                className="mt-1 inline-block text-sm text-accent hover:underline"
              >
                Open store
              </Link>
            ) : (
              <p className="mt-1 text-sm text-muted">This store has since been deleted.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Customer account" />
            {order.customer ? (
              <>
                <p className="font-medium text-fg">{order.customer.name ?? 'Unnamed'}</p>
                <p className="text-sm text-muted">{order.customer.email}</p>
                <Link
                  to={`/customers/${order.customer.id}`}
                  className="mt-1 inline-block text-sm text-accent hover:underline"
                >
                  Open account
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted">No account is linked to this order.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <dl>
              <Detail label="Method">
                {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
              </Detail>
              <Detail label="Status">
                <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />
              </Detail>
              <Detail label="Reference">
                {order.paymentRef ? (
                  <span className="font-mono text-xs">{order.paymentRef}</span>
                ) : (
                  '—'
                )}
              </Detail>
              {order.cfOrderId ? (
                <Detail label="Gateway order">
                  <span className="font-mono text-xs">{order.cfOrderId}</span>
                </Detail>
              ) : null}
            </dl>
            {order.paymentRef === 'DEV-SIMULATED' ? (
              <p className="mt-2 text-xs text-warning">
                Simulated in a development build — no real money moved.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <Timeline order={order} />
          </Card>
        </div>
      </div>
    </>
  )
}
