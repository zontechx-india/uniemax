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
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-brand-contrast shadow-[0_6px_18px_-8px_var(--cta-glow)]">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-heading text-[22px] font-bold leading-tight text-fg">
            {title}
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="flex shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </header>
  )
}
