import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Filter row above a table: search on the left, filter chips on the right,
 * all on one line from `sm` — the layout the console convention expects, so
 * an admin never hunts for where filtering happens. On a phone the search
 * takes the first row and the chips wrap under it.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">{children}</div>
  )
}

/**
 * Debounced search box. It owns the keystrokes and reports the settled value,
 * so a page never fires a request per character. `value` re-syncs it when the
 * URL changes underneath (back button, a deep link).
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  delay = 300,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  delay?: number
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onChange(draft), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange identity is not stable across renders
  }, [draft, delay])

  return (
    // A phone gives the search its own full row (the filter chips wrap below);
    // from `sm` it shares the line with them.
    <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      {/* 16px on a phone: iOS zooms the page into any field smaller than that. */}
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-line bg-input pl-9 pr-3 text-base text-fg placeholder:text-muted focus:border-brand focus:outline-none sm:h-9 sm:text-sm"
      />
    </div>
  )
}

/**
 * Filter chip — "Payment: Any status ▾". The visible chip is drawn by us; a
 * real `<select>` lies invisibly on top of it, so a tap opens the phone's own
 * picker (the iOS wheel, the Android list) and a keyboard still works.
 * A chip with a filter set is tinted, so active filters read at a glance.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const selected = options.find((option) => option.value === value)?.label ?? ''
  const active = value !== ''
  return (
    <label
      className={`relative inline-flex h-9 max-w-full items-center gap-1 rounded-pill border pl-3 pr-2 text-sm transition-colors focus-within:border-brand ${
        active ? 'border-brand/40 bg-brand/10 text-fg' : 'border-line bg-surface text-fg'
      }`}
    >
      <span className="text-muted">{label}:</span>
      <span className="truncate font-medium">{selected}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {/* text-base so iOS does not zoom when the picker opens. */}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      >
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
 * Scrollable status tabs. Horizontal scroll here is deliberate — tabs must
 * stay on one line to read as a single axis of choice, unlike the wrapping
 * pill rows elsewhere in the product.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  sticky = false,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  /**
   * Below `lg`, pin the tabs under the console's 64px top bar while the list
   * scrolls — the way a phone app keeps its segment bar in reach. Only for
   * tabs at the top of a page-level list (not inside dialogs).
   */
  sticky?: boolean
}) {
  return (
    <div
      className={`-mb-px flex gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        sticky ? 'sticky top-16 z-5 bg-surface lg:static' : ''
      }`}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={(event) => {
              onChange(option.value)
              // Bring a half-hidden tab fully into view, as native tab bars do.
              event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors lg:py-2.5 ${
              active
                ? 'border-brand text-fg'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 text-xs text-muted">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
