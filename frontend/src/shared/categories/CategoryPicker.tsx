import { useEffect, useRef, useState } from 'react'
import { taxonomyApi, formatPath, PATH_SEPARATOR } from './taxonomyApi'
import type { CategoryNode } from './taxonomyApi'

/**
 * Selects one node of the GLOBAL category taxonomy, by search or by browsing.
 *
 * Two ways in, because sellers differ: type "brake" and pick
 * "Automotive › Motorcycle Parts › Brake Parts" straight from the results, or
 * drill down a level at a time from the roots. Either way the control shows
 * the FULL path of what is selected and hands back only the leaf id — the
 * name is never copied anywhere.
 *
 * Nothing here assumes two levels. Browsing follows `parentId` for as deep as
 * the tree goes: a level with children offers to open them, and any level can
 * be chosen (a seller may legitimately mean "Automotive" and nothing finer).
 * Only the level being looked at is fetched, so a large taxonomy stays cheap.
 */

export interface CategoryPickerProps {
  /** Currently selected node id, or null. */
  value: string | null
  onChange: (id: string | null) => void
  /**
   * The selected node, when the caller already has it (from a list response,
   * say). Saves a lookup and lets the closed control render the path
   * immediately instead of flashing an id.
   */
  selected?: { id: string; name: string; pathLabel: string } | null
  label?: string
  hint?: string
  /** Shown on the button when nothing is selected. */
  placeholder?: string
  /** Lets the seller clear the selection — off where a category is required. */
  allowClear?: boolean
  disabled?: boolean
  /** Admins pick from disabled branches too; sellers never see them. */
  includeInactive?: boolean
  className?: string
}

export function CategoryPicker({
  value,
  onChange,
  selected = null,
  label = 'Category',
  hint,
  placeholder = 'Select a category…',
  allowClear = true,
  disabled = false,
  includeInactive = false,
  className = '',
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [resolved, setResolved] = useState<{
    id: string
    pathLabel: string
  } | null>(selected ? { id: selected.id, pathLabel: selected.pathLabel } : null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Keep the closed-state label in step with whatever the parent passes.
  useEffect(() => {
    if (selected && selected.id === value) {
      setResolved({ id: selected.id, pathLabel: selected.pathLabel })
    } else if (!value) {
      setResolved(null)
    }
  }, [selected, value])

  // A value with no path yet (an id restored from a saved form) is looked up
  // once, so the button never shows a raw id.
  useEffect(() => {
    if (!value || resolved?.id === value) return
    let cancelled = false
    taxonomyApi
      .tree(!includeInactive)
      .then((tree) => {
        const stack = [...tree]
        while (stack.length > 0) {
          const node = stack.pop()!
          if (node.id === value) {
            if (!cancelled) setResolved({ id: node.id, pathLabel: node.pathLabel })
            return
          }
          stack.push(...node.children)
        }
      })
      .catch(() => {
        /* the button falls back to the placeholder */
      })
    return () => {
      cancelled = true
    }
  }, [value, resolved?.id, includeInactive])

  // Close on outside click / Escape, like a native select.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (node: CategoryNode) => {
    setResolved({ id: node.id, pathLabel: node.pathLabel })
    onChange(node.id)
    setOpen(false)
  }

  return (
    <div className={className} ref={boxRef}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-fg">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-11 w-full items-center gap-2 rounded-md border border-line bg-input px-4 text-left text-sm text-fg outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:text-muted"
        >
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <span
            className={`min-w-0 flex-1 truncate ${
              resolved ? 'text-fg' : 'text-muted'
            }`}
          >
            {resolved?.pathLabel ?? placeholder}
          </span>
          {allowClear && resolved && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear category"
              onClick={(e) => {
                e.stopPropagation()
                setResolved(null)
                onChange(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  setResolved(null)
                  onChange(null)
                }
              }}
              className="shrink-0 rounded-sm px-1 text-muted transition-colors hover:text-fg"
            >
              ✕
            </span>
          )}
        </button>

        {open && (
          <CategoryPanel
            includeInactive={includeInactive}
            onPick={choose}
            onClose={() => setOpen(false)}
          />
        )}
      </div>

      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/**
 * The dropdown body: a search field over a browsable level list. Typing
 * switches to results; clearing the field returns to exactly the level that
 * was being browsed.
 */
function CategoryPanel({
  includeInactive,
  onPick,
  onClose,
}: {
  includeInactive: boolean
  onPick: (node: CategoryNode) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CategoryNode[] | null>(null)
  const [level, setLevel] = useState<CategoryNode[]>([])
  // Ancestors of the level on screen — drives the breadcrumb and Back.
  const [trail, setTrail] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeOnly = !includeInactive

  const loadLevel = (parent: CategoryNode | null, nextTrail: CategoryNode[]) => {
    setLoading(true)
    setError(null)
    taxonomyApi
      .children(parent?.slug ?? null, activeOnly)
      .then((res) => {
        setLevel(res.items)
        setTrail(nextTrail)
      })
      .catch(() => setError('Could not load categories.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLevel(null, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnly])

  // Debounced search — one request per pause, not per keystroke.
  useEffect(() => {
    const term = query.trim()
    if (term.length === 0) {
      setResults(null)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      taxonomyApi
        .search(term, 25, activeOnly)
        .then(setResults)
        .catch(() => setError('Could not search categories.'))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, activeOnly])

  const browsing = results === null

  return (
    <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
      <div className="border-b border-line p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="Search category…"
          className="h-9 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {/* Breadcrumb + Back, only while browsing below the roots. */}
      {browsing && trail.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <button
            type="button"
            onClick={() => {
              const nextTrail = trail.slice(0, -1)
              loadLevel(nextTrail[nextTrail.length - 1] ?? null, nextTrail)
            }}
            className="shrink-0 text-xs font-semibold text-brand hover:text-brand-hover"
          >
            ← Back
          </button>
          <span className="min-w-0 truncate text-xs text-muted">
            {trail.map((node) => node.name).join(PATH_SEPARATOR)}
          </span>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto">
        {error ? (
          <p className="px-3 py-4 text-sm text-danger">{error}</p>
        ) : loading ? (
          <p className="px-3 py-4 text-sm text-muted">Loading…</p>
        ) : browsing ? (
          level.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              Nothing inside this category.
            </p>
          ) : (
            level.map((node) => (
              <BrowseRow
                key={node.id}
                node={node}
                onPick={() => onPick(node)}
                onOpen={
                  node.childCount > 0
                    ? () => loadLevel(node, [...trail, node])
                    : undefined
                }
              />
            ))
          )
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            No category matches “{query.trim()}”.
          </p>
        ) : (
          results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onPick(node)}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-alt"
            >
              <span className="text-sm font-medium text-fg">
                {node.name}
                {!node.isActive && (
                  <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Disabled
                  </span>
                )}
              </span>
              {/* The path is the point — "Accessories" alone means nothing. */}
              <span className="text-xs text-muted">{formatPath(node)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * One browsable level row. The row itself SELECTS this category; the chevron
 * opens its children. Keeping those separate is what lets a seller choose a
 * parent ("Automotive") without being forced down to a leaf.
 */
function BrowseRow({
  node,
  onPick,
  onOpen,
}: {
  node: CategoryNode
  onPick: () => void
  onOpen?: (() => void) | undefined
}) {
  return (
    <div className="flex items-stretch border-b border-line/50 last:border-0">
      <button
        type="button"
        onClick={onPick}
        className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-surface-alt"
      >
        <span className="block truncate text-sm text-fg">
          {node.name}
          {!node.isActive && (
            <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Disabled
            </span>
          )}
        </span>
      </button>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${node.name}`}
          className="flex w-14 shrink-0 items-center justify-center gap-1 border-l border-line/50 text-xs text-muted transition-colors hover:bg-surface-alt hover:text-fg"
        >
          {node.childCount}
          <span aria-hidden>›</span>
        </button>
      )}
    </div>
  )
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
