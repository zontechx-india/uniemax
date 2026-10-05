import { adminApi } from '../features/adminApi'
import type { AuditRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, Toolbar } from '../ui/Toolbar'
import { formatDateTime } from '../ui/format'

/**
 * The admin audit trail — who changed what, when, from where.
 *
 * Append-only and never edited, so it stays trustworthy for an incident
 * review. Every state-changing endpoint in the console writes one line here;
 * if an action is missing from this page, it did not happen through the
 * console.
 */

/** Human sentence per action, so the page reads rather than decodes. */
const ACTIONS: Record<string, { label: string; tone: 'neutral' | 'danger' | 'success' }> = {
  'store.suspend': { label: 'Suspended store', tone: 'danger' },
  'store.restore': { label: 'Lifted store suspension', tone: 'success' },
  'customer.block': { label: 'Blocked customer', tone: 'danger' },
  'customer.unblock': { label: 'Unblocked customer', tone: 'success' },
  'product.hide': { label: 'Hid product', tone: 'danger' },
  'product.show': { label: 'Restored product', tone: 'success' },
  'bankAccount.verified': { label: 'Verified payout account', tone: 'success' },
  'bankAccount.failed': { label: 'Failed payout verification', tone: 'danger' },
  'bankAccount.pending': { label: 'Reset payout verification', tone: 'neutral' },
  'admin.create': { label: 'Created admin', tone: 'neutral' },
  'admin.update': { label: 'Updated admin', tone: 'neutral' },
  'admin.passwordReset': { label: 'Reset admin password', tone: 'danger' },
}

const ACTION_FILTER = [
  { value: '', label: 'All actions' },
  ...Object.entries(ACTIONS).map(([value, meta]) => ({ value, label: meta.label })),
]

const ENTITY_FILTER = [
  { value: '', label: 'All records' },
  { value: 'store', label: 'Stores' },
  { value: 'customer', label: 'Customers' },
  { value: 'storeProduct', label: 'Products' },
  { value: 'storeBankAccount', label: 'Payout accounts' },
  { value: 'admin', label: 'Admin accounts' },
]

/** `meta` is free-form per action — render it as readable key: value pairs. */
function MetaSummary({ meta }: { meta: Record<string, unknown> | null }) {
  if (!meta) return <span className="text-muted">—</span>
  const entries = Object.entries(meta).filter(([, value]) => value !== null && value !== undefined)
  if (entries.length === 0) return <span className="text-muted">—</span>
  return (
    <span className="text-xs text-muted">
      {entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}
    </span>
  )
}

export default function ActivityPage() {
  const list = useAdminList<AuditRow>((query) => adminApi.listAudit(query), {
    keys: ['action', 'entityType', 'entityId'],
  })

  const columns: Column<AuditRow>[] = [
    {
      header: 'Action',
      primary: true,
      cell: (row) => {
        const meta = ACTIONS[row.action]
        return <Chip tone={meta?.tone ?? 'neutral'}>{meta?.label ?? row.action}</Chip>
      },
    },
    {
      header: 'Admin',
      cell: (row) => <span className="truncate text-sm">{row.adminEmail}</span>,
    },
    {
      header: 'Record',
      cell: (row) => (
        <span className="font-mono text-xs text-muted">
          {row.entityType}/{row.entityId.slice(-8)}
        </span>
      ),
    },
    { header: 'Details', hideOnMobile: true, cell: (row) => <MetaSummary meta={row.meta} /> },
    {
      header: 'From',
      hideOnMobile: true,
      cell: (row) => <span className="text-xs text-muted">{row.ip ?? '—'}</span>,
    },
    {
      header: 'When',
      className: 'text-right',
      cell: (row) => <span className="text-sm text-muted">{formatDateTime(row.createdAt)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Every change an admin has made — append-only, never edited"
      />

      <Card padding="none">
        <Toolbar>
          <FilterSelect
            label="Action"
            value={list.filters['action'] ?? ''}
            onChange={(value) => list.setFilter('action', value)}
            options={ACTION_FILTER}
          />
          <FilterSelect
            label="Record"
            value={list.filters['entityType'] ?? ''}
            onChange={(value) => list.setFilter('entityType', value)}
            options={ENTITY_FILTER}
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          empty={{
            title: 'No activity recorded',
            hint: 'Suspensions, blocks and verifications will appear here.',
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
