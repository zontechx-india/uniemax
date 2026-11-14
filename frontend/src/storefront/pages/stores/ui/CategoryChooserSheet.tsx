import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { Button } from '../../../../shared/ui/Button'
import { taxonomyApi, formatPath } from '../../../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../../../shared/categories/taxonomyApi'
import { CheckIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../../../layout/icons'

/**
 * Choosing what you sell: the seller's way into the platform category list.
 *
 * Two columns, like a shopping app's filter screen:
 *
 *   - LEFT, the main categories (Fashion, Electronics…), always in view. One
 *     tap shows what is inside on the right, with no loading in between: the
 *     whole tree (about 160 nodes) comes in one call when the sheet opens.
 *   - RIGHT, everything inside that main category. Deeper levels become small
 *     headings ("WOMEN", "WOMEN › ETHNIC") with the real choices as rows under
 *     them, the same grouping step 1 of the product wizard uses. Under each
 *     group, and last in the column, a quiet "Add all of Women / Fashion" is
 *     for the seller who sells across it; it is LAST on purpose, so the
 *     smaller kinds (easier for customers to find) are seen first.
 *
 * One tap on a row adds it (there is one answer, so there are no checkboxes
 * and no Apply button). Search sits on top (most sellers type "saree") and,
 * while typing, replaces both columns with one list of hits and their paths.
 * A hit that has categories inside it (Electrical, Fashion › Women) does NOT
 * add on tap: it OPENS — the search clears, the left column jumps to its main
 * category and the right column scrolls to it, so the seller still picks the
 * sub-category. Adding a whole group stays one step further ("Add all of …"),
 * because a group added from a search hit left sellers with no sub-category
 * to choose in the product wizard.
 * Categories the shop already has are ticked and can't be picked twice.
 * `busy` keeps the sheet open with a spinner on the tapped row while the
 * caller adds the pick.
 */
export function CategoryChooserSheet({
  open,
  onClose,
  onPick,
  addedIds,
  busy = false,
  title = 'Choose what you sell',
  startAt = null,
}: {
  open: boolean
  onClose: () => void
  /** Called with the chosen platform category. */
  onPick: (node: CategoryNode) => void
  /** Platform category ids the shop already has. */
  addedIds: ReadonlySet<string>
  busy?: boolean
  title?: string
  /** A platform category id: the sheet opens on the main category it sits in. */
  startAt?: string | null
}) {
  const [tree, setTree] = useState<CategoryNode[] | null>(null)
  const [rootId, setRootId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CategoryNode[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /** A group opened from a search hit: scrolled to and highlighted. */
  const [focusId, setFocusId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fresh every time it opens: no search, back on the starting main category.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults(null)
    setRootId(null)
    setPickedId(null)
    setFocusId(null)
  }, [open])

  // Bring the opened group into view once the right column has drawn it.
  useEffect(() => {
    if (!focusId) return
    panelRef.current
      ?.querySelector(`[data-group="${focusId}"]`)
      ?.scrollIntoView({ block: 'start' })
  }, [focusId, rootId])

  // The whole tree, once per page visit (it rarely changes).
  useEffect(() => {
    if (!open || tree) return
    setLoadError(false)
    taxonomyApi
      .tree(true)
      .then(setTree)
      .catch(() => setLoadError(true))
  }, [open, tree, attempt])

  // Debounced search: one request per pause, not per keystroke.
  useEffect(() => {
    const term = query.trim()
    if (term.length === 0) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    setSearchError(false)
    const timer = setTimeout(() => {
      taxonomyApi
        .search(term, 25, true)
        .then(setResults)
        .catch(() => setSearchError(true))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, attempt])

  const roots = tree ?? []
  const root =
    roots.find((r) => r.id === rootId) ?? roots.find((r) => r.id === rootIdOf(startAt, roots)) ?? roots[0] ?? null
  const searchMode = query.trim().length > 0
  const failed = searchMode ? searchError : loadError

  const pick = (node: CategoryNode) => {
    setPickedId(node.id)
    onPick(node)
  }
  /** A search hit with categories inside: show it in the columns instead of adding it. */
  const openGroup = (node: CategoryNode) => {
    setRootId(node.path[0]?.id ?? node.id)
    setFocusId(node.parentId ? node.id : null)
    setQuery('')
    setResults(null)
  }
  const rowProps = (node: CategoryNode) => ({
    node,
    added: addedIds.has(node.id),
    disabled: busy,
    spinning: busy && pickedId === node.id,
    onTap: () => pick(node),
  })

  return (
    <Dialog
      open={open}
      title={title}
      subtitle="Search, or tap a group on the left."
      onClose={onClose}
      size="lg"
      flush
      fill
    >
      <div className="shrink-0 border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Search categories</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type what you sell, e.g. saree, atta, mobile"
            className="h-field w-full rounded-xl border border-line bg-input pr-4 pl-11 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      </div>

      {failed ? (
        <div className="px-4 py-6">
          <p className="text-base text-danger">
            Could not {searchMode ? 'search' : 'load the list'}. Check your internet and try again.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      ) : searchMode ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching || results === null ? (
            <Skeleton />
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-base text-muted">
              Nothing matches “{query.trim()}”. Try a shorter word, or clear the search and look
              through the groups.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((node) => (
                <li key={node.id}>
                  {node.childCount > 0 ? (
                    <Row
                      node={node}
                      added={false}
                      disabled={false}
                      spinning={false}
                      opens
                      path={`${formatPath(node)} · ${node.childCount} inside`}
                      onTap={() => openGroup(node)}
                    />
                  ) : (
                    <Row {...rowProps(node)} path={formatPath(node)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : !tree || !root ? (
        <Skeleton />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Main categories"
            className="w-2/5 max-w-60 shrink-0 overflow-y-auto border-r border-line bg-fg/5"
          >
            {roots.map((r) => {
              const on = r.id === root.id
              const has = hasAdded(r, addedIds)
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setRootId(r.id)
                    setFocusId(null)
                  }}
                  className={`flex min-h-14 w-full items-center gap-1.5 border-b border-l-4 border-b-line px-3 py-2 text-left text-sm break-words transition-colors ${
                    on
                      ? 'border-l-brand bg-surface font-semibold text-brand'
                      : 'border-l-transparent font-medium text-fg hover:bg-fg/5'
                  }`}
                >
                  <span className="min-w-0 flex-1">{r.name}</span>
                  {has && (
                    <span className="shrink-0 text-success">
                      <CheckIcon className="h-4 w-4" />
                      <span className="sr-only">(some added)</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div
            key={root.id}
            ref={panelRef}
            role="tabpanel"
            aria-label={root.name}
            className="min-w-0 flex-1 overflow-y-auto"
          >
            {root.children.length === 0 ? (
              <Row {...rowProps(root)} />
            ) : (
              <>
                {groupsOf(root).map((group) => (
                  <section
                    key={group.id}
                    data-group={group.id}
                    aria-label={group.label || root.name}
                    className={`pb-1 ${group.id === focusId ? 'bg-brand-soft/40' : ''}`}
                  >
                    {group.label && (
                      <p
                        className={`flex items-center gap-2 px-4 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase ${
                          group.id === focusId ? 'text-brand' : 'text-muted'
                        }`}
                      >
                        {group.label}
                        <span aria-hidden className="h-px flex-1 bg-line" />
                      </p>
                    )}
                    <ul className="divide-y divide-line">
                      {group.leaves.map((leaf) => (
                        <li key={leaf.id}>
                          <Row {...rowProps(leaf)} />
                        </li>
                      ))}
                    </ul>
                    {group.parent && (
                      <AddAll
                        node={group.parent}
                        added={addedIds.has(group.parent.id)}
                        busy={busy}
                        onPick={pick}
                      />
                    )}
                  </section>
                ))}
                <AddAll node={root} added={addedIds.has(root.id)} busy={busy} onPick={pick} />
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-2 p-3">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="h-14 animate-pulse rounded-xl bg-fg/5" />
      ))}
    </div>
  )
}

/**
 * One choice: name (and its path in search hits) with Add / Added on the
 * right — or, for a search hit with categories inside (`opens`), "Open ›".
 */
function Row({
  node,
  added,
  disabled,
  spinning,
  opens = false,
  path,
  onTap,
}: {
  node: CategoryNode
  added: boolean
  disabled: boolean
  spinning: boolean
  opens?: boolean
  path?: string
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || added}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-fg/5 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold break-words text-fg">{node.name}</span>
        {path && <span className="block text-hint text-muted">{path}</span>}
      </span>
      {opens ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill border border-brand/40 px-2.5 py-1 text-xs font-bold text-brand">
          Open
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      ) : spinning ? (
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-r-transparent"
        />
      ) : added ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
          <CheckIcon className="h-3.5 w-3.5" />
          Added
        </span>
      ) : (
        <span className="shrink-0 rounded-pill bg-brand px-3 py-1 text-xs font-bold text-brand-contrast">
          Add
        </span>
      )}
    </button>
  )
}

/** "Add all of Women": the whole group, for a seller who sells across it. */
function AddAll({
  node,
  added,
  busy,
  onPick,
}: {
  node: CategoryNode
  added: boolean
  busy: boolean
  onPick: (node: CategoryNode) => void
}) {
  if (added) return null
  return (
    <div className="px-2 py-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onPick(node)}
        className="px-2"
      >
        {/* Colour on the span: the ghost variant's own colour wins over a utility. */}
        <span className="inline-flex items-center gap-1.5 text-left text-sm text-brand">
          <PlusIcon className="h-4 w-4 shrink-0" />
          Add all of {node.name}
        </span>
      </Button>
    </div>
  )
}

type Group = {
  id: string
  /** "Women", "Women › Ethnic"; empty for choices straight under the main. */
  label: string
  /** The node the heading names, offered as "Add all of …". */
  parent: CategoryNode | null
  leaves: CategoryNode[]
}

/** A main category's leaves, grouped by the levels between it and them. */
function groupsOf(main: CategoryNode): Group[] {
  const groups: Group[] = []
  const direct: CategoryNode[] = []
  const walk = (node: CategoryNode, trail: CategoryNode[]) => {
    const leaves = node.children.filter((k) => k.children.length === 0)
    if (trail.length === 0) direct.push(...leaves)
    else groups.push({ id: node.id, label: trail.map((t) => t.name).join(' › '), parent: node, leaves })
    for (const k of node.children) if (k.children.length > 0) walk(k, [...trail, k])
  }
  walk(main, [])
  return [...(direct.length > 0 ? [{ id: main.id, label: '', parent: null, leaves: direct }] : []), ...groups]
}

/** The main category a platform category sits in. */
function rootIdOf(id: string | null, roots: CategoryNode[]): string | null {
  if (!id) return null
  const find = (nodes: CategoryNode[]): boolean =>
    nodes.some((n) => n.id === id || find(n.children))
  return roots.find((r) => r.id === id || find(r.children))?.id ?? null
}

function hasAdded(node: CategoryNode, addedIds: ReadonlySet<string>): boolean {
  return addedIds.has(node.id) || node.children.some((k) => hasAdded(k, addedIds))
}
