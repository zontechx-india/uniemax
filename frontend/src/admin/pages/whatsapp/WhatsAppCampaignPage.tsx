import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { adminApi } from '../../features/adminApi'
import type { WaCampaign, WaStatus } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Card, CardHeader, Detail, ErrorState, PageHeader, Skeleton } from '../../ui/primitives'
import { StatTile } from '../../ui/StatTile'
import { formatCount, formatDateTime } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import { CampaignStateChip, usePolling, useWhatsAppStatus } from './whatsappUi'

/**
 * One campaign: send progress while it runs, then where each message ended
 * up. Polls every 3 s until the server marks it finished.
 */

const POLL_MS = 3_000

/** Furthest-along first is how people read a funnel; failed sits apart. */
const SEGMENTS: { key: WaStatus; label: string; bar: string }[] = [
  { key: 'read', label: 'Read', bar: 'bg-success' },
  { key: 'delivered', label: 'Delivered', bar: 'bg-accent' },
  { key: 'sent', label: 'Sent, not delivered yet', bar: 'bg-accent/40' },
  { key: 'accepted', label: 'Queued at WhatsApp', bar: 'bg-fg/20' },
  { key: 'failed', label: 'Failed', bar: 'bg-danger' },
]

export default function WhatsAppCampaignPage() {
  const { id = '' } = useParams()
  const status = useWhatsAppStatus()
  const { data, error, refresh } = useAdminQuery(() => adminApi.getWaCampaign(id), [id])
  usePolling(refresh, POLL_MS, Boolean(data && !data.finishedAt))

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <Skeleton rows={10} />

  const processed = Math.min(data.total, data.sent + data.skipped + data.failed)
  const rate = status.data?.sendRatePerSec ?? 20
  // Generous: the expected send time plus ten minutes. Past that with no
  // finish mark, the in-process sender almost certainly died with a restart.
  const expectedMs = (data.total / rate) * 1000 + 10 * 60_000
  const stalled = !data.finishedAt && Date.now() - new Date(data.createdAt).getTime() > expectedMs

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
        title={data.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStateChip finishedAt={data.finishedAt} />
            <span>
              {data.templateName} · {data.languageCode}
            </span>
          </span>
        }
      />

      {stalled ? (
        <Alert tone="warning" title="This campaign stopped before finishing" className="mb-4">
          The server most likely restarted while it was sending. The numbers below show how
          far it got; recipients after that point were not messaged.
        </Alert>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Recipients" value={formatCount(data.total)} />
        <StatTile label="Sent" value={formatCount(data.sent)} hint="Accepted by WhatsApp" />
        <StatTile label="Skipped" value={formatCount(data.skipped)} hint="Opted out or repeated" />
        <StatTile
          label="Failed"
          value={formatCount(data.failed)}
          hint="At send or after"
          tone={data.failed > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {data.finishedAt ? null : <Progress done={processed} total={data.total} />}
          <Breakdown campaign={data} />
        </Card>

        <Card>
          <CardHeader title="Details" />
          <dl>
            <Detail label="Template">{data.templateName}</Detail>
            <Detail label="Language">{data.languageCode}</Detail>
            <Detail label="Started">{formatDateTime(data.createdAt)}</Detail>
            <Detail label="Finished">{data.finishedAt ? formatDateTime(data.finishedAt) : '—'}</Detail>
            <Detail label="Send pace">{rate} per second</Detail>
          </dl>
          <p className="mt-3 text-xs text-muted">
            A message WhatsApp accepted and later reported as failed counts in both Sent and
            Failed.
          </p>
        </Card>
      </div>
    </>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg">Sending</span>
        <span className="font-figure text-muted">
          {formatCount(done)} of {formatCount(total)} · {pct}%
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
        <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${pct}%` }} />
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
                    <span className="ml-1.5 text-xs text-muted">
                      {Math.round((n / counted) * 100)}%
                    </span>
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
