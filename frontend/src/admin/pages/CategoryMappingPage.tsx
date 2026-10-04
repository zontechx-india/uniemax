import { useState } from 'react'
import { adminApi } from '../features/adminApi'
import type { CatalogCoverage, ShelfConversionPlan, ShelfRow } from '../features/adminApi'
import { useAdminList, useAdminQuery } from '../features/useAdminQuery'
import type { QueryResult } from '../features/useAdminQuery'
import { CategoryPicker } from '../../shared/categories/CategoryPicker'
import { toApiError } from '../../shared/auth/http'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../ui/primitives'
import { Pagination } from '../ui/DataTable'
import { formatCount } from '../ui/format'
import { StatTile } from '../ui/StatTile'
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
 *
 * The coverage panel on top is why this work matters: a product on an
 * unconverted shelf has no platform category, so it is missing from every
 * global category page (`/c/{slug}`) and the category sitemap. It shows how
 * much of the live catalog those pages reach, and which stores to convert
 * first — picking one filters the queue to its shelves.
 */

type Status = 'PENDING' | 'CONVERTED' | 'ALL'

export default function CategoryMappingPage() {
  const list = useAdminList<ShelfRow>(
    (query) => adminApi.listShelves(query),
    { keys: ['q', 'status', 'storeId'], pageSize: 20 },
  )
  const coverage = useAdminQuery(() => adminApi.catalogCoverage())
  const status = (list.filters.status as Status) ?? 'PENDING'
  const storeId = list.filters.storeId ?? null
  const storeName =
    coverage.data?.stores.find((store) => store.id === storeId)?.name ??
    list.rows.find((row) => row.store.id === storeId)?.store.name ??
    'this store'

  // A conversion moves the coverage numbers as well as the queue.
  const refreshAll = () => {
    list.refresh()
    coverage.refresh()
  }

  return (
    <div>
      <PageHeader
        title="Category mapping"
        subtitle="Shelves sellers typed themselves, before categories were chosen from a list. Convert each one into the platform category it stands for — the typed shelf is replaced, and its products move with it."
      />

      <CoveragePanel
        query={coverage}
        activeStoreId={storeId}
        onPickStore={(id) => list.setFilter('storeId', id === storeId ? '' : id)}
      />

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
          {storeId && (
            <button
              type="button"
              onClick={() => list.setFilter('storeId', '')}
              aria-label={`Show every store, not only ${storeName}`}
            >
              <Chip tone="info">{storeName} ×</Chip>
            </button>
          )}
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
              <ShelfRowView key={shelf.id} shelf={shelf} onConverted={refreshAll} />
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
 * How much of the live catalog the global category pages reach, and where
 * the gap is. Counted by the server over exactly the products a category
 * page could list (`GET /admin/catalog/coverage`).
 */
function CoveragePanel({
  query,
  activeStoreId,
  onPickStore,
}: {
  query: QueryResult<CatalogCoverage>
  activeStoreId: string | null
  onPickStore: (storeId: string) => void
}) {
  if (query.error) {
    return (
      <Card className="mb-4">
        <ErrorState message={query.error} onRetry={query.refresh} />
      </Card>
    )
  }
  if (!query.data) {
    return (
      <Card className="mb-4">
        <Skeleton rows={2} />
      </Card>
    )
  }

  const c = query.data
  // Floored, so a single missing product never rounds up to "100%".
  const reach = c.discoverableProducts
    ? Math.floor((c.onCategoryPages / c.discoverableProducts) * 100)
    : 100

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="On category pages"
          value={`${reach}%`}
          hint={`${formatCount(c.onCategoryPages)} of ${formatCount(c.discoverableProducts)} live products`}
        />
        <StatTile
          label="Missing — no category"
          value={formatCount(c.unclassifiedProducts)}
          hint={
            c.shelvesToConvert > 0
              ? `On ${formatCount(c.shelvesToConvert)} shelf${c.shelvesToConvert === 1 ? '' : 'ves'} to convert`
              : 'Every live product has a category'
          }
          tone={c.unclassifiedProducts > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Missing — category disabled"
          value={formatCount(c.inDisabledCategories)}
          hint="Re-enable the category to bring them back"
          to="/categories"
          tone={c.inDisabledCategories > 0 ? 'warning' : 'default'}
        />
      </div>

      {c.stores.length > 0 && (
        <Card>
          <CardHeader
            title="Convert first"
            subtitle="Stores with the most live products missing from category pages. Pick one to see only its shelves."
          />
          <div className="flex flex-wrap gap-2">
            {c.stores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => onPickStore(store.id)}
                aria-pressed={store.id === activeStoreId}
              >
                <Chip tone={store.id === activeStoreId ? 'info' : 'neutral'}>
                  {store.name} · {formatCount(store.unclassifiedProducts)}
                </Chip>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * One shelf and its decision. The picker is the same one sellers use, so an
 * admin and a seller pick from the same tree in the same way — any depth.
 */
function ShelfRowView({
  shelf,
  onConverted,
}: {
  shelf: ShelfRow
  onConverted: () => void
}) {
  // Seeded from whatever the shelf is already linked to, so a half-converted
  // row opens on its current answer rather than blank.
  const [chosen, setChosen] = useState<string | null>(shelf.categoryId)
  const [plan, setPlan] = useState<ShelfConversionPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

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

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {/* includeInactive: an admin may need to file a shelf under a category
            that is currently disabled, and hiding it would look like a missing one. */}
        <CategoryPicker
          value={chosen}
          onChange={(id) => {
            setChosen(id)
            setDone(null)
            setError(null)
          }}
          selected={shelf.category}
          label=""
          placeholder="Choose the platform category…"
          includeInactive
          className="min-w-72 flex-1"
        />

        <Button
          variant="primary"
          disabled={planning || converting || !chosen || noop}
          onClick={() => void preview()}
        >
          {planning ? 'Checking…' : 'Convert'}
        </Button>

        {done && <span className="pb-2.5 text-xs font-medium text-success">{done}</span>}
        {error && <span className="pb-2.5 text-xs font-medium text-danger">{error}</span>}
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
  const subs =
    plan.from.subcategoryCount > 0
      ? `, along with its ${plan.from.subcategoryCount} subcategor${
          plan.from.subcategoryCount === 1 ? 'y' : 'ies'
        }`
      : ''
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
            {subs}.
          </li>
        ) : (
          <li>
            {plan.nameChanges ? (
              <>
                Renamed to <span className="font-medium text-fg">“{plan.to.name}”</span>
                {plan.parent ? ' and ' : subs ? ' ' : '.'}
              </>
            ) : plan.parent ? (
              'Moved '
            ) : (
              'Linked to the platform category.'
            )}
            {plan.parent && (
              <>
                placed under <span className="font-medium text-fg">“{plan.parent.name}”</span>
                {plan.parent.created ? ' (created for it)' : ''}
                {subs.replace(/^,/, '')}.
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
