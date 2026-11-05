import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { AwaitingPayoutRow, PayoutRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { PayoutMethodChip, PayoutStatusChip } from '../ui/statusMeta'
import { formatDate, formatDateTime, formatMoneyExact } from '../ui/format'

/**
 * Seller payouts across every order — what still has to be paid, and every
 * payout made (manual or PaymentHub) for reconciliation. Paying happens on
 * the order page; a row opens it.
 *
 * "To pay" lists online-paid, delivered orders with no payout pending,
 * processing or done, oldest delivery first. "All payouts" is the ledger,
 * searchable by UTR, sender, order or store.
 */

const VIEW_TABS = [
  { value: '', label: 'To pay' },
  { value: 'all', label: 'All payouts' },
] as const

export default function SellerPayoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'all' ? 'all' : ''

  return (
    <>
      <PageHeader
        title="Seller payouts"
        subtitle="Money sent to sellers for online orders. Pay from the order page."
      />
      <Card padding="none">
        <Tabs
          value={view}
          // A new view starts clean — its filters differ from the other's.
          onChange={(value) => setSearchParams(value ? { view: value } : {}, { replace: true })}
          options={[...VIEW_TABS]}
        />
        {view === 'all' ? <LedgerView /> : <ToPayView />}
      </Card>
    </>
  )
}

function ToPayView() {
  const navigate = useNavigate()
  const list = useAdminList<AwaitingPayoutRow>((query) => adminApi.listAwaitingPayouts(query), {
    keys: ['q'],
  })

  const columns: Column<AwaitingPayoutRow>[] = [
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
      header: 'Delivered',
      cell: (row) => <span className="text-sm text-muted">{formatDate(row.deliveredAt)}</span>,
    },
    {
      header: 'Earlier attempts',
      hideOnMobile: true,
      cell: (row) =>
        row.pastAttempts > 0 ? (
          <Chip tone="warning">{row.pastAttempts} failed or cancelled</Chip>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      header: 'Order total',
      className: 'text-right',
      cell: (row) => <span className="font-figure font-medium">{formatMoneyExact(row.total)}</span>,
    },
  ]

  return (
    <>
      <Toolbar>
        <SearchInput
          value={list.filters['q'] ?? ''}
          onChange={(value) => list.setFilter('q', value)}
          placeholder="Order number or store…"
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
        empty={{ title: 'No orders are waiting for a payout' }}
      />
      <Pagination
        page={list.meta.page}
        totalPages={list.meta.totalPages}
        total={list.meta.total}
        onPage={list.setPage}
        busy={list.loading}
      />
    </>
  )
}

function LedgerView() {
  const navigate = useNavigate()
  const list = useAdminList<PayoutRow>((query) => adminApi.listSellerPayouts(query), {
    keys: ['q', 'status', 'method'],
  })

  const columns: Column<PayoutRow>[] = [
    {
      header: 'Order',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.order.orderNumber}</p>
          <p className="truncate text-xs text-muted">{row.order.storeName}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <PayoutStatusChip status={row.status} />,
    },
    {
      header: 'Method',
      hideOnMobile: true,
      cell: (row) => <PayoutMethodChip method={row.method} />,
    },
    {
      header: 'From / reference',
      hideOnMobile: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">
            {row.method === 'MANUAL' ? row.senderName : (row.gateway ?? 'PaymentHub')}
          </p>
          <p className="truncate font-mono text-xs text-muted">{row.utr ?? row.hubPayoutId ?? '—'}</p>
        </div>
      ),
    },
    {
      header: 'Paid on',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted">
          {row.paidAt ? (row.paidAtTimeKnown ? formatDateTime(row.paidAt) : formatDate(row.paidAt)) : '—'}
        </span>
      ),
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (row) => <span className="font-figure font-medium">{formatMoneyExact(row.amount)}</span>,
    },
  ]

  return (
    <>
      <Toolbar>
        <SearchInput
          value={list.filters['q'] ?? ''}
          onChange={(value) => list.setFilter('q', value)}
          placeholder="UTR, sender, order number, store…"
        />
        <FilterSelect
          label="Status"
          value={list.filters['status'] ?? ''}
          onChange={(value) => list.setFilter('status', value)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'PROCESSING', label: 'Processing' },
            { value: 'SUCCEEDED', label: 'Paid out' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'REVERSED', label: 'Reversed' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
        <FilterSelect
          label="Method"
          value={list.filters['method'] ?? ''}
          onChange={(value) => list.setFilter('method', value)}
          options={[
            { value: '', label: 'Any method' },
            { value: 'MANUAL', label: 'Manual' },
            { value: 'GATEWAY', label: 'PaymentHub' },
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
        onRowClick={(row) => navigate(`/orders/${row.order.id}`)}
        empty={{ title: 'No payouts match these filters' }}
      />
      <Pagination
        page={list.meta.page}
        totalPages={list.meta.totalPages}
        total={list.meta.total}
        onPage={list.setPage}
        busy={list.loading}
      />
    </>
  )
}
