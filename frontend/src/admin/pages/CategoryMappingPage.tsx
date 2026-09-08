import { useEffect, useState } from 'react'
import { adminApi } from '../features/adminApi'
import type { ShelfConversionPlan, ShelfRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { taxonomyApi } from '../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../shared/categories/taxonomyApi'
import { toApiError } from '../../shared/auth/http'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui/primitives'
import { Pagination } from '../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../ui/Toolbar'

/**
 * Converting sellers' typed shelves into platform categories.
 *
 * Every shelf a seller creates today IS a platform category — they choose one
 * rather than typing a name. This page exists to retire the shelves that
 * predate that rule: free text someone typed ("Bag", "Cricket Bats", "KTM").
 * Converting one replaces it: the shelf is renamed and re-parented to match
 * the chosen category, its products move with it, and if the store already
 * holds that category the legacy shelf merges into it and disappears.
 *
 * Conversion is one-way — a merge cannot be un-merged — so the server plans
 * it first and the confirm dialog shows exactly that plan. What the admin
 * approves is what runs; nothing is folded in silently.
 */

type Status = 'PENDING' | 'CONVERTED' | 'ALL'

export default function CategoryMappingPage() {
  const [taxonomy, setTaxonomy] = useState<CategoryNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // activeOnly: false — an admin may need to file a shelf under a category
    // that is currently disabled, and hiding it would look like a missing one.
    taxonomyApi
      .adminTree(false)
      .then(setTaxonomy)
      .catch((err) => setError(toApiError(err).message))
  }, [])

  const list = useAdminList<ShelfRow>(
    (query) => adminApi.listShelves(query),
    { keys: ['q', 'status'], pageSize: 20 },
  )
  const status = (list.filters.status as Status) ?? 'PENDING'

  return (
    <div>
      <PageHeader
        title="Category mapping"
        subtitle="Shelves sellers typed themselves, before categories were chosen from a list. Convert each one into the platform category it stands for — the typed shelf is replaced, and its products move with it."
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      )}

      <Card>
        <Tabs<Status>
          value={status}
          onChange={(next) => list.setFilter('status', next === 'ALL' ? '' : next)}
          options={[
            { value: 'PENDING', label: 'Not changed' },
            { value: 'CONVERTED', label: 'Changed' },
            { value: 'ALL', label: 'All' },
          ]}
        />
        <Toolbar>
          <SearchInput
            value={(list.filters.q as string) ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder="Search shelf or store…"
          />
        </Toolbar>

        {list.loading ? (
          <div className="p-4">
            <Skeleton rows={8} />
          </div>
        ) : list.error ? (
          <div className="p-4">
            <ErrorState message={list.error} onRetry={list.refresh} />
          </div>
        ) : list.rows.length === 0 ? (
          <EmptyState
            title={
              status === 'PENDING'
                ? 'Every shelf is a platform category'
                : 'No shelves match these filters'
            }
            {...(status === 'PENDING'
              ? { hint: 'Nothing left to convert.' }
              : {})}
          />
        ) : (
          <div className="divide-y divide-line">
            {list.rows.map((shelf) => (
              <ShelfRowView
                key={shelf.id}
                shelf={shelf}
                taxonomy={taxonomy}
                onConverted={list.refresh}
              />
            ))}
          </div>
        )}

        <Pagination
          page={list.meta.page}
          totalPages={list.meta.totalPages}
          total={list.meta.total}
          onPage={list.setPage}
          busy={list.loading}
        />
      </Card>
    </div>
  )
}

/**
 * One shelf and its decision. The two selects mirror the seller's own form, so
 * an admin and a seller pick from the same list in the same shape.
 */
function ShelfRowView({
  shelf,
  taxonomy,
  onConverted,
}: {
  shelf: ShelfRow
  taxonomy: CategoryNode[] | null
  onConverted: () => void
}) {
  const roots = taxonomy ?? []

  // Seed the selects from whatever the shelf is already linked to, so a
  // half-converted row opens on its current answer rather than blank.
  const currentRoot =
    roots.find((r) => r.id === shelf.categoryId) ??
    roots.find((r) => r.children.some((c) => c.id === shelf.categoryId))
  const [rootId, setRootId] = useState(currentRoot?.id ?? '')
  const [subId, setSubId] = useState(
    currentRoot && currentRoot.id !== shelf.categoryId
      ? (shelf.categoryId ?? '')
      : '',
  )
  const [plan, setPlan] = useState<ShelfConversionPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const subs = roots.find((r) => r.id === rootId)?.children ?? []
  const chosen = subId || rootId || null
  // A converted shelf re-chosen as itself has nothing to do.
  const noop = shelf.converted && chosen === shelf.categoryId

  const preview = async () => {
    if (!chosen) return
    setError(null)
    setPlanning(true)
    try {
      const next = await adminApi.planShelfConversion(shelf.id, chosen)
      if (next.blocked) setError(next.blocked)
      else setPlan(next)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setPlanning(false)
    }
  }

  const convert = async () => {
    if (!chosen) return
    setConverting(true)
    try {
      const result = await adminApi.convertShelf(shelf.id, chosen)
      setPlan(null)
      setDone(
        result.plan.action === 'merge'
          ? `Merged into "${result.shelf.name}"`
          : `Converted to ${result.shelf.category?.pathLabel ?? result.shelf.name}`,
      )
      onConverted()
    } catch (err) {
      setPlan(null)
      setError(toApiError(err).message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{shelf.shelfPath}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {shelf.store.name} · {shelf.productCount} product
            {shelf.productCount === 1 ? '' : 's'}
            {shelf.subcategoryCount > 0 &&
              ` · ${shelf.subcategoryCount} subcategor${
                shelf.subcategoryCount === 1 ? 'y' : 'ies'
              }`}
            {!shelf.isActive && ' · disabled'}
          </p>
        </div>
        {shelf.state === 'converted' && shelf.category ? (
          <Chip tone="success">{shelf.category.pathLabel}</Chip>
        ) : shelf.state === 'tagged' && shelf.category ? (
          <Chip tone="neutral">Tagged {shelf.category.pathLabel} · not converted</Chip>
        ) : (
          <Chip tone="neutral">Typed by seller</Chip>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={rootId}
          onChange={(e) => {
            setRootId(e.target.value)
            setSubId('')
            setDone(null)
            setError(null)
          }}
          aria-label={`Category for ${shelf.shelfPath}`}
          className="h-9 min-w-44 rounded-md border border-line bg-input px-2.5 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="">{taxonomy === null ? 'Loading…' : 'Category…'}</option>
          {roots.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
              {node.isActive ? '' : ' (disabled)'}
            </option>
          ))}
        </select>

        <select
          value={subId}
          disabled={subs.length === 0}
          onChange={(e) => {
            setSubId(e.target.value)
            setDone(null)
            setError(null)
          }}
          aria-label={`Subcategory for ${shelf.shelfPath}`}
          className="h-9 min-w-44 rounded-md border border-line bg-input px-2.5 text-sm text-fg outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="">
            {rootId === ''
              ? 'Subcategory…'
              : subs.length === 0
                ? 'No subcategories'
                : 'All of this category'}
          </option>
          {subs.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>

        <Button
          variant="primary"
          disabled={planning || converting || !chosen || noop}
          onClick={() => void preview()}
        >
          {planning ? 'Checking…' : 'Convert'}
        </Button>

        {done && <span className="text-xs font-medium text-success">{done}</span>}
        {error && <span className="text-xs font-medium text-danger">{error}</span>}
      </div>

      <ConfirmDialog
        open={plan !== null}
        title={plan?.action === 'merge' ? 'Merge this shelf?' : 'Convert this shelf?'}
        tone="neutral"
        description={plan ? <PlanSummary plan={plan} store={shelf.store.name} /> : null}
        confirmLabel={plan?.action === 'merge' ? 'Merge' : 'Convert'}
        busy={converting}
        onConfirm={() => void convert()}
        onCancel={() => setPlan(null)}
      />
    </div>
  )
}

/** The server's plan, in the admin's words — this is what they are approving. */
function PlanSummary({ plan, store }: { plan: ShelfConversionPlan; store: string }) {
  const products =
    plan.productsMoved === 0
      ? 'No products are affected.'
      : `${plan.productsMoved} product${plan.productsMoved === 1 ? '' : 's'} move with it.`
  return (
    <div className="space-y-2">
      <p>
        In <span className="font-medium text-fg">{store}</span>,{' '}
        <span className="font-medium text-fg">“{plan.from.shelfPath}”</span> becomes{' '}
        <span className="font-medium text-fg">{plan.to.pathLabel}</span>.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {plan.action === 'merge' ? (
          <li>
            The store already has a “{plan.mergeInto?.name}” shelf for this category,
            so “{plan.from.name}” is <span className="font-medium text-fg">merged into it and deleted</span>
            {plan.from.subcategoryCount > 0 &&
              `, along with its ${plan.from.subcategoryCount} subcategor${
                plan.from.subcategoryCount === 1 ? 'y' : 'ies'
              }`}
            .
          </li>
        ) : (
          <li>
            {plan.nameChanges ? (
              <>
                Renamed to <span className="font-medium text-fg">“{plan.to.name}”</span>
                {plan.parent ? ' and ' : '.'}
              </>
            ) : plan.parent ? (
              'Moved '
            ) : (
              'Linked to the platform category.'
            )}
            {plan.parent && (
              <>
                placed under <span className="font-medium text-fg">“{plan.parent.name}”</span>
                {plan.parent.created ? ' (created for it)' : ''}.
              </>
            )}
          </li>
        )}
        <li>{products}</li>
        {plan.nameChanges && plan.action === 'rename' && (
          <li>The storefront link changes; the old one stops working.</li>
        )}
      </ul>
      <p className="text-xs">This cannot be undone.</p>
    </div>
  )
}
