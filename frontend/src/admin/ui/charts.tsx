import { useId, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Charts, hand-drawn as SVG — no charting dependency.
 *
 * Design rules these follow (they are not stylistic preferences):
 *   - **One axis, one series.** Never two y-scales on one plot. The trend
 *     chart shows revenue OR orders, switched by a toggle, because ₹ and
 *     counts share no scale and overlaying them invents a correlation.
 *   - **Color is assigned by entity, not rank** — `--chart-1` is always
 *     money, `--chart-2` is always counts, whatever a filter does.
 *   - **Colors come from tokens**, never a literal hex, so light and dark
 *     each use steps validated against their own surface (see index.css).
 *   - **Thin marks, recessive grid**, values direct-labeled selectively
 *     rather than on every point.
 *   - **Hover is part of the chart**, not an enhancement: every plot has a
 *     tooltip, since an HTML chart that can't be interrogated wastes the
 *     medium.
 */

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function ChartFrame({
  title,
  subtitle,
  actions,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      {children}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  )
}

/** Floating value readout, positioned in percentages so it tracks any width. */
function Tooltip({ x, children }: { x: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-floating"
      style={{ left: `${Math.min(Math.max(x, 12), 88)}%` }}
    >
      {children}
    </div>
  )
}

const niceCeiling = (value: number) => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

// ---------------------------------------------------------------------------
// Trend (area + line)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  label: string
  value: number
}

/**
 * Single-series trend. The area is a soft wash under a 2px line so the shape
 * reads at a glance; the crosshair plus tooltip give the exact number, which
 * is why no point carries a permanent label.
 */
export function TrendChart({
  points,
  series = 1,
  formatValue,
  height = 200,
}: {
  points: TrendPoint[]
  /** 1 = money (chart-1), 2 = counts (chart-2). Fixed per entity. */
  series?: 1 | 2
  formatValue: (value: number) => string
  height?: number
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No activity in this period.</p>
  }

  const color = series === 1 ? 'var(--chart-1)' : 'var(--chart-2)'
  const max = niceCeiling(Math.max(...points.map((point) => point.value)))
  // A viewBox with preserveAspectRatio="none" lets the SVG stretch to any
  // container width while the maths stays in simple 0..100 units.
  const stepX = points.length > 1 ? 100 / (points.length - 1) : 0
  const toY = (value: number) => 100 - (value / max) * 100

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${index * stepX},${toY(point.value)}`)
    .join(' ')
  const area = `${line} L100,100 L0,100 Z`
  const active = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      {active ? (
        <Tooltip x={(hover ?? 0) * stepX}>
          <span className="block font-medium text-fg">{formatValue(active.value)}</span>
          <span className="block text-muted">{active.label}</span>
        </Tooltip>
      ) : null}

      <div className="relative" style={{ height }}>
        {/* Recessive grid — four bands, drawn behind everything. */}
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="border-t border-chart-grid" />
          ))}
        </div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={`Trend across ${points.length} days`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null ? (
            <g>
              <line
                x1={hover * stepX}
                y1="0"
                x2={hover * stepX}
                y2="100"
                stroke={color}
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                opacity="0.6"
              />
              <circle
                cx={hover * stepX}
                cy={toY(points[hover]!.value)}
                r="4"
                fill={color}
                stroke="var(--surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
        </svg>

        {/* Hit targets: full-height columns, far bigger than the marks. */}
        <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
          {points.map((point, index) => (
            <button
              key={point.label}
              type="button"
              className="h-full flex-1 cursor-default"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              aria-label={`${point.label}: ${formatValue(point.value)}`}
            />
          ))}
        </div>
      </div>

      {/* Only the ends and the middle are labeled — a tick per day is noise. */}
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{points[0]!.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]!.label}</span> : null}
        <span>{points[points.length - 1]!.label}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Horizontal bars
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string
  value: number
  /** Optional per-bar tint for reserved status meanings (e.g. cancelled). */
  color?: string
  onClick?: () => void
}

/**
 * Horizontal bars for comparing named categories (the order pipeline, top
 * stores). Horizontal because the labels are words: a vertical bar chart
 * would tilt them 45° and cost more to read than the data is worth.
 *
 * Values are direct-labeled at the end of each row, so no axis is needed.
 */
export function BarList({
  data,
  formatValue = (value: number) => value.toLocaleString('en-IN'),
}: {
  data: BarDatum[]
  formatValue?: (value: number) => string
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Nothing to show yet.</p>
  }
  const max = Math.max(...data.map((item) => item.value), 1)

  return (
    <ul className="space-y-2.5">
      {data.map((item) => {
        const Row = item.onClick ? 'button' : 'div'
        return (
          <li key={item.label}>
            <Row
              {...(item.onClick ? { type: 'button' as const, onClick: item.onClick } : {})}
              className={`block w-full text-left ${item.onClick ? 'group cursor-pointer' : ''}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-fg group-hover:text-brand">{item.label}</span>
                <span className="shrink-0 font-medium text-fg">{formatValue(item.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-pill bg-surface-alt">
                <div
                  className="h-full rounded-pill transition-[width] duration-500"
                  style={{
                    width: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%`,
                    background: item.color ?? 'var(--chart-2)',
                  }}
                />
              </div>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

export interface DonutSlice {
  label: string
  value: number
  color: string
}

/**
 * Donut for a two-or-three-way split of one whole (online vs cash). Kept to
 * few slices on purpose — past three, angles stop being comparable and a
 * `BarList` is the honest choice.
 *
 * The 2px surface-colored gap between segments is what keeps adjacent slices
 * legible without a border.
 */
export function Donut({
  slices,
  centerLabel,
  centerValue,
  formatValue,
}: {
  slices: DonutSlice[]
  centerLabel: string
  centerValue: string
  formatValue: (value: number) => string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const [hover, setHover] = useState<string | null>(null)

  if (total <= 0) {
    return <p className="py-8 text-center text-sm text-muted">No payments yet.</p>
  }

  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {slices.map((slice) => {
            const fraction = slice.value / total
            // 2px visual gap between segments, expressed in path units.
            const dash = Math.max(fraction * circumference - 2, 0)
            const element = (
              <circle
                key={slice.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={hover === slice.label ? 15 : 13}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                className="cursor-default transition-[stroke-width]"
                onMouseEnter={() => setHover(slice.label)}
                onMouseLeave={() => setHover(null)}
              />
            )
            offset += fraction * circumference
            return element
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading text-lg font-semibold text-fg">{centerValue}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>

      {/* Legend doubles as the value table — identity is never color alone. */}
      <ul className="min-w-40 space-y-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ background: slice.color }}
              aria-hidden
            />
            <span className="flex-1 text-muted">{slice.label}</span>
            <span className="font-medium text-fg">{formatValue(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparkline (inside stat tiles)
// ---------------------------------------------------------------------------

/** Bare trend shape for a tile — no axes, no labels, no interaction. */
export function Sparkline({ values, series = 1 }: { values: number[]; series?: 1 | 2 }) {
  if (values.length < 2) return null
  const color = series === 1 ? 'var(--chart-1)' : 'var(--chart-2)'
  const max = Math.max(...values, 1)
  const step = 100 / (values.length - 1)
  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${index * step},${100 - (value / max) * 100}`)
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
