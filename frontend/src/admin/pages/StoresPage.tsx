import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { StoreRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { SetupChip, StoreStatusChip } from '../ui/statusMeta'
import { formatCount, formatDate, formatMoney } from '../ui/format'

/**
 * Stores and the sellers behind them.
 *
 * "Seller" is not a separate account type on this platform — it is a customer
 * who owns a store — so the owner's email sits on the store row rather than
 * in a parallel sellers screen that would say the same thing twice.
 */

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUSPENDED', label: 'Suspended' },
] as const

/** Round store logo, falling back to the initial. */
export function StoreAvatar({
  logoUrl,
  name,
  size = 'h-9 w-9',
}: {
  logoUrl: string | null
  name: string
  size?: string
}) {
  return logoUrl ? (
    <img
      src={logoUrl}
      alt=""
      className={`${size} shrink-0 rounded-pill border border-line object-cover`}
      loading="lazy"
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-pill bg-surface-alt text-sm font-semibold text-muted`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function StoresPage() {
  const navigate = useNavigate()
  const list = useAdminList<StoreRow>((query) => adminApi.listStores(query), {
    keys: ['q', 'status', 'setup', 'sort'],
  })

  const columns: Column<StoreRow>[] = [
    {
      header: 'Store',
      primary: true,
      cell: (store) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <StoreAvatar logoUrl={store.logoUrl} name={store.name} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{store.name}</p>
            <p className="truncate text-xs text-muted">/{store.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Owner',
      cell: (store) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{store.owner.name ?? '—'}</p>
          <p className="truncate text-xs text-muted">{store.owner.email}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (store) => (
        <StoreStatusChip isPublished={store.isPublished} suspendedAt={store.suspendedAt} />
      ),
    },
    {
      // Independent of Status on purpose: a store can be published and still
      // owe us a PAN, and it is the unfinished ones an admin comes here to
      // chase. The chip names the first outstanding step; the store page
      // lists them all with a link to send the seller.
      header: 'Setup',
      cell: (store) => <SetupChip setup={store.setup} />,
    },
    {
      header: 'Catalog',
      hideOnMobile: true,
      cell: (store) => (
        <span className="text-sm text-muted">
          {formatCount(store.counts.products)} products · {formatCount(store.counts.categories)}{' '}
          categories
        </span>
      ),
    },
    {
      header: 'Orders',
      className: 'text-right',
      cell: (store) => formatCount(store.counts.orders),
    },
    {
      header: 'Revenue',
      className: 'text-right',
      cell: (store) => <span className="font-medium">{formatMoney(store.revenue)}</span>,
    },
    {
      header: 'Created',
      hideOnMobile: true,
      cell: (store) => <span className="text-sm text-muted">{formatDate(store.createdAt)}</span>,
    },
  ]

  return (
    <>
      <PageHeader title="Stores & sellers" subtitle="Every store on the marketplace" />

      <Card padded={false}>
        <Tabs
          value={list.filters['status'] ?? ''}
          onChange={(value) => list.setFilter('status', value)}
          options={[...STATUS_TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Store name, slug or owner email…"
          />
          <FilterSelect
            label="Setup"
            value={list.filters['setup'] ?? ''}
            onChange={(value) => list.setFilter('setup', value)}
            options={[
              { value: '', label: 'Any' },
              { value: 'INCOMPLETE', label: 'Not finished' },
              { value: 'COMPLETE', label: 'Complete' },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={list.filters['sort'] ?? 'NEWEST'}
            onChange={(value) => list.setFilter('sort', value)}
            options={[
              { value: 'NEWEST', label: 'Newest first' },
              { value: 'OLDEST', label: 'Oldest first' },
              { value: 'ORDERS', label: 'Most orders' },
              { value: 'NAME', label: 'Name (A–Z)' },
            ]}
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(store) => store.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(store) => navigate(`/stores/${store.id}`)}
          empty={{ title: 'No stores match these filters' }}
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
