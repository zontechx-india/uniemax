import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { CustomerRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { formatCount, formatDate } from '../ui/format'

/**
 * Customer accounts — buyers and sellers together, since they are the same
 * account type. The tabs cut the list rather than pretending there are two
 * kinds of user.
 */

const TABS = [
  { value: '', label: 'All' },
  { value: 'SELLERS', label: 'Sellers' },
  { value: 'BUYERS', label: 'Buyers only' },
  { value: 'BLOCKED', label: 'Blocked' },
] as const

export default function CustomersPage() {
  const navigate = useNavigate()
  const list = useAdminList<CustomerRow>((query) => adminApi.listCustomers(query), {
    keys: ['q', 'filter'],
  })

  const columns: Column<CustomerRow>[] = [
    {
      header: 'Customer',
      primary: true,
      cell: (customer) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{customer.name ?? 'Unnamed'}</p>
          <p className="truncate text-xs text-muted">{customer.email ?? customer.phone ?? '—'}</p>
        </div>
      ),
    },
    {
      header: 'Contact',
      hideOnMobile: true,
      cell: (customer) => (
        <div className="min-w-0 text-sm">
          <p className="truncate">{customer.phone ?? 'No phone linked'}</p>
          <p className="text-xs text-muted">
            {customer.emailVerifiedAt ? 'Email verified' : 'Email unverified'}
          </p>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (customer) =>
        customer.isSeller ? (
          <Chip tone="brand">
            Seller · {formatCount(customer.counts.stores)} store
            {customer.counts.stores === 1 ? '' : 's'}
          </Chip>
        ) : (
          <Chip>Buyer</Chip>
        ),
    },
    {
      header: 'Status',
      cell: (customer) =>
        customer.blockedAt ? <Chip tone="danger">Blocked</Chip> : <Chip tone="success">Active</Chip>,
    },
    {
      header: 'Orders',
      className: 'text-right',
      cell: (customer) => formatCount(customer.counts.orders),
    },
    {
      header: 'Joined',
      hideOnMobile: true,
      cell: (customer) => (
        <span className="text-sm text-muted">{formatDate(customer.createdAt)}</span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone with a UnieMax account" />

      {/* Edge to edge on a phone, like a native list; a card from `sm`. */}
      <Card padding="none" className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
        <Tabs
          sticky
          value={list.filters['filter'] ?? ''}
          onChange={(value) => list.setFilter('filter', value)}
          options={[...TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Name, email or phone…"
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(customer) => customer.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
          mobileRow={(customer) => (
            <div className="flex gap-3">
              {/* Initial in a circle — a contact list's familiar shape. */}
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-alt text-sm font-semibold text-muted"
                aria-hidden
              >
                {(customer.name ?? customer.email ?? '?').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-fg">
                    {customer.name ?? 'Unnamed'}
                  </p>
                  <p className="shrink-0 text-xs text-muted">
                    {formatCount(customer.counts.orders)} orders
                  </p>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {customer.email ?? customer.phone ?? '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {customer.isSeller ? (
                    <Chip tone="brand">
                      Seller · {formatCount(customer.counts.stores)} store
                      {customer.counts.stores === 1 ? '' : 's'}
                    </Chip>
                  ) : (
                    <Chip>Buyer</Chip>
                  )}
                  {/* Active is the normal case — only a block earns a chip. */}
                  {customer.blockedAt ? <Chip tone="danger">Blocked</Chip> : null}
                  <span className="ml-auto text-xs text-muted">
                    Joined {formatDate(customer.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          )}
          empty={{ title: 'No customers match these filters' }}
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
