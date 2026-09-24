import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { BarList, ChartFrame, Donut, TrendChart } from '../ui/charts'
import { StatTile } from '../ui/StatTile'
import { Card, CardHeader, Chip, ErrorState, PageHeader, Skeleton } from '../ui/primitives'
import { OrderStatusChip, PaymentChip } from '../ui/statusMeta'
import {
  formatCount,
  formatDayTick,
  formatMoney,
  formatMoneyShort,
  formatRelative,
} from '../ui/format'

/**
 * The platform dashboard — the answer to "how is UnieMax doing today", and
 * the jumping-off point for everything else.
 *
 * One request feeds the whole page (`GET /admin/dashboard`), so the tiles,
 * charts and lists are all consistent with each other — eight parallel
 * requests would let the tiles disagree with the chart beside them.
 *
 * Every counter is a LINK. A number an admin can't act on is trivia; the
 * pipeline bars, the low-stock rows and the order lines all land on the
 * page already filtered to what was clicked.
 */

const RANGES = [7, 30, 90] as const

export default function DashboardPage() {
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(30)
  const [measure, setMeasure] = useState<'revenue' | 'orders'>('revenue')

  const { data, loading, error, refresh } = useAdminQuery(() => adminApi.dashboard(days), [days])

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!data || loading) return <Skeleton rows={10} />

  const revenueSeries = data.series.map((point) => ({
    label: formatDayTick(point.date),
    value: Number(point.revenue),
  }))
  const orderSeries = data.series.map((point) => ({
    label: formatDayTick(point.date),
    value: point.orders,
  }))

  const pipeline = [
    { label: 'Pending', value: data.orderStatus.pending, status: 'PENDING' },
    { label: 'Confirmed', value: data.orderStatus.confirmed, status: 'CONFIRMED' },
    { label: 'Packed', value: data.orderStatus.packed, status: 'PACKED' },
    { label: 'Shipped', value: data.orderStatus.shipped, status: 'SHIPPED' },
    { label: 'Delivered', value: data.orderStatus.delivered, status: 'DELIVERED' },
    { label: 'Cancelled', value: data.orderStatus.cancelled, status: 'CANCELLED' },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Platform activity over the last ${days} days`}
        actions={
          <div className="flex rounded-md border border-line p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === range ? 'bg-brand text-brand-contrast' : 'text-muted hover:text-fg'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
        }
      />

      {/* Integration health — a missing key should be noticed here, not by a
          customer at checkout. */}
      {!data.integrations.paymentGateway || !data.integrations.push ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-fg">Setup incomplete:</span>
          {!data.integrations.paymentGateway ? (
            <Chip tone="warning">Payment gateway not configured</Chip>
          ) : null}
          {!data.integrations.push ? <Chip tone="warning">Push notifications off</Chip> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatMoney(data.totals.revenue)}
          hint="All time, excluding cancelled"
          trend={revenueSeries.map((point) => point.value)}
          series={1}
        />
        <StatTile
          label="Orders"
          value={formatCount(data.totals.orders)}
          hint={`${formatCount(data.today.orders)} today`}
          trend={orderSeries.map((point) => point.value)}
          series={2}
          to="/orders"
        />
        <StatTile
          label="Stores"
          value={formatCount(data.totals.stores)}
          hint={`${formatCount(data.totals.publishedStores)} published · ${formatCount(data.totals.draftStores)} draft`}
          to="/stores"
        />
        <StatTile
          label="Customers"
          value={formatCount(data.totals.customers)}
          hint={`${formatCount(data.totals.sellers)} sellers`}
          to="/customers"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartFrame
            title={measure === 'revenue' ? 'Revenue' : 'Orders'}
            subtitle={`Per day, last ${days} days`}
            actions={
              // Revenue and orders share no scale, so they are never plotted
              // together — this switches the single series instead.
              <div className="flex rounded-md border border-line p-0.5">
                {(['revenue', 'orders'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMeasure(option)}
                    className={`rounded-sm px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      measure === option ? 'bg-surface-alt text-fg' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            }
          >
            {measure === 'revenue' ? (
              <TrendChart points={revenueSeries} series={1} formatValue={formatMoney} />
            ) : (
              <TrendChart points={orderSeries} series={2} formatValue={formatCount} />
            )}
          </ChartFrame>
        </div>

        <ChartFrame
          title="Payment split"
          subtitle="Revenue by method, all time"
          footer={
            <p className="text-xs text-muted">
              {formatMoneyShort(data.payments.collected)} collected ·{' '}
              {formatCount(data.payments.pending)} awaiting payment ·{' '}
              {formatCount(data.payments.refunded)} refunded
            </p>
          }
        >
          <Donut
            slices={[
              {
                label: 'Online',
                value: Number(data.payments.onlineRevenue),
                color: 'var(--chart-1)',
              },
              {
                label: 'Cash on delivery',
                value: Number(data.payments.codRevenue),
                color: 'var(--chart-2)',
              },
            ]}
            // The slices are billed revenue (paid + awaiting payment), so the
            // centre must total the same thing — "collected" (paid only) lives
            // in the footer; showing it here made ₹3.1L sit over a ₹3.9L ring.
            centerLabel="billed"
            centerValue={formatMoneyShort(
              Number(data.payments.onlineRevenue) + Number(data.payments.codRevenue),
            )}
            formatValue={formatMoney}
          />
        </ChartFrame>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartFrame title="Order pipeline" subtitle="Every order, by stage">
          <BarList
            data={pipeline.map((stage) => ({
              label: stage.label,
              value: stage.value,
              // Cancelled is a reserved status meaning, not a series color.
              ...(stage.status === 'CANCELLED' ? { color: 'var(--danger)' } : {}),
              onClick: () => navigate(`/orders?status=${stage.status}`),
            }))}
          />
        </ChartFrame>

        <ChartFrame title="Top stores" subtitle={`By revenue, last ${days} days`}>
          <BarList
            data={data.topStores.map((store) => ({
              label: store.name,
              value: Number(store.revenue),
              color: 'var(--chart-1)',
              onClick: () => navigate(`/stores/${store.id}`),
            }))}
            formatValue={formatMoneyShort}
          />
        </ChartFrame>

        <ChartFrame title="Top products" subtitle={`By units sold, last ${days} days`}>
          <BarList
            data={data.topProducts.map((product) => ({
              label: `${product.name} · ${product.storeName}`,
              value: product.unitsSold,
            }))}
            formatValue={(value) => `${formatCount(value)} sold`}
          />
        </ChartFrame>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Latest orders"
              action={
                <Link to="/orders" className="text-sm text-accent hover:underline">
                  View all
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {data.recentOrders.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted">No orders yet.</li>
              ) : (
                data.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-3 transition-colors hover:bg-surface-alt"
                    >
                      <span className="font-medium text-fg">{order.orderNumber}</span>
                      <span className="truncate text-sm text-muted">{order.storeName}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <OrderStatusChip status={order.status} />
                        <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />
                        <span className="font-medium text-fg">{formatMoney(order.total)}</span>
                      </span>
                      <span className="w-full text-xs text-muted">
                        {order.customerName ?? 'Customer'} · {formatRelative(order.placedAt)}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Low stock" subtitle="5 or fewer left, live listings" />
          <ul className="divide-y divide-line">
            {data.lowStock.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted">Nothing running low.</li>
            ) : (
              data.lowStock.map((product) => (
                <li key={product.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{product.name}</p>
                    <p className="truncate text-xs text-muted">{product.storeName}</p>
                  </div>
                  <Chip tone={product.stockTotal === 0 ? 'danger' : 'warning'}>
                    {product.stockTotal === 0 ? 'Out of stock' : `${product.stockTotal} left`}
                  </Chip>
                </li>
              ))
            )}
          </ul>
          <div className="mt-3">
            <Link to="/products?status=LOW_STOCK" className="text-sm text-accent hover:underline">
              View inventory
            </Link>
          </div>
        </Card>
      </div>
    </>
  )
}
