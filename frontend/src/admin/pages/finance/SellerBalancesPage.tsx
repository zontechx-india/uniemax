import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { BalanceRow } from '../../features/adminApi'
import { useAdminList, useAdminQuery } from '../../features/useAdminQuery'
import { Card, PageHeader } from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../../ui/Toolbar'
import { StatTile } from '../../ui/StatTile'
import { formatMoneyExact } from '../../ui/format'

/**
 * Seller balances — what UnieMax owes each seller and what each seller owes
 * UnieMax, from the seller ledger. A row opens that seller's full ledger.
 */

const TABS = [
  { value: '', label: 'All' },
  { value: 'PAYABLE', label: 'We owe them' },
  { value: 'OWED', label: 'They owe us' },
] as const

export default function SellerBalancesPage() {
  const navigate = useNavigate()
  const totals = useAdminQuery(() => adminApi.balanceTotals(), [])
  const list = useAdminList<BalanceRow>((query) => adminApi.listBalances(query), { keys: ['q', 'filter'] })

  const columns: Column<BalanceRow>[] = [
    {
      header: 'Store',
      primary: true,
      cell: (row) => <span className="font-medium text-fg">{row.storeName}</span>,
    },
    {
      header: 'We owe seller',
      className: 'text-right',
      cell: (row) => <span className="font-figure">{formatMoneyExact(row.payable)}</span>,
    },
    {
      header: 'Being paid',
      hideOnMobile: true,
      className: 'text-right',
      cell: (row) => <span className="font-figure text-muted">{formatMoneyExact(row.inPayout)}</span>,
    },
    {
      header: 'Seller owes us',
      className: 'text-right',
      cell: (row) => (
        <span className={`font-figure ${Number(row.owed) > 0 ? 'text-warning' : ''}`}>{formatMoneyExact(row.owed)}</span>
      ),
    },
    {
      header: 'Net to seller',
      hideOnMobile: true,
      className: 'text-right',
      cell: (row) => <span className="font-figure font-semibold">{formatMoneyExact(row.net)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Seller balances"
        subtitle="From delivered orders, payouts and COD platform fees. Pay a seller from the order page."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="We owe sellers" value={totals.data ? formatMoneyExact(totals.data.payable) : '—'} hint="Ready to pay" />
        <StatTile label="Being paid" value={totals.data ? formatMoneyExact(totals.data.inPayout) : '—'} hint="Payouts not finished" />
        <StatTile
          label="Sellers owe us"
          value={totals.data ? formatMoneyExact(totals.data.owed) : '—'}
          hint="COD platform fees not settled"
          tone={totals.data && Number(totals.data.owed) > 0 ? 'warning' : 'default'}
        />
      </div>
      <Card padding="none">
        <Tabs
          value={list.filters['filter'] ?? ''}
          onChange={(value) => list.setFilter('filter', value)}
          options={[...TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Store name…"
          />
        </Toolbar>
        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(row) => row.storeId}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(row) => navigate(`/finance/sellers/${row.storeId}`)}
          empty={{ title: 'No seller balances yet', hint: 'Balances appear once orders are delivered.' }}
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
