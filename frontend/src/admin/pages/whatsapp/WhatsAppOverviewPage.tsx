import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { adminApi } from '../../features/adminApi'
import type { WaOverview } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Button, Chip, ErrorState, Skeleton } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { StatTile } from '../../ui/StatTile'
import { ChartFrame, TrendChart } from '../../ui/charts'
import { formatCount, formatDateTime, formatDayTick, formatRelative } from '../../ui/format'
import { CampaignStatusChip, WhatsAppShell } from './whatsappUi'

/**
 * Overview — the last 30 days at a glance, and the number's health.
 *
 * Quality rating and messaging limit come from Meta: a falling rating (people
 * blocking or reporting) is the early warning before Meta restricts the
 * number, so it leads the page.
 */

const QUALITY: Record<string, { label: string; tone: ChipTone; hint: string }> = {
  GREEN: { label: 'High', tone: 'success', hint: 'People are engaging well with your messages.' },
  YELLOW: {
    label: 'Medium',
    tone: 'warning',
    hint: 'Some people are blocking or reporting messages — send less often, and only to people who want them.',
  },
  RED: {
    label: 'Low',
    tone: 'danger',
    hint: 'Meta may soon limit this number. Pause marketing campaigns and review who you are messaging.',
  },
}

/** "TIER_1K" → "1,000 people / 24h". */
function limitLabel(tier: string | null): string {
  if (!tier) return '—'
  if (tier === 'TIER_UNLIMITED') return 'Unlimited'
  const match = /^TIER_(\d+)(K?)$/.exec(tier)
  if (!match) return tier
  const n = Number(match[1]) * (match[2] ? 1000 : 1)
  return `${n.toLocaleString('en-IN')} people / 24h`
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')

export default function WhatsAppOverviewPage() {
  const navigate = useNavigate()
  return (
    <WhatsAppShell
      actions={
        <Button variant="primary" size="md" onClick={() => navigate('/whatsapp/campaigns/new')}>
          New campaign
        </Button>
      }
    >
      {() => <Overview />}
    </WhatsAppShell>
  )
}

function Overview() {
  const { data, error, refresh } = useAdminQuery(() => adminApi.waOverview(), [])
  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <Skeleton rows={8} className="p-4" />

  const m = data.messages
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <PhoneHealth overview={data} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sent · 30 days" value={formatCount(m.sent)} hint={`${formatCount(m.fromAutomations)} by automations`} />
        <StatTile label="Delivered" value={pct(m.delivered, m.sent)} hint={`${formatCount(m.delivered)} messages`} />
        <StatTile label="Read" value={pct(m.read, m.sent)} hint={`${formatCount(m.read)} messages`} />
        <StatTile
          label="Failed"
          value={formatCount(m.failed)}
          hint={pct(m.failed, m.sent) + ' of sent'}
          tone={m.failed > 0 && m.failed / Math.max(m.sent, 1) > 0.1 ? 'danger' : 'default'}
        />
        <StatTile label="Replies received" value={formatCount(m.received)} to="/whatsapp/inbox" />
        <StatTile label="Link clicks" value={formatCount(m.clicks)} hint="Tracked campaign buttons" />
        <StatTile
          label="Marketing consent"
          value={formatCount(data.contacts.optedIn)}
          hint={`of ${formatCount(data.contacts.total)} contacts`}
          to="/whatsapp/audiences"
        />
        <StatTile
          label="Opted out"
          value={formatCount(data.contacts.optedOut)}
          hint="Sent STOP"
          tone={data.contacts.optedOut > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartFrame title="Messages sent" subtitle="Per day, last 30 days (India time)">
            <TrendChart points={dailySeries(data, 'OUT')} series={2} formatValue={formatCount} />
          </ChartFrame>
        </div>
        <RecentCampaigns overview={data} />
      </div>
    </div>
  )
}

/** One point per day, zero-filled, oldest first. */
function dailySeries(data: WaOverview, direction: 'IN' | 'OUT') {
  const counts = new Map<string, number>()
  for (const row of data.daily) {
    if (row.direction === direction) counts.set(row.day.slice(0, 10), row.count)
  }
  const points: { label: string; value: number }[] = []
  const start = new Date(data.since)
  for (let i = 0; i <= 30; i += 1) {
    const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
    points.push({ label: formatDayTick(day), value: counts.get(day) ?? 0 })
  }
  return points
}

function PhoneHealth({ overview }: { overview: WaOverview }) {
  if (!overview.phone) {
    return (
      <Alert tone="warning" title="Couldn't read the number's health from WhatsApp">
        {overview.phoneError ?? 'Meta did not answer.'} The rest of this page is from our own records.
      </Alert>
    )
  }
  const p = overview.phone
  const quality = p.qualityRating ? QUALITY[p.qualityRating] : undefined
  return (
    <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Business number</p>
        <p className="mt-1 font-figure text-lg font-semibold text-fg">{p.number ?? '—'}</p>
        <p className="text-sm text-muted">{p.name ?? ''}</p>
      </div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Quality rating</dt>
          <dd className="mt-1">
            {quality ? <Chip tone={quality.tone}>{quality.label}</Chip> : <span className="text-sm text-fg">Not rated yet</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Can start conversations with</dt>
          <dd className="mt-1 text-sm font-medium text-fg">{limitLabel(p.messagingLimit)}</dd>
        </div>
      </dl>
      {quality ? <p className="w-full text-sm text-muted">{quality.hint}</p> : null}
    </section>
  )
}

function RecentCampaigns({ overview }: { overview: WaOverview }) {
  return (
    <ChartFrame
      title="Recent campaigns"
      subtitle={
        overview.activeCampaigns > 0
          ? `${formatCount(overview.activeCampaigns)} scheduled, sending or paused`
          : 'None running right now'
      }
      footer={
        <Link to="/whatsapp/campaigns" className="text-sm font-medium text-accent hover:underline">
          All campaigns →
        </Link>
      }
    >
      {overview.recentCampaigns.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No campaigns yet. Start one with New campaign.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {overview.recentCampaigns.map((c) => (
            <li key={c.id}>
              <Link
                to={`/whatsapp/campaigns/${c.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:text-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.status === 'SCHEDULED' && c.scheduledAt
                      ? `Starts ${formatDateTime(c.scheduledAt)}`
                      : `${formatCount(c.sent)} of ${formatCount(c.total)} sent · ${formatRelative(c.createdAt)}`}
                  </span>
                </span>
                <CampaignStatusChip status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  )
}
