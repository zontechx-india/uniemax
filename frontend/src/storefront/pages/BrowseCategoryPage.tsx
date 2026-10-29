import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type {
  BrowseCategoryPage as BrowsePage,
  BrowseSort,
} from '../features/discovery/discoveryApi'
import {
  ListingHeader,
  ListingPagination,
  ListingSkeleton,
  MarketProductCard,
  PRODUCT_LISTING_GRID,
} from '../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
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
        {data === undefined && <ListingSkeleton />}
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
      <ListingHeader
        title={category.name}
        crumbs={[
          { name: 'All categories', to: '/categories' },
          ...ancestors.map((crumb) => ({
            name: crumb.name,
            to: `/c/${crumb.slug}`,
          })),
        ]}
        lead={
          meta.total > 0 ? (
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
          )
        }
      />

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

          <ul className={`mt-4 ${PRODUCT_LISTING_GRID}`}>
            {products.map((product) => (
              <MarketProductCard key={product.id} product={product} />
            ))}
          </ul>

          <ListingPagination
            meta={meta}
            href={(target) => {
              const params = new URLSearchParams()
              if (target > 1) params.set('page', String(target))
              if (sort !== 'newest') params.set('sort', sort)
              const qs = params.toString()
              return qs ? `?${qs}` : ''
            }}
          />
        </>
      )}
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
