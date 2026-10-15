import { useEffect, useState } from 'react'
import {
  publicStoreApi,
  storeShopUrl,
  type PublicProduct,
  type PublicSection,
  type PublicSort,
  type PublicStore,
} from '../stores/storesApi'
import { ProductGrid } from './ProductCard'
import { FilterPanel } from './FilterPanel'
import { NO_FILTERS, activeFilterCount, type CatalogFilters } from './catalog'
import {
  Breadcrumb,
  GridSkeleton,
  LoadMore,
  NoResults,
  SectionHeading,
  SortFilterBar,
  type Crumb,
} from './ListingControls'
import { SEARCH_MIN_PRODUCTS, shopProductCount } from './shopShape'

/** Products suggested under a search that found nothing. */
const SUGGESTED_COUNT = 4
import { useProductQuery } from './useProductQuery'
import { StorePageShell } from './PublicStoreLayout'
import type { Skin } from './storeTheme'

/**
 * The shared product-listing body used by both the category page and search
 * results: breadcrumb, title, sort & filter bar, grid, Load More.
 *
 * All narrowing is delegated to the server through `useProductQuery` — this
 * component only owns the *controls*, never a copy of the catalog.
 */
export function ProductListing({
  store,
  skin,
  title,
  subtitle,
  trail,
  /** Category slug to scope to; omitted for search across the whole store. */
  category,
  /** Free-text query; omitted on a category page. */
  q,
  /** Merchandising section to scope to (homepage "View all" target). */
  section,
  /** Rendered between the header and the grid (e.g. subcategory chips). */
  children,
}: {
  store: PublicStore
  skin: Skin
  title: string
  subtitle?: string
  trail: Crumb[]
  category?: string
  q?: string
  section?: PublicSection
  children?: React.ReactNode
}) {
  const [sort, setSort] = useState<PublicSort>('newest')
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { products, total, loading, initialLoading, error, hasMore, loadMore } =
    useProductQuery(store.slug, {
      category,
      q,
      section,
      sort,
      inStock: filters.inStockOnly || undefined,
      minPrice: filters.minPrice ?? undefined,
      maxPrice: filters.maxPrice ?? undefined,
    })

  const filterCount = activeFilterCount(filters)
  const nothing = !initialLoading && !error && products.length === 0

  // A search that finds nothing still shows the shop's newest few, so the
  // page offers somewhere to go instead of ending at "no results".
  const [suggested, setSuggested] = useState<PublicProduct[]>([])
  const suggest = nothing && Boolean(q) && filterCount === 0
  useEffect(() => {
    if (!suggest) return
    let cancelled = false
    publicStoreApi
      .listProducts(store.slug, { pageSize: SUGGESTED_COUNT })
      .then(({ items }) => {
        if (!cancelled) setSuggested(items)
      })
      .catch(() => {
        // Suggestions are a nicety; the no-results card stands on its own.
      })
    return () => {
      cancelled = true
    }
  }, [suggest, store.slug])

  // Sort and filter earn their bar on a catalogue big enough to need them.
  // A shop smaller than that (most of them) — or a search with nothing in it
  // — gets a quiet count instead, unless a filter is already applied (the
  // bar is how it gets cleared).
  const showBar =
    filterCount > 0 ||
    (shopProductCount(store) >= SEARCH_MIN_PRODUCTS && !nothing)

  const clearAll = () => {
    setFilters(NO_FILTERS)
    setSort('newest')
  }

  return (
    <StorePageShell>
      <Breadcrumb
        storeSlug={store.slug}
        storeName={store.name}
        trail={trail}
        skin={skin}
      />

      <h1
        className={`font-heading text-2xl font-semibold sm:text-3xl ${skin.text}`}
      >
        {title}
      </h1>
      {subtitle && <p className={`mt-1 text-sm ${skin.muted}`}>{subtitle}</p>}

      {children}

      {/* No wrapper: a sticky element can only travel inside its parent's
          box, and a div sized to the bar itself let it scroll straight away. */}
      {showBar ? (
        <SortFilterBar
          total={total}
          sort={sort}
          onSort={setSort}
          activeFilterCount={filterCount}
          onOpenFilters={() => setFiltersOpen(true)}
          skin={skin}
        />
      ) : (
        !initialLoading &&
        !nothing && (
          <p className={`mb-5 mt-1 text-sm ${skin.muted}`}>
            {total} {total === 1 ? 'product' : 'products'}
          </p>
        )
      )}

      {error ? (
        <p className="rounded-lg border border-line p-6 text-center text-sm text-danger">
          {error}
        </p>
      ) : initialLoading ? (
        <GridSkeleton skin={skin} />
      ) : products.length === 0 ? (
        <div className={showBar ? '' : 'mt-6'}>
          <NoResults
            onClear={clearAll}
            showClear={filterCount > 0 || sort !== 'newest'}
            query={q}
            clearSearchTo={q ? storeShopUrl(store.slug) : undefined}
            skin={skin}
          />
          {suggest && suggested.length > 0 && (
            <section className="mt-10">
              <SectionHeading title="You might like" skin={skin} />
              <div className="mt-4">
                <ProductGrid store={store} products={suggested} skin={skin} />
              </div>
            </section>
          )}
        </div>
      ) : (
        <>
          <ProductGrid store={store} products={products} skin={skin} />
          <LoadMore
            hasMore={hasMore}
            loading={loading}
            remaining={total - products.length}
            onLoadMore={loadMore}
          />
        </>
      )}

      <FilterPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        skin={skin}
      />
    </StorePageShell>
  )
}
