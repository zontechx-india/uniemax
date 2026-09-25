import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type {
  BrowseCategoryPage as BrowsePage,
  BrowseSort,
  MarketProduct,
} from '../features/discovery/discoveryApi'
import { formatPrice } from '../features/stores/storesApi'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
import { BoxIcon } from '../layout/icons'
import { buttonClass } from '../../shared/ui/Button'

/**
 * `/c/{slug}` — a **global category landing page**.
 *
 * The one page type on the platform whose subject is a kind of product
 * rather than a shop. Everything else is addressed inside a store, which is
 * right for shopping and useless for search: nobody googles a shop they have
 * never heard of, they google "men's jackets". This page is what such a
 * search can land on, and it hands the visitor straight to whichever seller
 * stocks one.
 *
 * It is built on `StoreProduct.globalCategoryId` — the tag placing a product
 * on the platform taxonomy independently of the shelf its seller filed it
 * under. A shelf is merchandising ("KTM > Duke 200"); the tag is what the
 * thing *is*. Only the second aggregates across stores.
 *
 * ## SEO shape
 *
 * - A real `<h1>` that is the category name, and a lead paragraph naming the
 *   category and how many shops stock it — the two things the page must be
 *   about for it to rank for the category at all.
 * - Child categories as **links**, so the branch below is crawlable. The
 *   homepage's category row links here, which is how these pages get found.
 * - `?page=`/`?sort=` canonical back to the bare slug, and carry
 *   `noindex, follow`: page 2 of a listing competes with page 1 for the same
 *   term while offering nothing new to rank, but its links still deserve to
 *   be walked.
 * - A node whose branch is empty renders (a shopper can still arrive by
 *   drilling down) but is `noindex` — an empty page dilutes every page that
 *   works. Such nodes are also absent from the sitemap.
 */
const PAGE_SIZE = 24

const SORTS: { value: BrowseSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'priceDesc', label: 'Price: high to low' },
]

export function BrowseCategoryPage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()

  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const rawSort = params.get('sort') ?? ''
  const sort: BrowseSort = SORTS.some((option) => option.value === rawSort)
    ? (rawSort as BrowseSort)
    : 'newest'

  const [data, setData] = useState<BrowsePage | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setData(undefined)
    discoveryApi
      .browseCategory(slug, { page, pageSize: PAGE_SIZE, sort })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug, page, sort])

  useBrowseSeo(slug, data, page, sort)

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        {data === undefined && <Skeleton />}
        {data === null && <NotFound />}
        {data && <Loaded data={data} sort={sort} onSort={setParams} />}
      </div>
    </MarketChrome>
  )
}

/**
 * The page's head. Kept here rather than in `Loaded` because React flushes
 * child effects before parent ones — written on the child, this page's own
 * write would run afterwards and overwrite it.
 */
function useBrowseSeo(
  slug: string,
  data: BrowsePage | null | undefined,
  page: number,
  sort: BrowseSort,
) {
  const name = data?.category.name
  const total = data?.meta.total ?? 0
  const shops = data ? new Set(data.products.map((p) => p.store.slug)).size : 0
  // Page 2+ and any sort other than the default are the same set of products
  // re-cut. They are real pages a visitor can reach, and duplicate pages a
  // crawler should not index.
  const scoped = page > 1 || sort !== 'newest'

  useSeo({
    title: name ? [name, 'Shop by category'] : ['Shop by category'],
    description: name
      ? total > 0
        ? `Shop ${name} on UnieMax — ${total} product${total === 1 ? '' : 's'}${
            shops > 1 ? ` from ${shops} independent shops` : ''
          }. Buy direct from the seller with cash on delivery or secure online payment.`
        : `${name} on UnieMax — buy direct from independent sellers with cash on delivery or secure online payment.`
      : null,
    canonical: `/c/${slug}`,
    robots: !data || total === 0 || scoped ? 'noindex, follow' : null,
    jsonLd:
      data && total > 0 && !scoped
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { name: 'UnieMax', path: '/' },
                ...data.category.path.map((crumb) => ({
                  name: crumb.name,
                  path: `/c/${crumb.slug}`,
                })),
              ].map((crumb, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: crumb.name,
                item: new URL(crumb.path, window.location.origin).href,
              })),
            },
            // The grid as an ordered list of links. It is what tells Google
            // this page is a listing of these specific products rather than
            // an article that happens to mention them.
            {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: data.category.name,
              numberOfItems: data.products.length,
              itemListElement: data.products.map((product, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: new URL(
                  `/store/${product.store.slug}/product/${product.slug}`,
                  window.location.origin,
                ).href,
                name: product.name,
              })),
            },
          ]
        : null,
  })
}

function Loaded({
  data,
  sort,
  onSort,
}: {
  data: BrowsePage
  sort: BrowseSort
  onSort: (params: URLSearchParams) => void
}) {
  const { category, children, products, meta } = data
  const shops = new Set(products.map((product) => product.store.slug)).size
  // Root first, this node last — the node itself is the <h1>, so it is not
  // repeated as a crumb.
  const ancestors = category.path.slice(0, -1)

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <li>
            <Link to="/" className="transition-colors hover:text-brand">
              UnieMax
            </Link>
          </li>
          {ancestors.map((crumb) => (
            <li key={crumb.slug} className="flex items-center gap-1.5">
              <span aria-hidden>›</span>
              <Link
                to={`/c/${crumb.slug}`}
                className="transition-colors hover:text-brand"
              >
                {crumb.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="font-heading text-2xl font-semibold text-fg sm:text-3xl">
        {category.name}
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted">
        {meta.total > 0 ? (
          <>
            {meta.total} product{meta.total === 1 ? '' : 's'}
            {shops > 1 ? ` from ${shops} independent shops` : ''} on UnieMax —
            buy direct from the seller.
          </>
        ) : (
          <>
            Nothing listed under {category.name} yet. Browse the rest of the
            marketplace, or check back soon.
          </>
        )}
      </p>

      {children.length > 0 && (
        // Real links, not filter buttons: this row is how a crawler walks the
        // branch below, and how the deeper pages earn any authority at all.
        <ul className="mt-5 flex flex-wrap gap-2">
          {children.map((child) => (
            <li key={child.slug}>
              <Link
                to={`/c/${child.slug}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
              >
                {child.name}
                <span className="text-xs text-muted">{child.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {products.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              Page {meta.page} of {meta.totalPages}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted">
              Sort
              <select
                value={sort}
                onChange={(event) => {
                  const next = new URLSearchParams()
                  if (event.target.value !== 'newest')
                    next.set('sort', event.target.value)
                  onSort(next)
                }}
                className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>

          <Pagination meta={meta} sort={sort} />
        </>
      )}
    </>
  )
}

/**
 * A card links to the product **inside its store** — that is the product's
 * only address, and sending a shopper through the seller's storefront is what
 * makes the sale the seller's rather than an anonymous marketplace's.
 */
function ProductCard({ product }: { product: MarketProduct }) {
  const soldOut = product.stockQuantity <= 0
  return (
    <li className="group">
      <Link
        to={`/store/${product.store.slug}/product/${product.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent"
      >
        <div className="flex aspect-square items-center justify-center overflow-hidden bg-bg">
          {product.image?.url ? (
            <img
              src={product.image.url}
              alt={product.image.altText ?? product.name}
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 ${
                soldOut ? 'opacity-60' : ''
              }`}
            />
          ) : (
            <BoxIcon className="h-8 w-8 text-muted" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
            {product.store.name}
          </span>
          <h2 className="line-clamp-2 font-heading text-sm font-medium leading-tight text-fg transition-colors group-hover:text-brand sm:text-base">
            {product.name}
          </h2>
          <div className="mt-auto flex items-baseline gap-2 pt-1.5">
            {product.price && (
              <span className="font-semibold text-fg">
                {formatPrice(product.price)}
              </span>
            )}
            {product.compareAtPrice && (
              <s className="text-xs text-muted">
                {formatPrice(product.compareAtPrice)}
              </s>
            )}
          </div>
          {soldOut && <span className="text-xs text-muted">Sold out</span>}
        </div>
      </Link>
    </li>
  )
}

/**
 * Prev/next as real `<a href>` rather than a Load More button. A crawler
 * cannot press a button, so an infinite-scroll listing is a listing whose
 * second page does not exist as far as search is concerned — which is exactly
 * the reason the in-store listings need a sitemap to be discovered at all.
 */
function Pagination({
  meta,
  sort,
}: {
  meta: BrowsePage['meta']
  sort: BrowseSort
}) {
  if (meta.totalPages <= 1) return null

  const href = (page: number) => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (sort !== 'newest') params.set('sort', sort)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex items-center justify-center gap-3"
    >
      {meta.page > 1 && (
        <Link
          to={href(meta.page - 1)}
          rel="prev"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
        >
          Previous
        </Link>
      )}
      {meta.page < meta.totalPages && (
        <Link
          to={href(meta.page + 1)}
          rel="next"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
        >
          Next
        </Link>
      )}
    </nav>
  )
}

function Skeleton() {
  return (
    <>
      <div className="h-8 w-56 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-surface" />
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <li
            key={index}
            className="aspect-[3/4] animate-pulse rounded-lg bg-surface"
          />
        ))}
      </ul>
    </>
  )
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="font-heading text-xl font-semibold text-fg">
        Category not found
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
        This category doesn't exist, or nothing on the marketplace is filed
        under it.
      </p>
      <Link
        to="/"
        className={buttonClass({ size: 'md', className: 'mt-6' })}
      >
        Back to UnieMax
      </Link>
    </div>
  )
}
