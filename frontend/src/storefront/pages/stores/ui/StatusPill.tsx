import type { ReactNode } from 'react'

export type StatusTone = 'success' | 'pending' | 'brand' | 'danger' | 'neutral'

const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: 'bg-success/12 text-success', dot: 'bg-success' },
  pending: { pill: 'bg-pending-soft text-pending', dot: 'bg-pending' },
  brand: { pill: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  danger: { pill: 'bg-danger/12 text-danger', dot: 'bg-danger' },
  neutral: { pill: 'bg-fg/6 text-muted', dot: 'bg-muted' },
}

/**
 * One badge style for the seller workspace — "Live", "Not live yet",
 * "Hidden", "3 waiting". 12px at its smallest (the old pills were 10–11px),
 * with a dot so the state still reads to someone who skims the colour, not
 * the word.
 */
export function StatusPill({
  tone = 'neutral',
  dot = true,
  wrap = false,
  className = '',
  children,
}: {
  tone?: StatusTone
  dot?: boolean
  /** Let long text (a delivery rule) wrap onto more lines instead of one. */
  wrap?: boolean
  className?: string
  children: ReactNode
}) {
  const t = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-semibold ${
        wrap ? 'min-h-6 max-w-full py-0.5 whitespace-normal' : 'h-6 shrink-0 whitespace-nowrap'
      } ${t.pill} ${className}`}
    >
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  )
}
