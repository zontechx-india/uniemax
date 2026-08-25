import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { TicketListMeta, TicketRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import {
  TICKET_CATEGORY_LABELS,
  TicketPriorityChip,
  TicketScopeChip,
  TicketStatusChip,
} from '../ui/statusMeta'
import { formatRelative } from '../ui/format'

/**
 * The support queue — every ticket written to the platform, by a seller about
 * a store or by a shopper about their account.
 *
 * The default tab is **Needs reply** (open + in progress) rather than "All",
 * because a queue's job is to show what is still owed, and it deliberately
 * sorts **oldest activity first**: the ticket nobody has touched longest is
 * the one at risk, which is the opposite of every other table in the console.
 * The remaining tabs drop back to newest-first, where recency is what an
 * admin is scanning for.
 *
 * Both audiences land in **one queue**, filterable by `scope` — a seller
 * writing from their shop and a shopper writing from their account are the
 * same job with different context, and two separate pages would just be one
 * of them going unread.
 */

const TABS = [
  { value: 'open', label: 'Needs reply' },
  { value: '', label: 'All' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
] as const

const PRIORITIES = [
  { value: '', label: 'Any priority' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
]

const CATEGORIES = [
  { value: '', label: 'Any topic' },
  ...Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]

const SCOPES = [
  { value: '', label: 'Everyone' },
  { value: 'STORE', label: 'Sellers' },
  { value: 'ACCOUNT', label: 'Shoppers' },
]

export default function SupportPage() {
  const navigate = useNavigate()
  const list = useAdminList<TicketRow, TicketListMeta>(
    (query) => adminApi.listTickets(query),
    { keys: ['q', 'status', 'open', 'category', 'priority', 'scope'] },
  )

  // "open" and "status" are one axis of choice in the UI (the tab strip), so
  // selecting either must clear the other — otherwise a stale `status=` in the
  // URL would silently narrow the queue tab.
  const tab = list.filters['open'] ? 'open' : (list.filters['status'] ?? '')
  const selectTab = (value: string) => {
    list.setFilter('status', value === 'open' ? '' : value)
    list.setFilter('open', value === 'open' ? 'true' : '')
  }

  const columns: Column<TicketRow>[] = [
    {
      header: 'Ticket',
      primary: true,
      cell: (ticket) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{ticket.subject}</p>
          <p className="truncate text-xs text-muted">
            {ticket.ticketNumber} · {TICKET_CATEGORY_LABELS[ticket.category]}
          </p>
        </div>
      ),
    },
    {
      header: 'From',
      cell: (ticket) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">
            {ticket.customer.name ?? ticket.customer.email ?? '—'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5">
            <TicketScopeChip storeId={ticket.storeId} />
            {ticket.storeName ? (
              <span className="truncate text-xs text-muted">{ticket.storeName}</span>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      header: 'Replies',
      className: 'text-right',
      hideOnMobile: true,
      cell: (ticket) => <span className="text-sm">{ticket.messageCount}</span>,
    },
    {
      header: 'Priority',
      cell: (ticket) => <TicketPriorityChip priority={ticket.priority} />,
    },
    { header: 'Status', cell: (ticket) => <TicketStatusChip status={ticket.status} /> },
    {
      header: 'Last activity',
      cell: (ticket) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {formatRelative(ticket.lastMessageAt)}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Tickets from sellers about their stores and from shoppers about their accounts"
        actions={
          // `openCount` is the platform-wide backlog, so it stays truthful
          // whatever the current filter shows.
          list.meta.openCount ? (
            <Chip tone="warning">{list.meta.openCount} awaiting reply</Chip>
          ) : null
        }
      />

      <Card padded={false}>
        <Tabs value={tab} onChange={selectTab} options={[...TABS]} />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Ticket number, subject, seller…"
          />
          <FilterSelect
            label="From"
            value={list.filters['scope'] ?? ''}
            onChange={(value) => list.setFilter('scope', value)}
            options={SCOPES}
          />
          <FilterSelect
            label="Topic"
            value={list.filters['category'] ?? ''}
            onChange={(value) => list.setFilter('category', value)}
            options={CATEGORIES}
          />
          <FilterSelect
            label="Priority"
            value={list.filters['priority'] ?? ''}
            onChange={(value) => list.setFilter('priority', value)}
            options={PRIORITIES}
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(ticket) => ticket.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(ticket) => navigate(`/support/${ticket.id}`)}
          empty={{
            title: 'No tickets match these filters',
            hint: 'Sellers write in from Store Management → Help & Support; shoppers from their account menu.',
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
