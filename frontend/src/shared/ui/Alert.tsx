import type { ReactNode } from 'react'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<AlertTone, string> = {
  info: 'border-accent/30 bg-accent/8 text-fg',
  success: 'border-success/35 bg-success/8 text-fg',
  warning: 'border-warning/40 bg-warning/10 text-fg',
  danger: 'border-danger/35 bg-danger/8 text-fg',
}

const ICON_TONE: Record<AlertTone, string> = {
  info: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * An inline message about the page or form (docs/DESIGN_GUIDELINES.md §8,
 * §12, §14). The tone is carried by an ICON and the words as well as the
 * colour, so it never relies on colour alone; the text itself stays full ink
 * for contrast. Optional `title` for a bold first line and `action` for the
 * fix ("Try again").
 *
 * `danger` alerts are announced (`role="alert"`); the rest are polite
 * (`role="status"`).
 */
export function Alert({
  tone = 'info',
  title,
  action,
  className = '',
  children,
}: {
  tone?: AlertTone
  title?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${TONE[tone]} ${className}`}
    >
      <AlertIcon tone={tone} />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div> : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    </div>
  )
}

function AlertIcon({ tone }: { tone: AlertTone }) {
  const path =
    tone === 'success'
      ? 'M5 12.5l4.5 4.5L19 7.5'
      : tone === 'info'
        ? 'M12 11v5M12 7.5h.01'
        : 'M12 8v5M12 16.5h.01'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`mt-px h-5 w-5 shrink-0 ${ICON_TONE[tone]}`}
    >
      {tone === 'warning' ? (
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
      <path d={path} />
    </svg>
  )
}
