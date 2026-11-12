import { useState } from 'react'
import type { ButtonHTMLAttributes, ComponentType, ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EyeIcon } from '../../shared/ui/form'
import {
  Button as SharedButton,
  buttonClass as sharedButtonClass,
  type ButtonVariant,
} from '../../shared/ui/Button'
import { FIELD_LABEL, fieldClass, fieldNoteClass } from '../../shared/ui/field'
import { Icon } from '../layout/icons'
import type { IconName } from '../layout/icons'
export type { ButtonVariant }

/**
 * The admin console's UI kit, drawn in the console theme (ADMIN_UI_THEME.md,
 * styles in admin/admin.css): the page header, cards with a header bar,
 * status badges, the icon button, the segmented control and the
 * loading / empty / error states. Buttons and form fields are still the
 * shared `shared/ui` ones — admin.css only makes them denser.
 *
 * Everything here is presentational: no data fetching, no routing.
 */

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/**
 * Page title row — every page opens with exactly one. `back` adds the small
 * "‹ Orders" link above the title on a detail page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  badge,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  /** A status badge beside the title. */
  badge?: ReactNode
}) {
  return (
    <header className="ph">
      {back ? (
        <Link to={back.to} className="ph-back">
          <Icon name="back" size={14} />
          {back.label}
        </Link>
      ) : null}
      <div className="ph-row">
        <div className="ph-t">
          <h1>
            {title}
            {badge}
          </h1>
          {subtitle ? <div>{subtitle}</div> : null}
        </div>
        {actions ? <div className="ph-a">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * THE console card: surface, 1px border, 10px corners. `padding`: `md`
 * (14 / 16px) for most cards, `lg` for a page's main panel, `none` for
 * edge-to-edge lists and tables. A `CardHeader` placed first becomes the
 * card's header bar, edge to edge, whatever the padding.
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
  const pad = padding === 'none' ? '' : padding === 'lg' ? 'pad-lg' : 'pad'
  return <Tag className={`card ${pad} ${className}`}>{children}</Tag>
}

/** A card's header bar: title, optional muted line, optional action. */
export function CardHeader({
  title,
  subtitle,
  action,
  count,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  /** A small count bubble after the title. */
  count?: number
  className?: string
}) {
  return (
    <header className={`card-h ${className}`}>
      <div className="min-w-0">
        <h2>
          {title}
          {count !== undefined ? <span className="cnt">{count}</span> : null}
        </h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

/** A padded body under a `CardHeader` in a `padding="none"` card. */
export function CardBody({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card-b ${className}`}>{children}</div>
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

const CHIP_CLASS: Record<ChipTone, string> = {
  neutral: 'st-neutral',
  success: 'st-success',
  warning: 'st-warn',
  danger: 'st-danger',
  info: 'st-info',
  brand: 'st-brand',
  pending: 'st-pending',
}

/**
 * A status badge: a soft tint of the tone with a 6px dot. It always carries
 * its LABEL — colour is a second signal, never the only one.
 */
export function Chip({
  children,
  tone = 'neutral',
  wrap = false,
  className = '',
}: {
  children: ReactNode
  tone?: ChipTone
  /** Let long text wrap instead of staying on one line. */
  wrap?: boolean
  className?: string
}) {
  return (
    <span className={`st ${CHIP_CLASS[tone]} ${wrap ? 'wrap' : ''} ${className}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  )
}

/** Small count bubble — "Pending 3". `alert` tints it amber. */
export function Count({ value, alert = false }: { value: number; alert?: boolean }) {
  return <span className={`cnt ${alert ? 'alert' : ''}`}>{value.toLocaleString('en-IN')}</span>
}

// ---------------------------------------------------------------------------
// Icon button + segmented control
// ---------------------------------------------------------------------------

/**
 * A 30×30 icon-only button (menu, close, sign out, pager arrows). The label
 * is required: it is both the `aria-label` and the hover title.
 */
export function IconButton({
  icon,
  label,
  danger = false,
  className = '',
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon?: IconName
  label: string
  danger?: boolean
  /** Extra content drawn over the icon (an unread badge). */
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ibtn ${danger ? 'danger' : ''} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
}

/** A segmented control — "7d · 30d · 90d", "Revenue · Orders". */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  /** Names the group for screen readers. */
  label: string
}) {
  return (
    <div className="segc" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading, empty and error states (every data page has all three)
// ---------------------------------------------------------------------------

/** Shimmer bones — `rows` bars of `height` (a Tailwind height class). */
export function Skeleton({
  rows = 3,
  height = 'h-8',
  className = '',
}: {
  rows?: number
  height?: string
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`skel ${height}`} />
      ))}
    </div>
  )
}

/** A whole page loading: title bar, a stats row and table rows. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="skel mb-2 h-6 w-56 max-w-full" />
      <div className="skel mb-5 h-4 w-80 max-w-full" />
      <div className="stats">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skel h-[70px]" />
        ))}
      </div>
      <div className="card pad">
        <Skeleton rows={6} />
      </div>
    </div>
  )
}

/**
 * Nothing here yet: what goes here, in one sentence, and the ONE action that
 * fills it. `steps` show the road ahead as numbered labels.
 */
export function EmptyState({
  icon: IconComponent,
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
    <div className={`empty ${compact ? 'compact' : ''}`}>
      {IconComponent ? (
        <span className="ic mb-1 text-muted">
          <IconComponent className="h-7 w-7" />
        </span>
      ) : (
        <Icon name="inbox" size={28} />
      )}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {steps && steps.length > 0 ? (
        <ol className="empty-steps">
          {steps.map((step, index) => (
            <li key={step.label}>
              <b>{index + 1}</b>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      {action ? <div className="acts">{action}</div> : null}
    </div>
  )
}

/** Something failed: what happened, in plain words, and Retry. */
export function ErrorState({
  title = "Couldn't load this page",
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
    <div role="alert" className={`empty err ${compact ? 'compact' : ''}`}>
      <Icon name="alertCircle" size={28} />
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry ? (
        <div className="acts">
          <Button variant="primary" onClick={onRetry}>
            <Icon name="refresh" size={15} />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * The console's buttons are the shared `Button` at its dense size (32px in
 * the console theme) by default — a console is scanned and clicked with a
 * mouse, so rows of actions stay compact. `size="md"` (36px) for a form's
 * main action. `loading` shows the spinner and disables the button.
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
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
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

/**
 * Label/value row — the building block of every detail panel. Label on the
 * left (muted), value beside it; stacked on a phone.
 */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
