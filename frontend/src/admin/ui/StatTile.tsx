import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from './charts'

/**
 * A single headline number (ADMIN_UI_THEME.md §7.3): a small label, a 20px
 * figure, an optional sub-line. Place tiles in a `<div className="stats">`
 * row — an auto-fit grid, 170px minimum, two per row on a phone.
 *
 * The optional sparkline adds *shape* without pretending to be a plot: no
 * axes, no labels, no tooltip, since the tile's job is the number. A tile
 * with a `to` becomes a link to the page that can act on the number.
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
  const toneClass = tone === 'warning' ? 't-warn' : tone === 'danger' ? 't-danger' : ''

  const body = (
    <>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      {hint ? <span className="stat-s">{hint}</span> : null}
      {trend && trend.length > 1 ? (
        <span className="spark block">
          <Sparkline values={trend} series={series} />
        </span>
      ) : null}
    </>
  )

  return to ? (
    <Link to={to} className={`stat ${toneClass}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat ${toneClass}`}>{body}</div>
  )
}
