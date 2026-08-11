import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

/**
 * Shared, brand-neutral auth primitives.
 *
 * Layout (Facebook/Instagram style):
 *   - Laptop / desktop (lg+): split screen — marketing hero on the left,
 *     login panel on the right.
 *   - Tablet / mobile (< lg): the hero is hidden and the login panel is
 *     centered full-width.
 */

/** Full-page split layout. `hero` shows only on lg+; `children` is the panel. */
export function AuthLayout({
  hero,
  children,
  footer,
}: {
  hero: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-bg lg:grid lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        {hero}
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-sm">
          {children}
          {footer && <div className="mt-8 text-center">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

/**
 * Hero pane with a full-bleed background image.
 * Brand `logo` sits at the top, `children` (the title) at the bottom.
 * A dark gradient overlay keeps text legible over the photo.
 */
export function Hero({
  image,
  logo,
  children,
}: {
  image: string
  logo: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-lg bg-cover bg-center p-10 text-white"
      style={{ backgroundImage: `url(${image})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50" />
      <div className="relative flex items-center gap-2 text-lg font-semibold">
        {logo}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-8 py-9 shadow-floating">
      {children}
    </div>
  )
}

export function Brand({
  badge,
  badgeClass,
  title,
  subtitle,
}: {
  badge: ReactNode
  /** The badge sizes itself; this only adds treatment (e.g. a tile). */
  badgeClass: string
  /** Omitted where the badge is the full lockup, which already sets the name. */
  title?: ReactNode
  subtitle: string
}) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div
        className={`mb-4 flex items-center justify-center text-2xl text-brand-contrast ${badgeClass}`}
      >
        {badge}
      </div>
      {title && (
        <h1 className="font-heading text-2xl font-bold tracking-tight text-fg">
          {title}
        </h1>
      )}
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
    </div>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Optional leading icon shown inside the field. */
  icon?: ReactNode
  /** Optional trailing control (e.g. a show/hide password toggle). */
  trailing?: ReactNode
}

export function TextField({
  label,
  icon,
  trailing,
  className = '',
  ...props
}: TextFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-muted">
        {label}
      </span>
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted transition-colors group-focus-within:text-fg">
            {icon}
          </span>
        )}
        <input
          className={`h-12 w-full rounded-md border border-line bg-input text-sm text-fg outline-none transition-colors placeholder:text-muted placeholder:tracking-normal hover:border-fg/30 focus:border-accent ${
            icon ? 'pl-11' : 'pl-4'
          } ${trailing ? 'pr-11' : 'pr-4'} ${className}`}
          {...props}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2">
            {trailing}
          </span>
        )}
      </div>
    </label>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Layout classes for the wrapper (width / flex behavior). */
  containerClassName?: string
}

/**
 * Themed `<select>`.
 *
 * The browser's native dropdown arrow sits flush against the right border and
 * ignores our theme colors, so it is suppressed (`appearance-none`) and
 * replaced with a chevron inset from the edge, with matching `pr-10` on the
 * control so long option text never runs under it.
 *
 * Height is intentionally not defaulted — pass `h-11` / `h-12` via `className`
 * so it lines up with the inputs beside it.
 */
export function Select({
  className = '',
  containerClassName = '',
  children,
  ...props
}: SelectProps) {
  return (
    <div className={`relative ${containerClassName}`}>
      <select
        className={`w-full appearance-none rounded-md border border-line bg-input pl-3.5 pr-10 text-sm text-fg outline-none transition-colors hover:border-fg/30 focus:border-accent ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  )
}

/** Inline form error message. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  )
}

/** Inline neutral/info message (dev hints, "code sent" confirmations). */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
      {children}
    </p>
  )
}

/** Inline success message. */
export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
      {children}
    </p>
  )
}

/** Segmented control for switching sign-in methods. */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface-alt p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`h-9 rounded-sm text-sm font-medium transition-colors ${
            value === tab.value
              ? 'bg-surface text-fg shadow-floating'
              : 'text-muted hover:text-fg'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** "── or ──" separator between the form and social buttons. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/** Neutral secondary button (e.g. "Continue with Google"). */
export function SecondaryButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:border-fg/30 hover:bg-surface-alt active:scale-[0.99] disabled:cursor-not-allowed disabled:text-muted ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PrimaryButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`h-12 w-full rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition-colors hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Inline icons (no external assets) for the input fields.            */
/* ------------------------------------------------------------------ */

const ICON = 'h-[18px] w-[18px]'

/** Chevron used by the themed `Select` (replaces the native arrow). */
export function ChevronDownIcon({ className = ICON }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function ShieldIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function PhoneIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  )
}

/** Google "G" mark (official colors). */
export function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.6l4.01 3.12C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  )
}

export function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68M6.6 6.6A13.3 13.3 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6" />
          <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}
