import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ListMeta } from '../../shared/auth/http'
import { useSeo } from '../../shared/seo'
import { buttonClass } from '../../shared/ui/Button'
import { EmptyState, ErrorState } from '../../shared/ui/states'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type {
  BrowsableCategory,
  MarketProduct,
  SearchResults,
} from '../features/discovery/discoveryApi'
import { StoreLogoTile } from '../features/discovery/MarketCards'
import {
  ListingHeader,
  ListingPagination,
  ListingSkeleton,
  ListingSort,
  MarketProductCard,
  parseListingSort,
  PRODUCT_LISTING_GRID,
} from '../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
import { SearchIcon } from '../layout/icons'

const PAGE_SIZE = 24
const MIN_CHARS = 2
/** Shops and store shelves the grouped search returns (its maximum). */
const SIDE_LIMIT = 10
/** Global categories shown above the products. */
const CATEGORY_LIMIT = 12

interface Loaded {
  products: { items: MarketProduct[]; meta: ListMeta }
  /** Shops + store shelves — page 1 only. */
  side: SearchResults | null
  /** Global taxonomy nodes whose name matches — page 1 only. */
  categories: BrowsableCategory[]
}

/**
 * `/search?q=` — the full results behind the header's search box (Enter or
 * "See all results"). Page 1 leads with what the shopper may have meant
 * instead of a product — matching **categories** (global `/c/` pages first,
 * then individual stores' shelves) and **shops** — then the products, paged
 * and sortable like a category page. Later pages are products only.
 *
 * `noindex, follow` with a canonical to the bare `/search`: a results page
 * per typed word is the textbook thin page, but its links still deserve to
 * be walked.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const sort = parseListingSort(params.get('sort'))
  const searchable = q.length >= MIN_CHARS

  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!searchable) return
    let cancelled = false
    setFailed(false)
    setData(null)
    const firstPage = page === 1
    Promise.all([
      discoveryApi.searchProducts(q, { page, pageSize: PAGE_SIZE, sort }),
      // The side panels are extras: a failure there must not cost the
      // shopper the products, so each falls back to nothing.
      firstPage ? discoveryApi.search(q, SIDE_LIMIT).catch(() => null) : null,
      firstPage ? discoveryApi.browsableCategories().catch(() => []) : [],
    ])
      .then(([products, side, all]) => {
        if (cancelled) return
        const needle = q.toLowerCase()
        setData({
          products,
          side,
          categories: all
            .filter((category) => category.name.toLowerCase().includes(needle))
            .slice(0, CATEGORY_LIMIT),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [q, page, sort, searchable, attempt])

  useSeo({
    title: searchable ? [`Search “${q}”`] : ['Search'],
    canonical: '/search',
    robots: 'noindex, follow',
  })

  const href = (target: number) => {
    const next = new URLSearchParams({ q })
    if (target > 1) next.set('page', String(target))
    if (sort !== 'newest') next.set('sort', sort)
    return `/search?${next}`
  }

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        {!searchable ? (
          <EmptyState
            icon={SearchIcon}
            title="Search UnieMax"
            description="Type at least two letters in the search box above to find products, shops and categories."
            action={
              <Link to="/categories" className={buttonClass({ variant: 'secondary', size: 'md' })}>
                Browse all categories
              </Link>
            }
          />
        ) : failed ? (
          <ErrorState
            message="Search could not load. Check your connection and try again."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : data === null ? (
          <ListingSkeleton />
        ) : (
          <Results
            q={q}
            data={data}
            sort={sort}
            href={href}
            onSort={(value) => {
              const next = new URLSearchParams({ q })
              if (value !== 'newest') next.set('sort', value)
              setParams(next)
            }}
          />
        )}
      </div>
    </MarketChrome>
  )
}

function Results({
  q,
  data,
  sort,
  href,
  onSort,
}: {
  q: string
  data: Loaded
  sort: ReturnType<typeof parseListingSort>
  href: (page: number) => string
  onSort: (sort: ReturnType<typeof parseListingSort>) => void
}) {
  const { products, side, categories } = data
  const shelves = side?.categories ?? []
  const shops = side?.stores ?? []
  const total = products.meta.total
  const nothing =
    total === 0 && shops.length === 0 && shelves.length === 0 && categories.length === 0

  if (nothing) {
    return (
      <>
        <ListingHeader title={`Results for “${q}”`} />
        <EmptyState
          icon={SearchIcon}
          title="No results found"
          description="Check the spelling, try a shorter or more general word, or browse the categories."
          action={
            <Link to="/categories" className={buttonClass({ size: 'md' })}>
              Browse all categories
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <ListingHeader
        title={`Results for “${q}”`}
        lead={`${total} product${total === 1 ? '' : 's'} found`}
      />

      {(categories.length > 0 || shelves.length > 0) && (
        <section className="mt-6" aria-labelledby="search-categories">
          <h2 id="search-categories" className="text-sm font-semibold text-fg">
            Categories
          </h2>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link to={`/c/${category.slug}`} className={CHIP}>
                  {category.name}
                  <span className="text-xs text-muted">{category.productCount}</span>
                </Link>
              </li>
            ))}
            {/* A store's own shelf lives in the public router — full load. */}
            {shelves.map((shelf) => (
              <li key={shelf.id}>
                <a href={`/store/${shelf.store.slug}/category/${shelf.slug}`} className={CHIP}>
                  {shelf.parentName ? `${shelf.parentName} › ${shelf.name}` : shelf.name}
                  <span className="text-xs text-muted">in {shelf.store.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shops.length > 0 && (
        <section className="mt-6" aria-labelledby="search-shops">
          <h2 id="search-shops" className="text-sm font-semibold text-fg">
            Shops
          </h2>
          <ul className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shops.map((shop) => (
              <li key={shop.id}>
                <a
                  href={`/store/${shop.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent"
                >
                  <StoreLogoTile logoUrl={shop.logoUrl} className="h-11 w-11 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                      {shop.name}
                    </span>
                    <span className="block text-xs text-muted">Visit store →</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {total > 0 && (
        <section className="mt-8" aria-labelledby="search-products">
          <div className="flex items-center justify-between gap-4">
            <h2 id="search-products" className="text-sm font-semibold text-fg">
              Products
            </h2>
            <ListingSort value={sort} onChange={onSort} />
          </div>
          <ul className={`mt-4 ${PRODUCT_LISTING_GRID}`}>
            {products.items.map((product) => (
              <MarketProductCard key={product.id} product={product} />
            ))}
          </ul>
          <ListingPagination meta={products.meta} href={href} />
        </section>
      )}
    </>
  )
}

const CHIP =
  'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand'
