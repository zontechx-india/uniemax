import { Link } from 'react-router-dom'
import {
  formatPrice,
  storeProductUrl,
  type PublicProduct,
  type PublicStore,
} from '../stores/storesApi'
import { ImageIcon } from '../../layout/icons'
import { canQuickAdd, QuickAdd } from './CartControls'
import { stockLevel } from './catalog'
import type { Skin } from './storeTheme'
import { MediaImg } from '../../../shared/media/MediaImg'
import { displayName } from './shopShape'

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
 * photo fills the card's square top edge to edge with `FillImage` — the whole
 * upload stays visible (nothing cropped off a seller's banner-shaped photo)
 * while a blurred copy of it fills the rest, so a row never goes ragged and
 * no card shows a small picture floating in a grey box.
 *
 * The body is name, price, and at most one status line. The category is NOT
 * repeated on every card (the page or section already says where you are).
 *
 * **Classic, not boxed.** There is no card frame: the photo sits in its own
 * rounded tile and the name and price sit on the page beneath it, the way a
 * boutique lays out a rail. A bordered, filled box around every product read
 * as an admin table of inventory. Hover settles the cover a few percent larger
 * and underlines the name — nothing moves, so a grid stays still.
 */
export function ProductCard({
  store,
  product,
  skin,
  size = 'md',
  className = '',
  eager = false,
}: {
  store: PublicStore
  product: PublicProduct
  skin: Skin
  /** Above the fold on a phone — load the photo now, not lazily. */
  eager?: boolean
  /** `lg` is the lead card of a spotlight section; `md` is every other slot. */
  size?: 'md' | 'lg'
  /** Extra classes for the `<li>` — per-row visibility caps, rail widths. */
  className?: string
}) {
  const large = size === 'lg'
  const quick = canQuickAdd(product)
  return (
    <li className={`group relative ${className}`}>
      <Link
        to={storeProductUrl(store.slug, product.slug)}
        className="flex h-full flex-col rounded-lg"
      >
        <ProductMedia product={product} skin={skin} large={large} eager={eager} />

        <div
          // `lg:flex-none` so the lead card's spare height all goes to its
          // cover above, rather than being split with the text below it.
          className={`flex flex-1 flex-col gap-1 ${large ? 'pt-4 sm:pt-5 lg:flex-none' : 'pt-3'}`}
        >
          {/* Product names carry the serif at medium weight — bold reads
              heavy at this size. Two lines, then ellipsis. */}
          <h3
            className={`line-clamp-2 font-display font-medium leading-snug decoration-1 underline-offset-4 group-hover:underline ${
              large ? 'text-lg sm:text-xl' : 'text-base'
            } ${skin.text}`}
          >
            {displayName(product.name)}
          </h3>

          {large && product.description && (
            <p className={`mt-0.5 line-clamp-2 text-sm ${skin.muted}`}>
              {product.description}
            </p>
          )}

          <PriceLabel product={product} size={size} />

          {/* One quiet line, only when there is something to say. Sold out
              is drawn over the cover instead. */}
          <CardNote product={product} />
        </div>
      </Link>
      {/* Pinned to the photo's bottom corner: an overlay the cover's shape,
          so the button lands on the photo whatever the text below wraps to.
          The lead card's cover stretches from lg, so it drops the button
          there rather than float it mid-card. */}
      {quick && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 ${large ? 'aspect-[4/3] lg:hidden' : 'aspect-square'}`}
        >
          <div className="pointer-events-auto absolute bottom-2.5 right-2.5">
            <QuickAdd store={store} product={product} />
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The cover slot: the photo edge to edge across the card's top (one frame —
 * the card's own border), a discount flag over the top-left corner and a
 * sold-out veil across the foot.
 */
function ProductMedia({
  product,
  skin,
  large,
  eager,
}: {
  product: PublicProduct
  skin: Skin
  large: boolean
  eager: boolean
}) {
  const off = discountPercent(product)
  const soldOut = product.stockQuantity <= 0
  return (
    // A spotlight's lead card is stretched to the height of the grid beside
    // it, so from `lg` its cover **absorbs that extra height** instead of
    // letting the body float above a void: the slot drops its aspect ratio and
    // takes whatever is left over.
    <div
      className={`relative overflow-hidden ${
        // Wider than it is tall, because the lead sits in a wide column
        // where a square slot would make it top-heavy.
        large
          ? 'aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1'
          : 'aspect-square'
      } rounded-lg ${skin.well}`}
    >
      {product.image?.url ? (
        <FillImage
          eager={eager}
          src={product.image.url}
          alt={product.image.altText ?? product.name}
          sizes={large ? '(min-width: 1024px) 33vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'}
          className={`transition-transform duration-500 ease-out group-hover:scale-[1.03] ${soldOut ? 'opacity-60' : ''}`}
        />
      ) : (
        <Monogram name={product.name} large={large} />
      )}

      {/* Corner tags: small, square-cornered caps — a label stitched on, not
          a sticker. */}
      {soldOut ? (
        <span className={`${CORNER_TAG} bg-fg text-bg`}>Sold out</span>
      ) : (
        off !== null && (
          <span className={`${CORNER_TAG} bg-brand text-brand-contrast`}>
            {off}% off
          </span>
        )
      )}
    </div>
  )
}

const CORNER_TAG =
  'absolute left-2.5 top-2.5 rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wider'

/**
 * A product with no photo yet: its first letter, large, in the serif — a
 * monogram on a plain tile reads as "photo coming" and still looks
 * intentional, where an icon over "NO IMAGE" looked broken.
 */
function Monogram({ name, large }: { name: string; large: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-full w-full items-center justify-center font-display font-light text-muted opacity-60 ${
        large ? 'text-6xl' : 'text-5xl'
      }`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The card's one status line: low stock (in words, in the warning colour —
 * not a chip) and how many options there are. Nothing when there is no news.
 */
function CardNote({ product }: { product: PublicProduct }) {
  const low =
    product.stockQuantity > 0 && stockLevel(product.stockQuantity) === 'low'
  if (!low && product.variantCount === 0) return null
  return (
    <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-xs text-muted">
      {low && <span className="font-semibold text-warning">Only a few left</span>}
      {low && product.variantCount > 0 && <span aria-hidden>·</span>}
      <VariantCount count={product.variantCount} />
    </p>
  )
}

/**
 * A photo that FILLS its frame without being cropped. Sellers upload every
 * shape — square product shots, wide promo banners with text on them, tall
 * phone photos — and a storefront has to show all of them well:
 * `object-cover` would cut the words off a banner, and `object-contain`
 * alone leaves a small picture in a big empty box. So the photo is contained
 * on top of a blurred, enlarged copy of itself: the whole image stays
 * readable and the frame is always full of its own colours. A photo that
 * already matches the frame simply covers the blur.
 *
 * The blur layer asks for the smallest sized copy (`sizes="64px"`) — it is
 * blurred anyway, so it costs almost nothing to download.
 */
export function FillImage({
  src,
  alt,
  sizes,
  className = '',
  eager = false,
}: {
  src: string
  alt: string
  sizes: string
  className?: string
  /** The first, above-the-fold photo of a page (its LCP image). */
  eager?: boolean
}) {
  return (
    <>
      <MediaImg
        sizes="64px"
        src={src}
        alt=""
        aria-hidden
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl"
      />
      <MediaImg
        sizes={sizes}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        className={`relative h-full w-full object-contain ${className}`}
      />
    </>
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
      <span className="text-xs opacity-70">{label}</span>
    </span>
  )
}

/**
 * Percentage saved, rounded — only when the MRP is genuinely above the selling
 * price. Null whenever there is nothing real to claim.
 */
export function discountPercent(product: PublicProduct): number | null {
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
 * through beside it when the product is genuinely on sale. The price is set in
 * the text colour, not the shop's: a classic shop lets the photo and the name
 * lead, and keeps colour for the saving.
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
        <span className="text-xs text-muted">From</span>
      )}
      <span
        className={`font-figure font-semibold text-fg ${
          size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base'
        }`}
      >
        {formatPrice(product.price)}
      </span>
      {product.compareAtPrice && (
        <s className="font-figure text-sm font-normal text-muted">
          {formatPrice(product.compareAtPrice)}
        </s>
      )}
    </p>
  )
}

/** Muted "N options" line — never the options themselves. */
export function VariantCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="text-xs text-muted">
      {count} option{count === 1 ? '' : 's'}
    </span>
  )
}

/**
 * Column ramp shared by every open-ended storefront grid (listings and the
 * loading skeleton): **2 on a phone, 3 on a tablet, 4–5 on a desktop**. It
 * stops at five deliberately — six across the 1440px content column produced
 * cards too small to read a product name in. Rows sit further apart than
 * columns: with no card frames, the gap is what separates one product's text
 * from the next row's photo.
 */
export const PRODUCT_GRID =
  'grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

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
