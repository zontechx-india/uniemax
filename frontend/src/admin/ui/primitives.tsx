import { useState } from 'react'
import type { ReactNode } from 'react'
import { EyeIcon } from '../../shared/ui/form'
import { Badge } from '../../shared/ui/Badge'
import {
  Button as SharedButton,
  buttonClass as sharedButtonClass,
  type ButtonVariant,
} from '../../shared/ui/Button'
import { FIELD_LABEL, fieldClass, fieldNoteClass } from '../../shared/ui/field'
export { Card, CardHeader } from '../../shared/ui/Card'
export { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'
export type { ButtonVariant }

/**
 * The admin console's UI kit. Since the design-system clean-up
 * (docs/DESIGN_SYSTEM_PLAN.md) it is a thin layer over `shared/ui` — Card,
 * Badge, Button, field styles and the loading/empty/error states are the SAME
 * components the storefront uses, in their dense sizes — so the two apps are
 * one product (docs/DESIGN_GUIDELINES.md §7). Only console-specific shapes
 * (PageHeader, Detail rows, the password field) live here.
 *
 * Everything here is presentational: no data fetching, no routing.
 */

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

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
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
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
    <Badge tone={tone} className={className}>
      {children}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * The console's buttons are the shared `Button` at its dense size (36px) by
 * default — a console is scanned and clicked with a mouse, so rows of actions
 * stay compact. Pass `size="md"` for a form's main action.
 */
export function buttonClass({
  variant = 'secondary',
  size = 'sm',
  className = '',
}: { variant?: ButtonVariant; size?: 'sm' | 'md'; className?: string } = {}): string {
  return sharedButtonClass({ variant, size, className })
}

export function Button({
  children,
  variant = 'secondary',
  size = 'sm',
  type = 'button',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}) {
  return (
    <SharedButton type={type} variant={variant} size={size} className={className} {...rest}>
      {children}
    </SharedButton>
  )
}

// ---------------------------------------------------------------------------
// Form controls (console-density versions of the shared auth fields)
// ---------------------------------------------------------------------------

const FIELD = fieldClass({ dense: true })

export function TextInput({
  label,
  hint,
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className={FIELD_LABEL}>{label}</span> : null}
      <input className={FIELD} {...rest} />
      {hint ? <span className={fieldNoteClass()}>{hint}</span> : null}
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
      {label ? <span className={FIELD_LABEL}>{label}</span> : null}
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
      {hint ? <span className={fieldNoteClass()}>{hint}</span> : null}
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
      {label ? <span className={FIELD_LABEL}>{label}</span> : null}
      <textarea className={fieldClass({ dense: true, multiline: true, className: 'resize-y' })} {...rest} />
      {hint ? <span className={fieldNoteClass()}>{hint}</span> : null}
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
      {label ? <span className={FIELD_LABEL}>{label}</span> : null}
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

/** Label/value row — the building block of every detail panel. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-fg">{children}</dd>
    </div>
  )
}
