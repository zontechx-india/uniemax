import type { ComponentType, ReactNode } from 'react'

/**
 * The one card of the seller workspace — frosted glass over the
 * `.seller-canvas` colour field.
 *
 * It replaces three hand-rolled card styles (Business `Card`, Footer
 * `SectionCard`, Shipping's border-top sections) and the repeated
 * `rounded-lg border border-line p-4`. A card optionally carries a header —
 * icon chip, title, one plain sentence, and a status or action on the right —
 * so a page of cards scans as a list of jobs.
 *
 * Long lists go INSIDE one card as plain rows (`ActionRow`); never a glass
 * card per row — every blurred layer costs a cheap phone a frame.
 */
export function GlassCard({
  id,
  title,
  description,
  icon: Icon,
  aside,
  padded = true,
  className = '',
  children,
}: {
  /** Anchor target — setup chips scroll to a card by id. */
  id?: string
  title?: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Right of the title: a `StatusPill`, or a small action. */
  aside?: ReactNode
  /** False for edge-to-edge content (a list of rows that brings its own). */
  padded?: boolean
  /** Layout only (margins, `scroll-mt-*`, a highlight ring). */
  className?: string
  children?: ReactNode
}) {
  const hasHeader = title !== undefined || aside !== undefined

  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`glass rounded-glass outline-none ${padded ? 'p-4 sm:p-5' : ''} ${className}`}
    >
      {hasHeader && (
        <header
          className={`flex items-start gap-3 ${padded ? '' : 'px-4 pt-4 sm:px-5 sm:pt-5'}`}
        >
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title !== undefined && (
              <h3 className="font-heading text-[17px] font-semibold leading-snug text-fg">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={hasHeader ? 'mt-4' : ''}>{children}</div>
      )}
    </section>
  )
}
