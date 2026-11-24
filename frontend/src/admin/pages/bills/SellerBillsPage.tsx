import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { AdminBill } from '../../features/adminApi'
import { useAdminList } from '../../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../../ui/Toolbar'
import { formatMoney, formatRelative } from '../../ui/format'

/**
 * Seller bills — every bill sellers made for phone / in-shop customers
 * (modules/bills). Read-only: only the seller shares or cancels a bill. For
 * support: "my link does not work" (expired? cancelled?), "did they pay?".
 * A paid bill is a normal order — its row links there.
 */

export const BILL_STATE: Record<AdminBill['state'], { label: string; tone: ChipTone }> = {
  OPEN: { label: 'Open', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}
export const BILL_STAGE: Record<AdminBill['stage'], string> = {
  NEW: 'Not shared yet',
  SHARED: 'Shared · not opened',
  OPENED: 'Opened · not paid',
}

const TABS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PAID', label: 'Paid' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export default function SellerBillsPage() {
  const navigate = useNavigate()
  const list = useAdminList<AdminBill>((query) => adminApi.listBills(query), { keys: ['q', 'state', 'storeId'] })

  const columns: Column<AdminBill>[] = [
    {
      header: 'Bill',
      primary: true,
      cell: (bill) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{bill.number}</p>
          <p className="truncate text-xs text-muted">{formatRelative(bill.createdAt)}</p>
        </div>
      ),
    },
    { header: 'Store', cell: (bill) => <span className="truncate text-sm">{bill.store.name}</span> },
    {
      header: 'Customer',
      hideOnMobile: true,
      cell: (bill) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{bill.customerName ?? '—'}</p>
          <p className="truncate text-xs text-muted">{bill.customerPhone}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (bill) => (
        <div className="min-w-0">
          <Chip tone={BILL_STATE[bill.state].tone}>{BILL_STATE[bill.state].label}</Chip>
          {bill.state === 'OPEN' && <p className="mt-1 text-xs text-muted">{BILL_STAGE[bill.stage]}</p>}
        </div>
      ),
    },
    {
      header: 'Order',
      cell: (bill) => (bill.order ? <span className="text-sm">{bill.order.orderNumber}</span> : <span className="text-muted">—</span>),
    },
    { header: 'Total', className: 'text-right', cell: (bill) => <span className="font-medium">{formatMoney(bill.total)}</span> },
  ]

  return (
    <>
      <PageHeader title="Seller bills" subtitle="Bills sellers made for phone and in-shop customers. A paid bill becomes a normal order." />
      <Card padding="none" className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
        <Tabs sticky value={list.filters['state'] ?? ''} onChange={(value) => list.setFilter('state', value)} options={TABS} />
        <Toolbar>
          <SearchInput value={list.filters['q'] ?? ''} onChange={(value) => list.setFilter('q', value)} placeholder="Bill number, customer or phone…" />
        </Toolbar>
        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(bill) => bill.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(bill) => navigate(`/bills/${bill.id}`)}
          mobileRow={(bill) => (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium text-fg">
                  {bill.number} · {bill.customerName ?? bill.customerPhone}
                </p>
                <p className="shrink-0 font-figure font-medium text-fg">{formatMoney(bill.total)}</p>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {bill.store.name} · {formatRelative(bill.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip tone={BILL_STATE[bill.state].tone}>{BILL_STATE[bill.state].label}</Chip>
                {bill.state === 'OPEN' && <span className="text-xs text-muted">{BILL_STAGE[bill.stage]}</span>}
              </div>
            </>
          )}
          empty={{ title: 'No bills here', hint: 'Clear the search or pick another tab.' }}
        />
        <Pagination page={list.meta.page} totalPages={list.meta.totalPages} total={list.meta.total} onPage={list.setPage} busy={list.loading} />
      </Card>
    </>
  )
}
