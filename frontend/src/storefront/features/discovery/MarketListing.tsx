import { Link } from 'react-router-dom'
import type { ListMeta } from '../../../shared/auth/http'
import { MediaImg } from '../../../shared/media/MediaImg'
import { buttonClass } from '../../../shared/ui/Button'
import { BoxIcon } from '../../layout/icons'
import { formatPrice } from '../stores/storesApi'
import type { MarketProduct } from './discoveryApi'

/**
 * The pieces every marketplace listing page shares — `/c/{slug}`, `/new`,
 * `/shops`, `/categories`: the page heading with its breadcrumb, the product
 * grid and card, prev/next pagination and the grid placeholder.
 */

/** Product grid columns — 2 → 3 → 4 → 5. */
export const PRODUCT_LISTING_GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/**
 * Breadcrumb back to the marketplace, the page's `<h1>` and a lead line.
 * `crumbs` sit between "UnieMax" and the page itself (the page is the `<h1>`,
 * so it is not repeated as a crumb).
 */
export function ListingHeader({
  title,
  lead,
  crumbs = [],
}: {
  title: string
  lead?: React.ReactNode
  crumbs?: { name: string; to: string }[]
}) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <li>
            <Link to="/" className="transition-colors hover:text-brand">
              UnieMax
            </Link>
          </li>
          {crumbs.map((crumb) => (
            <li key={crumb.to} className="flex items-center gap-1.5">
              <span aria-hidden>›</span>
              <Link to={crumb.to} className="transition-colors hover:text-brand">
                {crumb.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="font-heading text-2xl font-semibold text-fg sm:text-3xl">
        {title}
      </h1>
      {lead && <p className="mt-1.5 max-w-2xl text-sm text-muted">{lead}</p>}
    </>
  )
}

/**
 * A card links to the product **inside its store** — that is the product's
 * only address, and sending a shopper through the seller's storefront is what
 * makes the sale the seller's rather than an anonymous marketplace's.
 *
 * A plain `<a href>`, not a router `<Link>`: `/store/**` belongs to the
 * public router, which is picked per page load. These pages run on the
 * marketplace router, where a client-side hop to `/store/**` falls through to
 * the `*` route and lands on `/`.
 */
export function MarketProductCard({ product }: { product: MarketProduct }) {
  const soldOut = product.stockQuantity <= 0
  return (
    <li className="group">
      <a
        href={`/store/${product.store.slug}/product/${product.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent"
      >
        <div className="flex aspect-square items-center justify-center overflow-hidden bg-bg">
          {product.image?.url ? (
            <MediaImg
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
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
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
            {product.store.name}
          </span>
          <h2 className="line-clamp-2 font-heading text-sm font-medium leading-tight text-fg transition-colors group-hover:text-brand sm:text-base">
            {product.name}
          </h2>
          <div className="mt-auto flex items-baseline gap-2 pt-1.5">
            {product.price && (
              <span className="font-figure font-semibold text-fg">
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
      </a>
    </li>
  )
}

/**
 * Prev/next as real links rather than a Load More button. A crawler cannot
 * press a button, so an infinite-scroll listing is a listing whose second
 * page does not exist as far as search is concerned. `href(page)` builds the
 * link for a page number, keeping whatever else the page's query carries.
 */
export function ListingPagination({
  meta,
  href,
}: {
  meta: ListMeta
  href: (page: number) => string
}) {
  if (meta.totalPages <= 1) return null

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex items-center justify-center gap-3"
    >
      {meta.page > 1 && (
        <Link
          to={href(meta.page - 1)}
          rel="prev"
          className={buttonClass({ variant: 'secondary', size: 'md' })}
        >
          Previous
        </Link>
      )}
      <span className="text-sm text-muted">
        Page {meta.page} of {meta.totalPages}
      </span>
      {meta.page < meta.totalPages && (
        <Link
          to={href(meta.page + 1)}
          rel="next"
          className={buttonClass({ variant: 'secondary', size: 'md' })}
        >
          Next
        </Link>
      )}
    </nav>
  )
}

/** Heading + product grid placeholder, shaped like the loaded page. */
export function ListingSkeleton({ tile = 'aspect-[3/4]' }: { tile?: string }) {
  return (
    <>
      <div className="h-8 w-56 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-md bg-surface" />
      <ul className={`mt-6 ${PRODUCT_LISTING_GRID}`}>
        {Array.from({ length: 10 }).map((_, index) => (
          <li
            key={index}
            className={`${tile} animate-pulse rounded-lg bg-surface`}
          />
        ))}
      </ul>
    </>
  )
}
