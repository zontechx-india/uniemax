import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { Select } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { BagIcon, BoxIcon, UsersIcon } from '../../../../storefront/layout/icons'
import { PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { suppliedApi } from '../../api'
import type { CatalogItem } from '../../api'
import { earnTone } from '../../pricing'
import { dayText, money, useLoad } from '../../ui'
import { AddSheet } from './AddSheet'

/**
 * Store management → Supplier products: what the seller's suppliers offer,
 * with "You earn" for this shop, and adding one or many to the shop.
 */
export function SupplierProductsPage() {
  const { store } = useManagedStore()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Map<string, CatalogItem>>(new Map())
  const [adding, setAdding] = useState<CatalogItem[] | null>(null)

  // Search as the seller pauses typing, not on every key.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const catalog = useLoad(
    () =>
      suppliedApi.catalog(store.id, {
        ...(search ? { q: search } : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(categoryId ? { categoryId } : {}),
        page,
      }),
    [store.id, search, supplierId, categoryId, page],
  )
  const data = catalog.data

  const toggle = (item: CatalogItem) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(item.supplyProductId)) next.delete(item.supplyProductId)
      else next.set(item.supplyProductId, item)
      return next
    })

  const filtering = Boolean(search || supplierId || categoryId)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BagIcon}
        title="Supplier products"
        description="Products your suppliers ship for you. Add them to your shop at your own price — no stock needed."
      />

      {catalog.loading && !data && <PageSkeleton label="Loading supplier products" />}
      {catalog.error && <ErrorState message={catalog.error} onRetry={catalog.reload} />}

      {data && data.filters.suppliers.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title="Invite a supplier first"
          description="Once your supplier joins and offers products, they show up here."
          action={
            <Link to="../suppliers" className={buttonClass({ variant: 'primary' })}>
              Invite a supplier
            </Link>
          }
        />
      )}

      {data && data.filters.suppliers.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="sr-only">Search supplier products</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="h-field w-full rounded-md border border-line bg-input px-4 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            {data.filters.suppliers.length > 1 && (
              <Select
                className="h-field"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value)
                  setPage(1)
                }}
                aria-label="Supplier"
              >
                <option value="">All suppliers</option>
                {data.filters.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            {data.filters.categories.length > 1 && (
              <Select
                className="h-field"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setPage(1)
                }}
                aria-label="Category"
              >
                <option value="">All categories</option>
                {data.filters.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              icon={BoxIcon}
              compact
              title={filtering ? 'Nothing matches' : 'No products offered yet'}
              description={
                filtering
                  ? 'Try another word or show all suppliers.'
                  : "Your suppliers haven't offered any products yet. They'll show up here as soon as they do."
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((item) => (
                <CatalogCard
                  key={item.supplyProductId}
                  item={item}
                  warnPct={data.store.minMarginWarnPct}
                  selected={selected.has(item.supplyProductId)}
                  onSelect={() => toggle(item)}
                  onAdd={() => setAdding([item])}
                />
              ))}
            </ul>
          )}

          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <span className="text-sm text-fg">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setAdding([...selected.values()])}>
              Add {selected.size} to my store
            </Button>
          </div>
        </div>
      )}

      {adding && data && (
        <AddSheet
          storeId={store.id}
          items={adding}
          context={data.store}
          onClose={() => setAdding(null)}
          onAdded={(count) => {
            setAdding(null)
            setSelected(new Map())
            showToast(count === 1 ? 'Added to your shop — see it in Products' : `${count} added to your shop — see them in Products`)
            catalog.reload()
          }}
        />
      )}
    </div>
  )
}

function CatalogCard({
  item,
  warnPct,
  selected,
  onSelect,
  onAdd,
}: {
  item: CatalogItem
  warnPct: number
  selected: boolean
  onSelect: () => void
  onAdd: () => void
}) {
  const inStore = item.inStoreProductId !== null
  const tone = earnTone(item.youEarn, item.suggestedPrice, warnPct)
  return (
    <li className={`flex flex-col rounded-lg border bg-surface p-3 ${selected ? 'border-brand' : 'border-line'}`}>
      <div className="flex gap-3">
        <span className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-surface-alt text-muted">
          {item.imageUrl ? (
            <MediaImg src={item.imageUrl} sizes="80px" alt="" className="h-full w-full object-cover" />
          ) : (
            <BoxIcon className="m-7 h-6 w-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-fg">{item.name}</p>
          <p className="truncate text-xs text-muted">by {item.supplier.name}</p>
          <p className="mt-1 text-xs text-muted">
            Supplier price{' '}
            <span className="font-medium text-fg">
              {item.costMin === item.costMax ? money(item.costMin) : `${money(item.costMin)}+`}
            </span>{' '}
            · Suggested <span className="font-medium text-fg">{money(item.suggestedPrice)}</span>
          </p>
          <p className={`text-sm font-semibold ${tone === 'loss' ? 'text-danger' : tone === 'low' ? 'text-warning' : 'text-success'}`}>
            You earn {money(item.youEarn)}
          </p>
        </div>
        {!inStore && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${item.name}`}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        {item.delivery} · {item.returnDays === 0 ? 'No returns' : `${item.returnDays}-day returns`} · Ships within{' '}
        {dayText(item.shipWithinDays)}
      </p>
      <div className="mt-3">
        {inStore ? (
          <Link to="../products" className={buttonClass({ variant: 'ghost', size: 'sm', full: true })}>
            In your shop — view
          </Link>
        ) : (
          <Button variant="secondary" size="sm" full onClick={onAdd}>
            Add to my store
          </Button>
        )}
      </div>
    </li>
  )
}
