import { Link } from 'react-router-dom'
import {
  formatPrice,
  storeProductUrl,
  type PublicProduct,
  type PublicStore,
} from '../stores/storesApi'
import { ImageIcon } from '../../layout/icons'
import { StockBadge } from './CartControls'
import type { Skin } from './storeTheme'

/**
 * Product listing card — used by every grid, rail and spotlight on the
 * storefront (category page, search results, homepage sections, related
 * products).
 *
 * The **whole card is one link** to the product page: there is no Add to Cart
 * here. Buying happens on the product page, where the customer can see the
 * full detail and pick an option — which also keeps every card the same shape
 * whether or not the product has variants, so a grid of thousands stays
 * uniform and scannable.
 *
 * **One shape, two sizes.** Everything is fixed except the type scale and
 * padding, which `size` steps up for the lead card of a spotlight section. The
 * image slot is always a square well with the cover *contained* inside it, so
 * a row never goes ragged whatever mix of portrait, landscape and missing
 * covers a seller uploaded.
 *
 * Hover lifts the card and paints an evenly-spread halo (`metal-lift`) while
 * the cover scales inside its slot — the frame itself never moves, so a grid
 * stays still under the cursor.
 */
export function ProductCard({
  store,
  product,
  skin,
  size = 'md',
  className = '',
}: {
  store: PublicStore
  product: PublicProduct
  skin: Skin
  /** `lg` is the lead card of a spotlight section; `md` is every other slot. */
  size?: 'md' | 'lg'
  /** Extra classes for the `<li>` — per-row visibility caps, rail widths. */
  className?: string
}) {
  const large = size === 'lg'
  return (
    <li className={`group ${className}`}>
      <Link
        to={storeProductUrl(store.slug, product.slug)}
        className={`flex h-full flex-col overflow-hidden rounded-lg border metal-lift ${skin.border} ${skin.surface}`}
      >
        <ProductMedia product={product} skin={skin} large={large} />

        <div
          // `lg:flex-none` so the lead card's spare height all goes to its
          // cover above, rather than being split with the text below it.
          className={`flex flex-1 flex-col gap-1 ${large ? 'p-4 sm:p-5 lg:flex-none' : 'p-3'}`}
        >
          <span
            className={`truncate text-[10px] font-semibold uppercase tracking-wide ${skin.muted}`}
          >
            {product.category.name}
          </span>

          {/* Product names carry the heading face at medium weight — bold
              reads heavy at this size. Two lines, then ellipsis. */}
          <h3
            className={`line-clamp-2 font-heading font-medium leading-tight transition-colors group-hover:text-brand ${
              large ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
            } ${skin.text}`}
          >
            {product.name}
          </h3>

          {large && product.description && (
            <p className={`mt-0.5 line-clamp-2 text-sm ${skin.muted}`}>
              {product.description}
            </p>
          )}

          <PriceLabel product={product} size={size} />

          {/* Pushed to the bottom edge so the badge line sits level across a
              row whatever the name wrapped to. */}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
            {/* Sold out is drawn over the cover instead — a chip here as well
                would say the same thing twice. */}
            {product.stockQuantity > 0 && (
              <StockBadge stock={product.stockQuantity} />
            )}
            <VariantCount count={product.variantCount} />
          </div>
        </div>
      </Link>
    </li>
  )
}

/**
 * The cover slot: a recessed well, the image contained inside it (never
 * stretched, whatever the upload's ratio), a discount flag over the top-left
 * corner and a sold-out veil across the foot.
 */
function ProductMedia({
  product,
  skin,
  large,
}: {
  product: PublicProduct
  skin: Skin
  large: boolean
}) {
  const off = discountPercent(product)
  const soldOut = product.stockQuantity <= 0
  return (
    // Inset rather than edge-to-edge so the cover reads as a framed product
    // rather than a grey slab bleeding into the card.
    //
    // A spotlight's lead card is stretched to the height of the grid beside
    // it, so from `lg` its cover **absorbs that extra height** instead of
    // letting the body float above a void: the slot drops its aspect ratio and
    // takes whatever is left over.
    <div
      className={`relative p-2 pb-0 ${large ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : ''}`}
    >
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-md ${
          // Wider than it is tall, because the lead sits in a wide column
          // where a square slot would make it top-heavy.
          large
            ? 'aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1'
            : 'aspect-square'
        } ${skin.well}`}
      >
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
          <NoProductImage />
        )}

        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-[var(--overlay)] py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
            Sold out
          </span>
        )}
      </div>

      {off !== null && !soldOut && (
        <span className="absolute left-3.5 top-3.5 rounded-pill bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-contrast">
          {off}% off
        </span>
      )}
    </div>
  )
}

/**
 * The no-photo state, and deliberately not a broken-image look: the same
 * recessed well every cover sits in, one muted glyph and a quiet label, so a
 * catalog mid-upload reads as "photo coming" rather than "this is broken".
 */
export function NoProductImage({ label = 'No image' }: { label?: string }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted">
      <ImageIcon className="h-7 w-7 opacity-45" />
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
    </span>
  )
}

/**
 * Percentage saved, rounded — only when the MRP is genuinely above the selling
 * price. Null whenever there is nothing real to claim.
 */
function discountPercent(product: PublicProduct): number | null {
  if (!product.compareAtPrice || product.price === null) return null
  const mrp = Number(product.compareAtPrice)
  const now = Number(product.price)
  if (!Number.isFinite(mrp) || !Number.isFinite(now)) return null
  if (mrp <= now) return null
  const off = Math.round(((mrp - now) / mrp) * 100)
  return off > 0 ? off : null
}

/**
 * "From ₹X" when options exist, a plain price otherwise — with the MRP struck
 * through beside it when the product is genuinely on sale. The price is the
 * loudest thing in the card body: brand color, heading face, bold.
 */
export function PriceLabel({
  product,
  size = 'md',
}: {
  product: PublicProduct
  size?: 'md' | 'lg'
}) {
  if (product.price === null) return null
  return (
    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
      {product.variantCount > 0 && (
        <span className="text-[11px] font-semibold text-muted">From</span>
      )}
      <span
        className={`font-heading font-bold text-brand ${
          size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
        }`}
      >
        {formatPrice(product.price)}
      </span>
      {product.compareAtPrice && (
        <s className="text-xs font-normal text-muted">
          {formatPrice(product.compareAtPrice)}
        </s>
      )}
    </p>
  )
}

/** Muted "N Variants Available" line — never the options themselves. */
export function VariantCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="text-[10px] font-semibold text-muted">
      {count} Variant{count === 1 ? '' : 's'} Available
    </span>
  )
}

/**
 * Column ramp shared by every open-ended storefront grid (listings and the
 * loading skeleton): **2 on a phone, 3 on a tablet, 4–5 on a desktop**. It
 * stops at five deliberately — six across the 1440px content column produced
 * cards too small to read a product name in.
 */
export const PRODUCT_GRID =
  'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/** Responsive product grid — 2 columns on mobile, up to 5 wide. */
export function ProductGrid({
  store,
  products,
  skin,
}: {
  store: PublicStore
  products: PublicProduct[]
  skin: Skin
}) {
  return (
    <ul className={PRODUCT_GRID}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          store={store}
          product={product}
          skin={skin}
        />
      ))}
    </ul>
  )
}
