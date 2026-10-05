import type { ElementType, ReactNode } from 'react'

/**
 * THE card (docs/DESIGN_GUIDELINES.md §10): a flat surface, a 1px border,
 * 12px corners — no shadow, no glass. Use one to group related things;
 * never put a card inside a card (use a divider or a heading instead).
 *
 * `padding`: `md` (16 → 20px) for most cards, `lg` (20 → 24px) for a page's
 * main panel, `none` for edge-to-edge lists (rows bring their own padding).
 */
export function Card({
  as: Tag = 'section',
  padding = 'md',
  className = '',
  children,
}: {
  as?: ElementType
  padding?: 'none' | 'md' | 'lg'
  className?: string
  children: ReactNode
}) {
  const pad = padding === 'none' ? '' : padding === 'lg' ? 'p-5 sm:p-6' : 'p-4 sm:p-5'
  return (
    <Tag className={`rounded-lg border border-line bg-surface ${pad} ${className}`}>{children}</Tag>
  )
}

/** A card's title row: title (subtitle size), optional muted line, optional action. */
export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}
