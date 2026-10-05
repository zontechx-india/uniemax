import type { ReactNode } from 'react'

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'pending'
  | 'danger'
  | 'info'

const TONE: Record<BadgeTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-alt text-muted', dot: 'bg-muted' },
  brand: { pill: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  success: { pill: 'bg-success/12 text-success', dot: 'bg-success' },
  warning: { pill: 'bg-warning/12 text-warning', dot: 'bg-warning' },
  // Something is owed (setup unfinished, an order waiting) — not an error.
  pending: { pill: 'bg-pending-soft text-pending', dot: 'bg-pending' },
  danger: { pill: 'bg-danger/12 text-danger', dot: 'bg-danger' },
  info: { pill: 'bg-accent/10 text-accent', dot: 'bg-accent' },
}

/**
 * THE status badge (docs/DESIGN_GUIDELINES.md §7, §12) — "Live", "Hidden",
 * "3 waiting", an order status. 13px semibold on a soft tint, 24px tall, a
 * pill. It always carries its LABEL, and `dot` adds a shape cue, so the state
 * never depends on colour alone. Seller `StatusPill` and admin `Chip` are
 * this component under their old names.
 */
export function Badge({
  tone = 'neutral',
  dot = false,
  wrap = false,
  className = '',
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  /** Let long text wrap onto more lines instead of one. */
  wrap?: boolean
  className?: string
  children: ReactNode
}) {
  const t = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold ${
        wrap ? 'min-h-6 max-w-full py-0.5 whitespace-normal' : 'h-6 shrink-0 whitespace-nowrap'
      } ${t.pill} ${className}`}
    >
      {dot && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />}
      {children}
    </span>
  )
}
