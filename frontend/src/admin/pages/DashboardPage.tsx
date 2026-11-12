import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { BarList, ChartFrame, Donut, TrendChart } from '../ui/charts'
import { StatTile } from '../ui/StatTile'
import { Icon } from '../layout/icons'
import {
  Card,
  CardHeader,
  Chip,
  ErrorState,
  PageHeader,
  PageSkeleton,
  Segmented,
} from '../ui/primitives'
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
  if (!data || loading) return <PageSkeleton label="Loading the dashboard" />

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
          <Segmented
            label="Date range"
            value={days}
            onChange={setDays}
            options={RANGES.map((range) => ({ value: range, label: `${range} days` }))}
          />
        }
      />

      {/* Integration health — a missing key should be noticed here, not by a
          customer at checkout. */}
      {!data.integrations.paymentGateway || !data.integrations.push ? (
        <div className="callout c-warn" role="status">
          <Icon name="alert" size={15} />
          <span className="font-medium text-fg">Setup incomplete:</span>
          {!data.integrations.paymentGateway ? (
            <Chip tone="warning">Payment gateway not configured</Chip>
          ) : null}
          {!data.integrations.push ? <Chip tone="warning">Push notifications off</Chip> : null}
        </div>
      ) : null}

      <div className="stats">
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

      <div className="grid-3">
        <div className="span-2 min-w-0">
          <ChartFrame
            title={measure === 'revenue' ? 'Revenue' : 'Orders'}
            subtitle={`Per day, last ${days} days`}
            actions={
              // Revenue and orders share no scale, so they are never plotted
              // together — this switches the single series instead.
              <Segmented
                label="Chart measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'revenue', label: 'Revenue' },
                  { value: 'orders', label: 'Orders' },
                ]}
              />
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

      <div className="grid-3">
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

      <div className="grid-3 mb-0">
        <Card className="span-2" padding="none">
          <CardHeader
            title="Latest orders"
            action={
              <Link to="/orders" className="lnk sm">
                View all
              </Link>
            }
          />
          {data.recentOrders.length === 0 ? (
            <p className="mini-empty">No orders yet.</p>
          ) : (
            <ul className="mini-list">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link to={`/orders/${order.id}`}>
                    <span className="ml-m">
                      <b>
                        {order.orderNumber} · {order.storeName}
                      </b>
                      <em>
                        {order.customerName ?? 'Customer'} · {formatRelative(order.placedAt)}
                      </em>
                    </span>
                    <span className="ml-r">
                      {/* The two chips drop on a phone; the order page has them. */}
                      <span className="ml-chips hide-sm">
                        <OrderStatusChip status={order.status} />
                        <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />
                      </span>
                      <span className="num font-semibold text-fg">{formatMoney(order.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <CardHeader
            title="Low stock"
            subtitle="5 or fewer left, live listings"
            action={
              <Link to="/products?status=LOW_STOCK" className="lnk sm">
                View inventory
              </Link>
            }
          />
          {data.lowStock.length === 0 ? (
            <p className="mini-empty">Nothing running low.</p>
          ) : (
            <ul className="mini-list">
              {data.lowStock.map((product) => (
                <li key={product.id}>
                  <div className="ml-row">
                    <span className="ml-m">
                      <b>{product.name}</b>
                      <em>{product.storeName}</em>
                    </span>
                    <Chip tone={product.stockTotal === 0 ? 'danger' : 'warning'}>
                      {product.stockTotal === 0 ? 'Out of stock' : `${product.stockTotal} left`}
                    </Chip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
