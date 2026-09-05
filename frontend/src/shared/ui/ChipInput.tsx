import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface ChipItem {
  /** Stable identity — a rename keeps it, so the parent can map dependants. */
  key: string
  value: string
}

/**
 * A list of short values entered as chips — the control for a product
 * option's values ("S", "M", "L"). Type and press Enter (or comma, or leave
 * the field) to add; Backspace on an empty field removes the last chip; click
 * a chip to rename it in place; the × removes it.
 *
 * Items carry a stable `key` and the callbacks are add / remove / rename
 * rather than a whole-list `onChange`, because the parent needs to know a
 * rename from a remove-and-add: renaming "Red" to "Crimson" must keep every
 * variant that is Red, and only the key can say they are the same value.
 *
 * Renders no `<form>` so it can sit inside one; Enter is handled locally.
 */
export function ChipInput({
  label,
  items,
  onAdd,
  onRemove,
  onRename,
  placeholder,
  maxItems,
  maxLength = 40,
  disabled = false,
  ariaLabel,
}: {
  label?: ReactNode
  items: ChipItem[]
  onAdd: (value: string) => void
  onRemove: (key: string) => void
  onRename: (key: string, value: string) => void
  placeholder?: string
  maxItems?: number
  maxLength?: number
  disabled?: boolean
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  const full = maxItems !== undefined && items.length >= maxItems
  const exists = (value: string, exceptKey?: string) =>
    items.some(
      (item) =>
        item.key !== exceptKey &&
        item.value.toLowerCase() === value.toLowerCase(),
    )

  const commit = () => {
    const value = draft.trim().replace(/,+$/, '').trim()
    if (!value) return
    if (exists(value)) {
      setHint(`"${value}" is already added`)
      return
    }
    if (full) {
      setHint(`Up to ${maxItems} values`)
      return
    }
    onAdd(value)
    setDraft('')
    setHint(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      e.preventDefault()
      onRemove(items[items.length - 1]!.key)
    }
  }

  const startRename = (item: ChipItem) => {
    if (disabled) return
    setEditingKey(item.key)
    setEditDraft(item.value)
    setHint(null)
  }

  const commitRename = () => {
    if (editingKey === null) return
    const value = editDraft.trim()
    const current = items.find((item) => item.key === editingKey)
    if (value && current && value !== current.value) {
      if (exists(value, editingKey)) {
        setHint(`"${value}" is already added`)
        return
      }
      onRename(editingKey, value)
    }
    setEditingKey(null)
    setHint(null)
  }

  return (
    <div>
      {label && (
        <span className="mb-2 block text-sm font-medium text-muted">{label}</span>
      )}
      <div
        className={`flex min-h-12 w-full flex-wrap items-center gap-1.5 rounded-md border border-line bg-input px-2 py-1.5 text-sm transition-colors focus-within:border-accent ${
          disabled ? 'opacity-60' : 'hover:border-fg/30'
        }`}
      >
        {items.map((item) =>
          editingKey === item.key ? (
            <input
              key={item.key}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  setEditingKey(null)
                }
              }}
              maxLength={maxLength}
              autoFocus
              aria-label={`Rename ${item.value}`}
              className="h-7 min-w-16 rounded-pill border border-accent bg-surface px-2.5 text-xs font-medium text-fg outline-none"
              style={{ width: `${Math.max(4, editDraft.length + 2)}ch` }}
            />
          ) : (
            <span
              key={item.key}
              className="inline-flex h-7 items-center gap-1 rounded-pill bg-surface-alt pl-2.5 pr-1 text-xs font-medium text-fg"
            >
              <button
                type="button"
                onClick={() => startRename(item)}
                disabled={disabled}
                className="max-w-40 truncate hover:text-accent disabled:cursor-default disabled:hover:text-fg"
                title="Click to rename"
              >
                {item.value}
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                disabled={disabled}
                aria-label={`Remove ${item.value}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-default"
              >
                ×
              </button>
            </span>
          ),
        )}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (hint) setHint(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={items.length === 0 ? placeholder : undefined}
          maxLength={maxLength}
          disabled={disabled || full}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : 'Add a value')}
          className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-sm text-fg outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
      </div>
      {hint && <p className="mt-1.5 text-xs font-medium text-danger">{hint}</p>}
    </div>
  )
}
