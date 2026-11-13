import type { ComponentType, ReactNode } from 'react'

/**
 * The heading every seller section opens with: an icon chip, the section's
 * name, ONE plain sentence on what it is for, and an optional action.
 *
 * Replaces the `h2 + p` pair that about twelve pages copied by hand. The
 * sentence is required on purpose — a seller who does not read well leans on
 * it (and on the icon) to know they landed in the right place.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description: ReactNode
  /** A `Button` / `buttonClass` link — sits beside the title from `sm` up,
   *  below it on a phone where it gets the full width. */
  action?: ReactNode
}) {
  // Phones get a smaller tile, title and sentence: on a 360px screen the
  // full-size header took a third of the first view before any content.
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        {Icon && (
          // A flat tint, no gradient or glow: the page's main button is the
          // one solid colour, and the icon only says where the seller is.
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand sm:h-10 sm:w-10">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold leading-tight text-fg sm:text-xl">
            {title}
          </h2>
          <p className="mt-0.5 text-hint leading-snug text-muted sm:mt-1 sm:text-sm sm:leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      {action && <div className="flex shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </header>
  )
}
