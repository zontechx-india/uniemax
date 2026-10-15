import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { WaCampaignRow } from '../../features/adminApi'
import { useAdminList } from '../../features/useAdminQuery'
import { Button } from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { formatCount, formatDateTime } from '../../ui/format'
import { CampaignStatusChip, CategoryChip, LastSeen, WhatsAppShell } from './whatsappUi'

/**
 * Campaigns — one approved template, filled per person, sent to an audience.
 * Created on the New campaign page; sent by the server's queue at its own
 * pace, so a campaign keeps going if this page is closed.
 */

export default function WhatsAppCampaignsPage() {
  const navigate = useNavigate()
  const list = useAdminList<WaCampaignRow>((query) => adminApi.listWaCampaigns(query), { keys: [] })

  const columns: Column<WaCampaignRow>[] = [
    {
      header: 'Campaign',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.name}</p>
          <p className="truncate text-xs text-muted">
            {row.templateName} · {row.languageCode}
          </p>
        </div>
      ),
    },
    { header: 'Status', cell: (row) => <CampaignStatusChip status={row.status} /> },
    {
      header: 'Type',
      hideOnMobile: true,
      cell: (row) => <CategoryChip category={row.category} />,
    },
    { header: 'Recipients', className: 'text-right', cell: (row) => formatCount(row.total) },
    { header: 'Sent', className: 'text-right', cell: (row) => formatCount(row.sent) },
    {
      header: 'Failed',
      className: 'text-right',
      hideOnMobile: true,
      cell: (row) => (
        <span className={row.failed > 0 ? 'text-danger' : ''}>{formatCount(row.failed)}</span>
      ),
    },
    {
      header: 'When',
      cell: (row) =>
        row.status === 'SCHEDULED' && row.scheduledAt ? (
          <span className="whitespace-nowrap text-sm text-muted">{formatDateTime(row.scheduledAt)}</span>
        ) : (
          <LastSeen at={row.startedAt ?? row.createdAt} />
        ),
    },
  ]

  return (
    <WhatsAppShell
      actions={
        <Button variant="primary" size="md" onClick={() => navigate('/whatsapp/campaigns/new')}>
          New campaign
        </Button>
      }
    >
      {() => (
        <>
          <DataTable
            rows={list.rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            onRetry={list.refresh}
            onRowClick={(row) => navigate(`/whatsapp/campaigns/${row.id}`)}
            empty={{
              title: 'No campaigns yet',
              hint: 'A campaign sends one approved template to an audience — sellers by setup or activity, tagged contacts, or a list. Start one with New campaign.',
            }}
          />
          <Pagination
            page={list.meta.page}
            totalPages={list.meta.totalPages}
            total={list.meta.total}
            onPage={list.setPage}
            busy={list.loading}
          />
        </>
      )}
    </WhatsAppShell>
  )
}
