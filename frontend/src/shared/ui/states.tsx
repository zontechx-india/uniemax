import type { ComponentType, ReactNode } from 'react'
import { Button } from './Button'

/**
 * Loading, empty and error states (docs/DESIGN_GUIDELINES.md §14) — every
 * data-driven view uses these instead of a bare "Loading…" or a blank area.
 */

/** Shimmer lines — `rows` blocks of `height` (default 36px). */
export function Skeleton({
  rows = 3,
  height = 'h-9',
  className = '',
}: {
  rows?: number
  height?: string
  className?: string
}) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`${height} animate-pulse rounded-md bg-surface-alt`} />
      ))}
    </div>
  )
}

/**
 * A whole-page placeholder: a title bar and content blocks, announced to
 * screen readers. Use where a page has not loaded yet.
 */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4 py-2">
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface-alt" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-surface-alt" />
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-28 animate-pulse rounded-lg bg-surface-alt" />
      </div>
      <Skeleton rows={3} />
    </div>
  )
}

/**
 * Nothing here yet: what goes here, in one sentence, and the ONE action that
 * fills it. `icon` is optional — a flat soft-tint chip, not a glow.
 * `steps` show the road ahead as numbered pictures.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  steps,
  compact = false,
}: {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
  /** A `Button` or `buttonClass` link. */
  action?: ReactNode
  steps?: { icon: ComponentType<{ className?: string }>; label: string }[]
  /** Less padding — inside a table or a small card. */
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center px-4 text-center ${compact ? 'py-8' : 'py-10 sm:py-14'}`}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      ) : null}

      {steps && steps.length > 0 && (
        <ol className="mt-6 flex w-full max-w-md items-start justify-center gap-2">
          {steps.map(({ icon: StepIcon, label }, index) => (
            <li key={label} className="flex flex-1 flex-col items-center gap-2">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-surface-alt text-fg">
                <StepIcon className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-contrast">
                  {index + 1}
                </span>
              </span>
              <span className="text-xs font-medium text-fg">{label}</span>
            </li>
          ))}
        </ol>
      )}

      {action ? (
        <div className="mt-6 flex w-full justify-center [&>*]:w-full sm:[&>*]:w-auto">{action}</div>
      ) : null}
    </div>
  )
}

/** Something failed: what happened, in plain words, and a way to recover. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  compact = false,
}: {
  title?: ReactNode
  message: ReactNode
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center px-4 text-center ${compact ? 'py-8' : 'py-10 sm:py-14'}`}
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-danger/10 text-danger">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-7 w-7"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5h.01" />
        </svg>
      </span>
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
