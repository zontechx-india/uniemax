import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type {
  WaCampaign,
  WaRecipient,
  WaRecipientFilter,
  WaRetargetFilter,
  WaStatus,
} from '../../features/adminApi'
import { useAdminList, useAdminQuery } from '../../features/useAdminQuery'
import { Button, Card, CardHeader, Chip, Detail, ErrorState, PageHeader, Skeleton } from '../../ui/primitives'
import { StatTile } from '../../ui/StatTile'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { FilterSelect, Toolbar } from '../../ui/Toolbar'
import { formatCount, formatDateTime } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import {
  CampaignStatusChip,
  CategoryChip,
  WaStatusChip,
  downloadBlob,
  failureSummary,
  formatWaId,
  usePolling,
} from './whatsappUi'

/**
 * One campaign: progress while it sends, then where each message got to,
 * who engaged, and one-click follow-ups to the people who didn't.
 * Polls every 5 s while scheduled or sending.
 */

const POLL_MS = 5_000

/** Furthest-along first is how people read a funnel; failed sits apart. */
const SEGMENTS: { key: WaStatus; label: string; bar: string }[] = [
  { key: 'read', label: 'Read', bar: 'bg-success' },
  { key: 'delivered', label: 'Delivered', bar: 'bg-accent' },
  { key: 'sent', label: 'Sent, not delivered yet', bar: 'bg-accent/40' },
  { key: 'accepted', label: 'Queued at WhatsApp', bar: 'bg-fg/20' },
  { key: 'failed', label: 'Failed', bar: 'bg-danger' },
]

const AUDIENCE_LABEL: Record<string, string> = {
  sellers: 'Sellers (filtered)',
  contacts: 'Contacts (by tag / consent)',
  segment: 'Saved segment',
  campaign: 'Retarget of an earlier campaign',
  list: 'Pasted list',
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')

export default function WhatsAppCampaignPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, error, refresh } = useAdminQuery(() => adminApi.getWaCampaign(id), [id])
  const [override, setOverride] = useState<WaCampaign | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const c = override ?? data
  const live = Boolean(c && (c.status === 'SENDING' || c.status === 'SCHEDULED'))
  usePolling(
    () => {
      setOverride(null)
      refresh()
    },
    POLL_MS,
    live,
  )

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!c) return <Skeleton rows={10} />

  const control = async (action: 'pause' | 'resume' | 'cancel') => {
    setBusy(true)
    try {
      setOverride(await adminApi.controlWaCampaign(c.id, action))
      showToast(action === 'pause' ? 'Paused' : action === 'resume' ? 'Resumed' : 'Cancelled')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the campaign', 'danger')
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  const delivered = c.statuses.delivered + c.statuses.read
  const processed = c.queue.sent + c.queue.skipped + c.queue.failed
  const ended = c.status === 'COMPLETED' || c.status === 'CANCELLED'

  return (
    <>
      <Link
        to="/whatsapp/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        Campaigns
      </Link>

      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusChip status={c.status} />
            <CategoryChip category={c.category} />
            <span>
              {c.templateName} · {c.languageCode}
            </span>
          </span>
        }
        actions={
          ended ? null : (
            <div className="flex flex-wrap gap-2">
              {c.status === 'PAUSED' ? (
                <Button size="md" variant="primary" disabled={busy} onClick={() => void control('resume')}>
                  Resume
                </Button>
              ) : (
                <Button size="md" disabled={busy} onClick={() => void control('pause')}>
                  Pause
                </Button>
              )}
              <Button size="md" variant="danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            </div>
          )
        }
      />

      {c.status === 'SCHEDULED' && c.scheduledAt ? (
        <p className="mb-4 text-sm text-muted">
          Starts {formatDateTime(c.scheduledAt)} — the audience was checked when it was created.
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Recipients" value={formatCount(c.total)} hint={`${formatCount(c.skipped)} skipped`} />
        <StatTile label="Sent" value={formatCount(c.sent)} hint="Accepted by WhatsApp" />
        <StatTile label="Delivered" value={pct(delivered, c.sent)} hint={`${formatCount(delivered)} messages`} />
        <StatTile label="Read" value={pct(c.statuses.read, c.sent)} hint={`${formatCount(c.statuses.read)} messages`} />
        <StatTile
          label="Clicked"
          value={c.engagement.clickers === null ? '—' : pct(c.engagement.clickers, c.sent)}
          hint={
            c.engagement.clicks === null
              ? 'No tracked button'
              : `${formatCount(c.engagement.clickers ?? 0)} people · ${formatCount(c.engagement.clicks)} clicks`
          }
        />
        <StatTile label="Replied" value={pct(c.engagement.replied, c.sent)} hint={`${formatCount(c.engagement.replied)} people, within 7 days`} />
        <StatTile
          label="Failed"
          value={formatCount(c.failed)}
          hint="At send or after"
          tone={c.failed > 0 ? 'danger' : 'default'}
        />
        <StatTile label="Still to send" value={formatCount(c.queue.pending)} hint={c.status === 'PAUSED' ? 'Paused' : ended ? '—' : 'In the queue'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!ended && c.total > 0 ? <Progress done={processed} total={c.total} paused={c.status === 'PAUSED'} /> : null}
          <Breakdown campaign={c} />
          {c.skipReasons.length > 0 ? (
            <ReasonList
              title="Why people were skipped"
              rows={c.skipReasons.map((r) => ({ label: r.reason, count: r.count }))}
              tone="text-fg"
            />
          ) : null}
          {c.failures.length > 0 ? (
            <ReasonList
              title="Why messages failed"
              rows={c.failures.map((f) => ({
                label: `${failureSummary(f.errorCode, f.errorTitle)}${f.errorCode !== null ? ` · error ${f.errorCode}` : ''}`,
                count: f.count,
              }))}
              tone="text-danger"
            />
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl>
              <Detail label="Audience">{c.audience ? (AUDIENCE_LABEL[c.audience.kind] ?? c.audience.kind) : '—'}</Detail>
              <Detail label="Consent">{c.requireOptIn ? 'Only people who agreed to marketing' : 'Not required'}</Detail>
              <Detail label="Frequency limit">
                {c.frequencyCapHours > 0 ? `Skip if messaged in the last ${c.frequencyCapHours}h` : 'None'}
              </Detail>
              <Detail label="Created">{formatDateTime(c.createdAt)}</Detail>
              <Detail label="Started">{c.startedAt ? formatDateTime(c.startedAt) : '—'}</Detail>
              <Detail label="Finished">{c.finishedAt ? formatDateTime(c.finishedAt) : '—'}</Detail>
            </dl>
          </Card>
          {c.sent > 0 ? <Retarget campaign={c} onPick={(filter) => navigate(`/whatsapp/campaigns/new?retarget=${c.id}&filter=${filter}`)} /> : null}
        </div>
      </div>

      <Recipients campaignId={c.id} name={c.name} />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this campaign?"
        description={`The ${formatCount(c.queue.pending)} people not yet messaged won't be. Messages already sent can't be recalled.`}
        confirmLabel="Cancel campaign"
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={() => void control('cancel')}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  )
}

function Progress({ done, total, paused }: { done: number; total: number; paused: boolean }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg">{paused ? 'Paused' : 'Sending'}</span>
        <span className="font-figure text-muted">
          {formatCount(done)} of {formatCount(total)} · {percent}%
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-pill bg-surface-alt"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Campaign send progress"
      >
        <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Breakdown({ campaign }: { campaign: WaCampaign }) {
  const counted = SEGMENTS.reduce((sum, s) => sum + (campaign.statuses[s.key] ?? 0), 0)

  return (
    <section>
      <CardHeader
        title="Delivery"
        subtitle="Where each message is now — updates as WhatsApp reports back"
        className="mb-3"
      />
      {counted === 0 ? (
        <p className="text-sm text-muted">No messages have been sent yet.</p>
      ) : (
        <>
          {/* Stacked bar for the shape; the legend below carries every number,
              so nothing depends on telling the colours apart. */}
          <div className="mb-4 flex h-3 gap-px overflow-hidden rounded-pill bg-surface-alt" aria-hidden>
            {SEGMENTS.map((s) => {
              const n = campaign.statuses[s.key] ?? 0
              return n > 0 ? (
                <div key={s.key} className={s.bar} style={{ width: `${(n / counted) * 100}%` }} />
              ) : null
            })}
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {SEGMENTS.map((s) => {
              const n = campaign.statuses[s.key] ?? 0
              return (
                <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-2 text-muted">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.bar}`} aria-hidden />
                    {s.label}
                  </dt>
                  <dd className="font-figure font-medium text-fg">
                    {formatCount(n)}
                    <span className="ml-1.5 text-xs text-muted">{Math.round((n / counted) * 100)}%</span>
                  </dd>
                </div>
              )
            })}
          </dl>
        </>
      )}
    </section>
  )
}

function ReasonList({
  title,
  rows,
  tone,
}: {
  title: string
  rows: { label: string; count: number }[]
  tone: string
}) {
  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 text-sm font-semibold text-fg">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 text-fg">{r.label}</span>
            <span className={`shrink-0 font-figure font-medium ${tone}`}>{formatCount(r.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const RETARGETS: { filter: WaRetargetFilter; label: string; needsClicks?: boolean }[] = [
  { filter: 'not_read', label: "Didn't read it" },
  { filter: 'failed', label: 'Message failed' },
  { filter: 'read', label: 'Read it' },
  { filter: 'not_clicked', label: "Didn't click", needsClicks: true },
  { filter: 'clicked', label: 'Clicked', needsClicks: true },
  { filter: 'replied', label: 'Replied' },
]

function Retarget({ campaign, onPick }: { campaign: WaCampaign; onPick: (filter: WaRetargetFilter) => void }) {
  return (
    <Card>
      <CardHeader title="Follow up" subtitle="A new campaign to the people who…" />
      <div className="flex flex-wrap gap-2">
        {RETARGETS.filter((r) => !r.needsClicks || campaign.engagement.clicks !== null).map((r) => (
          <Button key={r.filter} onClick={() => onPick(r.filter)}>
            {r.label}
          </Button>
        ))}
      </div>
    </Card>
  )
}

// ---- Recipients ----------------------------------------------------------------

const RECIPIENT_FILTERS: { value: '' | WaRecipientFilter; label: string }[] = [
  { value: '', label: 'Everyone' },
  { value: 'pending', label: 'Waiting to send' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
  { value: 'clicked', label: 'Clicked' },
  { value: 'replied', label: 'Replied' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
]

const QUEUE_LABEL: Record<WaRecipient['status'], { label: string; tone: 'neutral' | 'pending' | 'success' | 'danger' }> = {
  PENDING: { label: 'Waiting', tone: 'neutral' },
  SENDING: { label: 'Sending', tone: 'pending' },
  SENT: { label: 'Sent', tone: 'success' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

function Recipients({ campaignId, name }: { campaignId: string; name: string }) {
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const list = useAdminList<WaRecipient>(
    (query) => adminApi.listWaRecipients(campaignId, query),
    { keys: ['status'], pageSize: 25 },
  )

  const exportCsv = async () => {
    setExporting(true)
    try {
      const blob = await adminApi.exportWaRecipients(campaignId)
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign'
      downloadBlob(blob, `${slug}-recipients.csv`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not export', 'danger')
    } finally {
      setExporting(false)
    }
  }

  const columns: Column<WaRecipient>[] = [
    {
      header: 'Person',
      primary: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{r.name || formatWaId(r.waId)}</p>
          {r.name ? <p className="truncate text-xs text-muted">{formatWaId(r.waId)}</p> : null}
        </div>
      ),
    },
    {
      header: 'Queue',
      cell: (r) => <Chip tone={QUEUE_LABEL[r.status].tone}>{QUEUE_LABEL[r.status].label}</Chip>,
    },
    {
      header: 'WhatsApp',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <WaStatusChip status={r.lastStatus} />
          {r.clicked ? <Chip tone="brand">Clicked</Chip> : null}
        </span>
      ),
    },
    {
      header: 'Note',
      hideOnMobile: true,
      cell: (r) => {
        const note = r.lastStatus === 'failed' ? failureSummary(r.errorCode, r.errorTitle) : r.note
        return note ? (
          <p className="max-w-xs truncate text-sm text-muted" title={note}>
            {note}
          </p>
        ) : (
          <span className="text-sm text-muted">—</span>
        )
      },
    },
  ]

  return (
    <Card className="mt-4" padding="none">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <h2 className="text-base font-semibold text-fg">Recipients</h2>
        <Button disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>
      <Toolbar>
        <FilterSelect
          label="Show"
          value={list.filters['status'] ?? ''}
          onChange={(value) => list.setFilter('status', value)}
          options={RECIPIENT_FILTERS}
        />
      </Toolbar>
      <DataTable
        rows={list.rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        // Only people actually messaged have a conversation to open.
        onRowClick={(r) => {
          if (r.status === 'SENT' || r.status === 'FAILED') navigate(`/whatsapp/chats/${r.waId}`)
        }}
        empty={{ title: 'No one here', hint: 'Try another filter.' }}
      />
      <Pagination
        page={list.meta.page}
        totalPages={list.meta.totalPages}
        total={list.meta.total}
        onPage={list.setPage}
        busy={list.loading}
      />
    </Card>
  )
}
