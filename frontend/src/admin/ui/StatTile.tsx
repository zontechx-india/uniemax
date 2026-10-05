import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from './charts'

/**
 * A single headline number.
 *
 * Not every measure deserves a chart — a total is best read as a total. The
 * optional sparkline adds *shape* without pretending to be a plot: no axes,
 * no labels, no tooltip, since the tile's job is the number.
 *
 * A tile with a `to` becomes a link, which is how the dashboard hands off to
 * the page that can actually act on the number.
 */
export function StatTile({
  label,
  value,
  hint,
  trend,
  series = 1,
  to,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: ReactNode
  /** Optional sparkline data (raw values, oldest first). */
  trend?: number[]
  series?: 1 | 2
  to?: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  const tones = {
    default: 'border-line',
    warning: 'border-warning/40',
    danger: 'border-danger/40',
  }

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-figure text-2xl font-bold text-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      {trend && trend.length > 1 ? (
        <div className="mt-3">
          <Sparkline values={trend} series={series} />
        </div>
      ) : null}
    </>
  )

  const className = `block rounded-lg border ${tones[tone]} bg-surface p-4 ${
    to ? 'transition-colors hover:bg-surface-alt' : ''
  }`

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
