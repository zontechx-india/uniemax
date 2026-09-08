import { useEffect, useState } from 'react'
import { adminApi } from '../features/adminApi'
import type { ShelfRow } from '../features/adminApi'
import { useAdminList } from '../features/useAdminQuery'
import { taxonomyApi } from '../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../shared/categories/taxonomyApi'
import { toApiError } from '../../shared/auth/http'
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui/primitives'
import { Pagination } from '../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../ui/Toolbar'

/**
 * Pointing sellers' own shelves at the global category taxonomy.
 *
 * Every shelf a seller creates today is classified by construction — they
 * choose a category rather than typing one. This page exists for the shelves
 * that predate that rule: free text someone typed, which is very often a brand
 * ("KTM"), a vehicle model ("Duke 200") or a merchandising tier ("Pro
 * Edition") rather than a category at all. No automatic rule can map those
 * without guessing, so an admin decides one shelf at a time.
 *
 * Mapping never renames the shelf. A seller's storefront navigation is theirs,
 * and rewriting it would rebuild their shop out from under them — the mapping
 * only records what the shelf MEANS, which is what makes its products
 * findable across the platform.
 */

type Status = 'UNMAPPED' | 'MAPPED' | 'ALL'

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
  const status = (list.filters.status as Status) ?? 'UNMAPPED'

  return (
    <div>
      <PageHeader
        title="Category mapping"
        subtitle="Shelves sellers named themselves, before categories were chosen from a list. Map each one so its products are findable platform-wide — a brand or a special edition has no category, so leaving it unmapped is a valid answer."
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
            { value: 'UNMAPPED', label: 'Needs a decision' },
            { value: 'MAPPED', label: 'Mapped' },
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
              status === 'UNMAPPED'
                ? 'Every shelf is mapped'
                : 'No shelves match these filters'
            }
            {...(status === 'UNMAPPED'
              ? { hint: 'Nothing is waiting on a decision.' }
              : {})}
          />
        ) : (
          <div className="divide-y divide-line">
            {list.rows.map((shelf) => (
              <ShelfMappingRow
                key={shelf.id}
                shelf={shelf}
                taxonomy={taxonomy}
                onMapped={list.refresh}
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
 * an admin and a seller are picking from the same list in the same shape.
 */
function ShelfMappingRow({
  shelf,
  taxonomy,
  onMapped,
}: {
  shelf: ShelfRow
  taxonomy: CategoryNode[] | null
  onMapped: () => void
}) {
  const roots = taxonomy ?? []

  // Seed the selects from whatever the shelf already points at, so opening a
  // mapped row shows the current answer rather than an empty form.
  const currentRoot =
    roots.find((r) => r.id === shelf.categoryId) ??
    roots.find((r) => r.children.some((c) => c.id === shelf.categoryId))
  const [rootId, setRootId] = useState(currentRoot?.id ?? '')
  const [subId, setSubId] = useState(
    currentRoot && currentRoot.id !== shelf.categoryId
      ? (shelf.categoryId ?? '')
      : '',
  )
  const [applyToProducts, setApplyToProducts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const subs = roots.find((r) => r.id === rootId)?.children ?? []
  const chosen = subId || rootId || null
  const dirty = chosen !== shelf.categoryId

  const save = async (next: string | null) => {
    setError(null)
    setSaving(true)
    try {
      const result = await adminApi.setShelfCategory(shelf.id, {
        categoryId: next,
        applyToProducts,
      })
      setDone(
        next === null
          ? 'Unmapped.'
          : `Mapped${
              result.productsUpdated > 0
                ? ` · ${result.productsUpdated} product${
                    result.productsUpdated === 1 ? '' : 's'
                  } re-filed`
                : ''
            }`,
      )
      onMapped()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {shelf.shelfPath}
          </p>
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
        {shelf.category ? (
          <Chip tone="success">{shelf.category.pathLabel}</Chip>
        ) : (
          <Chip tone="neutral">Not mapped</Chip>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select
          value={rootId}
          onChange={(e) => {
            setRootId(e.target.value)
            setSubId('')
            setDone(null)
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
          disabled={saving || !chosen || !dirty}
          onClick={() => void save(chosen)}
        >
          {saving ? 'Saving…' : 'Map'}
        </Button>
        {shelf.categoryId && (
          <Button disabled={saving} onClick={() => void save(null)}>
            Unmap
          </Button>
        )}

        {shelf.productCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={applyToProducts}
              onChange={(e) => setApplyToProducts(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-[var(--brand)]"
            />
            Also re-file its {shelf.productCount} product
            {shelf.productCount === 1 ? '' : 's'}
          </label>
        )}

        {done && <span className="text-xs font-medium text-success">{done}</span>}
        {error && <span className="text-xs font-medium text-danger">{error}</span>}
      </div>
    </div>
  )
}
