import type { ReactNode } from 'react'
import { Badge } from '../../../../shared/ui/Badge'

export type StatusTone = 'success' | 'pending' | 'brand' | 'danger' | 'neutral'

/**
 * The seller workspace's status badge — the shared `Badge` with a dot by
 * default ("Live", "Not live yet", "3 waiting").
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
  wrap?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Badge tone={tone} dot={dot} wrap={wrap} className={className}>
      {children}
    </Badge>
  )
}
