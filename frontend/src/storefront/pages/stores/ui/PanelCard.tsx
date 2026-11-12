import type { ComponentType, ReactNode } from 'react'

/**
 * The one card of the seller workspace, in the admin console's pattern
 * (ADMIN_UI_THEME.md): a flat white card with a 1px border. A card with a
 * title gets a HEADER BAR — icon, title, one plain sentence, and a status or
 * action on the right — divided from the body by a line, so a page of cards
 * scans as a list of jobs. Sizes stay the seller's (16px title, 14px line).
 *
 * It replaces three hand-rolled card styles (Business `Card`, Footer
 * `SectionCard`, Shipping's border-top sections) and the repeated
 * `rounded-lg border border-line p-4`.
 *
 * Long lists go INSIDE one card as plain rows (`ActionRow`), with
 * `padded={false}` so the rows reach the card's edges.
 */
export function PanelCard({
  id,
  title,
  description,
  icon: Icon,
  aside,
  padded = true,
  className = '',
  children,
}: {
  /** Anchor for deep links ("Fix this" jumps here); the card takes focus. */
  id?: string
  title?: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Right side of the header: a status pill or a small action. */
  aside?: ReactNode
  /** Pad the body. Off for edge-to-edge rows. */
  padded?: boolean
  className?: string
  children?: ReactNode
}) {
  const hasHeader = title !== undefined || aside !== undefined

  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`ws-card rounded-lg outline-none ${className}`}
    >
      {hasHeader && (
        <header
          className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${
            children !== undefined ? 'border-b border-line' : ''
          }`}
        >
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title !== undefined && (
              <h3 className="font-heading text-base font-semibold leading-snug text-fg">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      {children !== undefined && <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>}
    </section>
  )
}
