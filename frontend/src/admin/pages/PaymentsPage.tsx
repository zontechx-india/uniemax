import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { OrderRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { PaymentChip } from '../ui/statusMeta'
import { formatDateTime, formatMoney } from '../ui/format'

/**
 * Payments — the money view of the same orders.
 *
 * There is no separate payments table in the database, and deliberately so:
 * a payment IS an order's settlement, and a second table would be a second
 * truth to reconcile. This page re-cuts the order rows by payment status,
 * method and reference, which is what a finance question actually needs.
 *
 * The gateway reference column is the one that closes a support loop — it is
 * what a Cashfree dashboard search takes.
 */

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Awaiting payment' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
] as const

export default function PaymentsPage() {
  const navigate = useNavigate()
  const list = useAdminList<OrderRow>((query) => adminApi.listPayments(query), {
    keys: ['q', 'paymentStatus', 'paymentMethod'],
  })

  const columns: Column<OrderRow>[] = [
    {
      header: 'Order',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.orderNumber}</p>
          <p className="truncate text-xs text-muted">{row.storeName}</p>
        </div>
      ),
    },
    {
      header: 'Customer',
      cell: (row) => <span className="truncate text-sm">{row.customerName ?? '—'}</span>,
    },
    {
      header: 'Status',
      cell: (row) => <PaymentChip status={row.paymentStatus} method={row.paymentMethod} />,
    },
    {
      header: 'Method',
      cell: (row) => (
        <Chip>{row.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}</Chip>
      ),
    },
    {
      header: 'Reference',
      hideOnMobile: true,
      cell: (row) =>
        row.paymentRef ? (
          <span className="font-mono text-xs text-muted">{row.paymentRef}</span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      header: 'Placed',
      hideOnMobile: true,
      cell: (row) => <span className="text-sm text-muted">{formatDateTime(row.placedAt)}</span>,
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (row) => <span className="font-medium">{formatMoney(row.total)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Settlement status for every order — online and cash on delivery"
      />

      <Card padding="none">
        <Tabs
          value={list.filters['paymentStatus'] ?? ''}
          onChange={(value) => list.setFilter('paymentStatus', value)}
          options={[...STATUS_TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Order number, gateway reference, customer…"
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
          rowKey={(row) => row.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
          empty={{ title: 'No payments match these filters' }}
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
