import { useState } from 'react'
import type { ReactNode } from 'react'
import type { StoreCategory } from '../../../../features/stores/storesApi'
import { CheckIcon, PlusIcon, SearchIcon } from '../../../../layout/icons'
import { Button } from '../../../../../shared/ui/Button'
import { inputClass } from './shared'

/**
 * Step 1's category question in two plain steps: **① Main category** (big
 * chips — Fashion, Home…) then **② Sub-category in Fashion** (cards grouped
 * under small headings — WOMEN: Sarees, Kurtis · MEN: Shirts), and a green
 * line saying where customers will find it.
 *
 * It replaced one flat list in which Sarees, Women and Fashion were the same
 * card, so sellers could not tell a category from what sits inside it.
 * Middle levels (Women) are headings, not choices — filing a product there
 * was nearly always one level too high — but each still offers a quiet
 * "Something else in Women" for the seller who means it.
 *
 * Fewer questions when the shop allows: one main category hides step ①,
 * and a main category with nothing inside is itself the answer.
 */
export function CategoryPick({
  categories,
  value,
  onChange,
  onAdd,
}: {
  categories: StoreCategory[]
  value: string
  onChange: (categoryId: string) => void
  /** Opens the "add a category" sheet. */
  onAdd: () => void
}) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenOf = (id: string | null) => categories.filter((c) => c.parentId === id)
  const mains = childrenOf(null)
  const [mainId, setMainId] = useState(() => rootOf(value, byId) ?? mains[0]?.id ?? '')
  const [query, setQuery] = useState('')

  // A category added from the sheet may sit under another main: follow it.
  const valueRoot = rootOf(value, byId)
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    if (valueRoot && valueRoot !== mainId) setMainId(valueRoot)
  }

  const main = byId.get(mainId) ?? null
  const groups = main ? groupLeaves(main, childrenOf) : []
  const leafCount = groups.reduce((n, g) => n + g.leaves.length, 0)
  const q = query.trim().toLowerCase()
  const shown = q
    ? groups
        .map((g) => ({
          ...g,
          leaves: g.leaves.filter(
            (leaf) => leaf.name.toLowerCase().includes(q) || g.label.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.leaves.length > 0)
    : groups

  const pickMain = (id: string) => {
    setMainId(id)
    setQuery('')
    if (rootOf(value, byId) === id) return
    // One answer inside — or none, so the main category is the answer.
    const inside = groupLeaves(byId.get(id)!, childrenOf).flatMap((g) => g.leaves)
    onChange(inside.length === 1 ? inside[0]!.id : inside.length === 0 ? id : '')
  }

  const path = value ? pathOf(value, byId) : []
  const isLeafMain = main !== null && childrenOf(main.id).length === 0

  return (
    <div className="space-y-5">
      {mains.length > 1 && (
        <section aria-labelledby="pick-main">
          <StepLabel id="pick-main" n={1}>
            Main category
          </StepLabel>
          <div role="radiogroup" aria-labelledby="pick-main" className="mt-2.5 flex flex-wrap gap-2">
            {mains.map((m) => {
              const on = m.id === mainId
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickMain(m.id)}
                  className={`inline-flex min-h-tap items-center gap-1.5 rounded-pill border px-4 text-base font-semibold transition ${
                    on
                      ? 'border-brand bg-brand-soft text-brand ring-2 ring-brand/20'
                      : 'border-line bg-surface/70 text-fg hover:border-brand/50'
                  }`}
                >
                  {on && <CheckIcon className="h-4 w-4" />}
                  {m.name}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {main && !isLeafMain && (
        <section aria-labelledby="pick-sub">
          <StepLabel id="pick-sub" n={mains.length > 1 ? 2 : null}>
            Sub-category in <span className="text-brand">{main.name}</span>
          </StepLabel>

          {leafCount > 12 && (
            <label className="relative mt-2.5 block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search in ${main.name}`}
                aria-label={`Search sub-categories in ${main.name}`}
                className={`${inputClass} pl-10`}
              />
            </label>
          )}

          <div role="radiogroup" aria-labelledby="pick-sub" className="mt-2.5 space-y-4">
            {shown.map((group) => (
              <div key={group.id}>
                {group.label && (
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                    {group.label}
                    <span aria-hidden className="h-px flex-1 bg-line" />
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {group.leaves.map((leaf) => {
                    const on = leaf.id === value
                    return (
                      <button
                        key={leaf.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(leaf.id)}
                        className={`flex min-h-[52px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-base font-semibold break-words transition ${
                          on
                            ? 'border-brand bg-brand-soft text-fg ring-2 ring-brand/20'
                            : 'border-line bg-surface/70 text-fg hover:border-brand/50'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            on ? 'border-brand bg-brand text-brand-contrast' : 'border-fg/25'
                          }`}
                        >
                          {on && <CheckIcon className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0">{leaf.name}</span>
                      </button>
                    )
                  })}
                </div>
                {group.parent && !q && (
                  <Button
                    variant="ghost"
                    size="sm"
                    role="radio"
                    aria-checked={value === group.parent.id}
                    onClick={() => onChange(group.parent!.id)}
                    className="mt-1 px-2"
                  >
                    {/* Colour on the span: the ghost variant's own colour wins over a utility. */}
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm ${
                        value === group.parent.id ? 'text-brand' : 'text-muted'
                      }`}
                    >
                      {value === group.parent.id && <CheckIcon className="h-4 w-4" />}
                      Something else in {group.parent.name}
                    </span>
                  </Button>
                )}
              </div>
            ))}
            {q && shown.length === 0 && (
              <p className="text-hint text-muted">
                Nothing called “{query.trim()}” in {main.name}. Add it below.
              </p>
            )}
          </div>
        </section>
      )}

      {path.length > 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-hint text-muted">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            Customers find it under{' '}
            {path.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ' › '}
                <span className={i === path.length - 1 ? 'font-semibold text-fg' : 'text-fg'}>
                  {c.name}
                </span>
              </span>
            ))}
            , and through search.
          </span>
        </p>
      ) : (
        main &&
        !isLeafMain && (
          <p className="text-hint text-muted">Tap the sub-category that fits best.</p>
        )
      )}

      <div className="flex flex-wrap items-center gap-x-2">
        <span className="text-hint text-muted">Not in the list?</span>
        <Button variant="ghost" size="sm" onClick={onAdd} className="px-2">
          <span className="inline-flex items-center gap-1.5 text-brand">
            <PlusIcon className="h-4 w-4" />
            Add a category
          </span>
        </Button>
      </div>
    </div>
  )
}

function StepLabel({ id, n, children }: { id: string; n: number | null; children: ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-2 text-base font-semibold text-fg">
      {n !== null && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-contrast">
          {n}
        </span>
      )}
      <span>{children}</span>
    </p>
  )
}

type Group = {
  id: string
  /** "Women", "Women › Ethnic" — empty for leaves straight under the main. */
  label: string
  /** The node the heading names, offered as "Something else in …". */
  parent: StoreCategory | null
  leaves: StoreCategory[]
}

/** The main category's leaves, grouped by the levels between it and them. */
function groupLeaves(
  main: StoreCategory,
  childrenOf: (id: string | null) => StoreCategory[],
): Group[] {
  const groups: Group[] = []
  const direct: StoreCategory[] = []
  const walk = (node: StoreCategory, trail: StoreCategory[]) => {
    const kids = childrenOf(node.id)
    const leaves = kids.filter((k) => childrenOf(k.id).length === 0)
    if (trail.length === 0) direct.push(...leaves)
    else
      groups.push({
        id: node.id,
        label: trail.map((t) => t.name).join(' › '),
        parent: node,
        leaves,
      })
    for (const k of kids) if (childrenOf(k.id).length > 0) walk(k, [...trail, k])
  }
  walk(main, [])
  return [
    ...(direct.length > 0 ? [{ id: main.id, label: '', parent: null, leaves: direct }] : []),
    ...groups,
  ]
}

function rootOf(id: string, byId: Map<string, StoreCategory>): string | null {
  let node = byId.get(id)
  while (node?.parentId) node = byId.get(node.parentId)
  return node?.id ?? null
}

function pathOf(id: string, byId: Map<string, StoreCategory>): StoreCategory[] {
  const out: StoreCategory[] = []
  let node = byId.get(id)
  while (node) {
    out.unshift(node)
    node = node.parentId ? byId.get(node.parentId) : undefined
  }
  return out
}
