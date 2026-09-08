import { useState } from 'react'
import type { ReactNode } from 'react'
import { EyeIcon } from '../../shared/ui/form'

/**
 * The admin console's own UI kit — deliberately ISOLATED from the storefront.
 *
 * The two apps ship as separate bundles and serve different people: a console
 * is dense, tabular and keyboard-driven, while the storefront is spacious and
 * promotional. Sharing components would force every change to satisfy both.
 * What IS shared is the token layer (`index.css`) — colors, type, radius —
 * so the two look like one product without being one codebase.
 *
 * Everything here is presentational: no data fetching, no routing.
 */

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-surface ${padded ? 'p-4 sm:p-5' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-base font-semibold text-fg sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

/** Page title row — every page opens with exactly one. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-semibold text-fg sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ChipTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'pending'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-alt text-muted border-line',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-accent/10 text-accent border-accent/30',
  brand: 'bg-brand/15 text-fg border-brand/40',
  // Setup that is unfinished — NOT a warning (nothing is wrong) and not
  // danger (nothing is broken); the seller simply owes the platform
  // something. Shares the storefront's `--pending` orange so a seller and an
  // admin looking at the same store see the same color mean the same thing.
  pending: 'bg-pending-soft text-pending border-pending/30',
}

/**
 * A status chip always carries its LABEL — color is a second signal, never
 * the only one, so the state survives a colorblind reader or a printout.
 */
export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: ChipTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-xs font-medium ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export function Button({
  children,
  variant = 'secondary',
  type = 'button',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const tones = {
    primary: 'bg-brand text-brand-contrast hover:bg-brand-hover',
    secondary: 'border border-line bg-surface text-fg hover:bg-surface-alt',
    ghost: 'text-muted hover:bg-surface-alt hover:text-fg',
    danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
  }
  return (
    <button type={type} className={`${BUTTON_BASE} ${tones[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form controls (console-density versions of the shared auth fields)
// ---------------------------------------------------------------------------

const FIELD =
  'w-full rounded-md border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none'

export function TextInput({
  label,
  hint,
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="mb-1 block text-sm font-medium text-fg">{label}</span> : null}
      <input className={FIELD} {...rest} />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

/**
 * Password field with a show/hide toggle — the same `EyeIcon` the two login
 * pages use, so the control means the same thing everywhere.
 *
 * An admin setting someone else's password can't rely on "type it twice" to
 * catch a slip (there is no second field, and a wrong password locks that
 * person out until it's reset again), so being able to *read* what was typed
 * is the check. Visibility state lives here rather than in the caller: it is
 * presentation, and every caller would otherwise repeat the same `useState`.
 */
export function PasswordInput({
  label,
  hint,
  className = '',
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  hint?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className={`block ${className}`}>
      {label ? <span className="mb-1 block text-sm font-medium text-fg">{label}</span> : null}
      <div className="relative">
        {/* pr-11 keeps the text clear of the toggle at every width. */}
        <input type={visible ? 'text' : 'password'} className={`${FIELD} pr-11`} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function TextArea({
  label,
  hint,
  className = '',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="mb-1 block text-sm font-medium text-fg">{label}</span> : null}
      <textarea className={`${FIELD} min-h-20 resize-y`} {...rest} />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function SelectInput({
  label,
  options,
  className = '',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  options: { value: string; label: string }[]
}) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="mb-1 block text-sm font-medium text-fg">{label}</span> : null}
      <select className={`${FIELD} appearance-none pr-8`} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-heading text-base font-medium text-fg">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </div>
  )
}

/** Shimmer placeholder. `rows` blocks at the given height. */
export function Skeleton({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-md bg-surface-alt" />
      ))}
    </div>
  )
}

/** Label/value row — the building block of every detail panel. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-fg">{children}</dd>
    </div>
  )
}
