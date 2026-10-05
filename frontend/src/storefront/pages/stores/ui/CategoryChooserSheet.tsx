import { useEffect, useState } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { taxonomyApi, formatPath } from '../../../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../../../shared/categories/taxonomyApi'
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, SearchIcon, TagIcon } from '../../../layout/icons'

/**
 * Choosing what you sell — the seller's way into the platform category list.
 *
 * The shared `CategoryPicker` (admin, mapping screens) selects a row and
 * opens its children from a separate chevron. For a seller who does not
 * read easily that is backwards: tapping "Fashion" *chose* Fashion. Here a
 * tap does the obvious thing —
 *
 *   - a category with smaller kinds inside OPENS ("Fashion" → Women, Men…);
 *   - one with nothing inside CHOOSES;
 *   - inside a level, a highlighted first row offers to choose the whole
 *     level ("Choose all of Women") for a seller who sells a bit of
 *     everything in it.
 *
 * Search sits on top (most sellers type "saree"), each hit showing its full
 * path. Categories the shop already has are ticked and can't be picked twice.
 * It is a full-height sheet with 60px rows, and `busy` keeps it open with a
 * spinner while the caller adds the pick.
 */
export function CategoryChooserSheet({
  open,
  onClose,
  onPick,
  addedIds,
  busy = false,
  title = 'Choose what you sell',
}: {
  open: boolean
  onClose: () => void
  /** Called with the chosen platform category. */
  onPick: (node: CategoryNode) => void
  /** Platform category ids the shop already has. */
  addedIds: ReadonlySet<string>
  busy?: boolean
  title?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CategoryNode[] | null>(null)
  const [level, setLevel] = useState<CategoryNode[]>([])
  const [trail, setTrail] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLevel = (parent: CategoryNode | null, nextTrail: CategoryNode[]) => {
    setLoading(true)
    setError(null)
    taxonomyApi
      .children(parent?.slug ?? null, true)
      .then((res) => {
        setLevel(res.items)
        setTrail(nextTrail)
      })
      .catch(() => setError('Could not load the list. Check your internet and try again.'))
      .finally(() => setLoading(false))
  }

  // Fresh at the top every time it opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults(null)
    loadLevel(null, [])
  }, [open])

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
        .search(term, 25, true)
        .then(setResults)
        .catch(() => setError('Could not search. Check your internet and try again.'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const parent = trail[trail.length - 1] ?? null
  const browsing = results === null

  return (
    <Dialog
      open={open}
      title={title}
      subtitle={
        browsing && parent
          ? trail.map((node) => node.name).join(' › ')
          : 'Search, or tap to look inside a group.'
      }
      onClose={onClose}
      size="lg"
      flush
    >
      <div className="sticky top-0 z-[1] border-b border-line bg-surface/90 p-3 backdrop-blur-sm">
        <label className="relative block">
          <span className="sr-only">Search categories</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type what you sell — e.g. saree, atta, mobile"
            className="h-field w-full rounded-xl border border-line bg-input pr-4 pl-11 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
        {browsing && parent && (
          <button
            type="button"
            onClick={() => {
              const nextTrail = trail.slice(0, -1)
              loadLevel(nextTrail[nextTrail.length - 1] ?? null, nextTrail)
            }}
            className="mt-2 inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-base font-semibold text-brand transition hover:bg-brand-soft"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back
          </button>
        )}
      </div>

      <div className="pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="px-4 py-6 text-base text-danger">{error}</p>
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading" className="space-y-2 p-3">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-[60px] animate-pulse rounded-xl bg-fg/5" />
            ))}
          </div>
        ) : browsing ? (
          <ul className="divide-y divide-line">
            {parent && (
              <li className="p-3">
                <PickButton
                  node={parent}
                  added={addedIds.has(parent.id)}
                  busy={busy}
                  label={`Choose all of ${parent.name}`}
                  onPick={() => onPick(parent)}
                />
              </li>
            )}
            {level.length === 0 && (
              <li className="px-4 py-6 text-base text-muted">Nothing inside this group.</li>
            )}
            {level.map((node) => (
              <li key={node.id}>
                <Row
                  node={node}
                  added={addedIds.has(node.id)}
                  disabled={busy}
                  onTap={() =>
                    node.childCount > 0 ? loadLevel(node, [...trail, node]) : onPick(node)
                  }
                />
              </li>
            ))}
          </ul>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-base text-muted">
            Nothing matches “{query.trim()}”. Try a shorter word, or clear the
            search and look through the groups.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {results.map((node) => (
              <li key={node.id}>
                <Row
                  node={node}
                  added={addedIds.has(node.id)}
                  disabled={busy}
                  showPath
                  onTap={() => onPick(node)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

function Row({
  node,
  added,
  disabled,
  showPath = false,
  onTap,
}: {
  node: CategoryNode
  added: boolean
  disabled: boolean
  showPath?: boolean
  onTap: () => void
}) {
  const opens = !showPath && node.childCount > 0
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || (added && !opens)}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-fg/5 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {node.imageUrl ? (
        <img
          src={node.imageUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <TagIcon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-fg">{node.name}</span>
        <span className="block text-hint text-muted">
          {showPath
            ? formatPath(node)
            : opens
              ? `${node.childCount} kind${node.childCount === 1 ? '' : 's'} inside — tap to look`
              : 'Tap to choose'}
        </span>
      </span>
      {added ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
          <CheckIcon className="h-3.5 w-3.5" />
          Added
        </span>
      ) : opens ? (
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
      ) : (
        <span className="shrink-0 rounded-pill bg-brand px-3 py-1 text-xs font-bold text-brand-contrast">
          Choose
        </span>
      )}
    </button>
  )
}

/** "Choose all of Women" — the whole level, for a seller who sells across it. */
function PickButton({
  node,
  added,
  busy,
  label,
  onPick,
}: {
  node: CategoryNode
  added: boolean
  busy: boolean
  label: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy || added}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/60 px-4 text-left transition hover:bg-brand-soft disabled:cursor-default disabled:opacity-70"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-brand">
          {added ? `${node.name} is already in your shop` : label}
        </span>
        {!added && (
          <span className="block text-hint text-muted">
            Or pick a smaller kind below — that is easier for customers to find.
          </span>
        )}
      </span>
      {busy ? (
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-r-transparent"
        />
      ) : added ? (
        <CheckIcon className="h-5 w-5 shrink-0 text-success" />
      ) : null}
    </button>
  )
}
