import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../layout/icons'

/**
 * Filter bar above a table (ADMIN_UI_THEME.md §7.5): search on the left,
 * filter selects beside it, all 32px tall on one line. On a phone the search
 * takes the first row and the selects share the next, two to a row.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="fbar">{children}</div>
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
    <label className="fsearch">
      <Icon name="search" size={15} />
      <span className="sr-only">Search</span>
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

/**
 * Filter select — "Payment: Any status ▾". The visible box is drawn by us; a
 * real `<select>` lies invisibly on top of it, so a tap opens the phone's own
 * picker and a keyboard still works. A select with a filter set is tinted,
 * so active filters read at a glance.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  idleValue = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  /** The value that means "no filter" (a sort's default) — not tinted. */
  idleValue?: string
}) {
  const selected = options.find((option) => option.value === value)?.label ?? ''
  const active = value !== idleValue
  return (
    <label className={`fsel ${active ? 'set' : ''}`}>
      <span>{label}:</span>
      <b>{selected}</b>
      <Icon name="chevronDown" size={14} />
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
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
 * Status tabs — 36px, an underline in the brand colour on the chosen one, a
 * count bubble when given. They scroll sideways rather than wrap: tabs must
 * stay on one line to read as one choice.
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
   * On a phone, pin the tabs under the 52px top bar while the list scrolls.
   * Only for tabs at the top of a page-level list (not inside dialogs).
   */
  sticky?: boolean
}) {
  return (
    <div className={`tabs ${sticky ? 'sticky-sm' : ''}`} role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'on' : ''}
            onClick={(event) => {
              onChange(option.value)
              // Bring a half-hidden tab fully into view, as native tab bars do.
              event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="cnt">{option.count.toLocaleString('en-IN')}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
