import { useState } from 'react'
import type { PublicSection, PublicSort, PublicStore } from '../stores/storesApi'
import { ProductGrid } from './ProductCard'
import { FilterPanel } from './FilterPanel'
import { NO_FILTERS, activeFilterCount, type CatalogFilters } from './catalog'
import {
  Breadcrumb,
  GridSkeleton,
  LoadMore,
  NoResults,
  SortFilterBar,
  type Crumb,
} from './ListingControls'
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
      <SortFilterBar
        total={total}
        sort={sort}
        onSort={setSort}
        activeFilterCount={filterCount}
        onOpenFilters={() => setFiltersOpen(true)}
        skin={skin}
      />

      {error ? (
        <p className="rounded-lg border border-line p-6 text-center text-sm text-danger">
          {error}
        </p>
      ) : initialLoading ? (
        <GridSkeleton skin={skin} />
      ) : products.length === 0 ? (
        <NoResults
          onClear={clearAll}
          showClear={filterCount > 0 || sort !== 'newest'}
          skin={skin}
        />
      ) : (
        <>
          <ProductGrid store={store} products={products} skin={skin} />
          <LoadMore
            hasMore={hasMore}
            loading={loading}
            remaining={total - products.length}
            onLoadMore={loadMore}
            skin={skin}
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
