import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { OrderRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { OrderStatusChip, PaymentChip } from '../ui/statusMeta'
import { formatDateTime, formatMoney } from '../ui/format'

/**
 * Every order on the platform, filtered.
 *
 * Read-only by design: the seller owns fulfilment (they hold the stock and
 * the customer relationship), so the console reports rather than drives. What
 * it is for is answering a support question fast — hence the search across
 * order number, customer name, phone, store and payment reference.
 *
 * Filters live in the URL, so a dashboard tile can deep-link here already
 * filtered and an admin can share "the pending list" with a colleague.
 */

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

export default function OrdersPage() {
  const navigate = useNavigate()
  const list = useAdminList<OrderRow>(
    (query) => adminApi.listOrders(query),
    { keys: ['q', 'status', 'paymentStatus', 'paymentMethod', 'storeId'] },
  )

  const columns: Column<OrderRow>[] = [
    {
      header: 'Order',
      primary: true,
      cell: (order) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{order.orderNumber}</p>
          <p className="truncate text-xs text-muted">
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'} ·{' '}
            {order.fulfilment === 'PICKUP' ? 'Pickup' : 'Delivery'}
          </p>
        </div>
      ),
    },
    {
      header: 'Store',
      cell: (order) => <span className="truncate text-sm">{order.storeName}</span>,
    },
    {
      header: 'Customer',
      cell: (order) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{order.customerName ?? '—'}</p>
          <p className="truncate text-xs text-muted">{order.customerPhone ?? ''}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (order) => <OrderStatusChip status={order.status} /> },
    {
      header: 'Payment',
      cell: (order) => <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />,
    },
    {
      header: 'Placed',
      hideOnMobile: true,
      cell: (order) => <span className="text-sm text-muted">{formatDateTime(order.placedAt)}</span>,
    },
    {
      header: 'Total',
      className: 'text-right',
      cell: (order) => <span className="font-medium">{formatMoney(order.total)}</span>,
    },
  ]

  return (
    <>
      <PageHeader title="Orders" subtitle="Every order placed across the platform" />

      <Card padding="none">
        <Tabs
          value={list.filters['status'] ?? ''}
          onChange={(value) => list.setFilter('status', value)}
          options={[...STATUS_TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Order number, customer, phone, store…"
          />
          <FilterSelect
            label="Payment"
            value={list.filters['paymentStatus'] ?? ''}
            onChange={(value) => list.setFilter('paymentStatus', value)}
            options={[
              { value: '', label: 'Any status' },
              { value: 'PAID', label: 'Paid' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'REFUNDED', label: 'Refunded' },
            ]}
          />
          <FilterSelect
            label="Method"
            value={list.filters['paymentMethod'] ?? ''}
            onChange={(value) => list.setFilter('paymentMethod', value)}
            options={[
              { value: '', label: 'Any method' },
              { value: 'ONLINE', label: 'Online' },
              { value: 'COD', label: 'Cash on delivery' },
            ]}
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(order) => order.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          empty={{
            title: 'No orders match these filters',
            hint: 'Clear the search or pick a different status.',
          }}
        />
        <Pagination
          page={list.meta.page}
          totalPages={list.meta.totalPages}
          total={list.meta.total}
          onPage={list.setPage}
          busy={list.loading}
        />
      </Card>
    </>
  )
}
