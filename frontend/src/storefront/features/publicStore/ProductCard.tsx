import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  formatPrice,
  storeProductUrl,
  type PublicProduct,
  type PublicStore,
} from '../stores/storesApi'
import { ImageIcon } from '../../layout/icons'
import { CardAction } from './CartControls'
import { stockLevel } from './catalog'
import type { Skin } from './storeTheme'
import { MediaImg } from '../../../shared/media/MediaImg'
import { displayName, plainLetters } from './shopShape'

/**
 * Product listing card — used by every grid, rail and spotlight on the
 * storefront (category page, search results, homepage sections, related
 * products).
 *
 * **Photo, name, price, action — the same shape on every card.** The photo
 * and the text are one link to the product page; the action sits UNDER them
 * in its own row, never over the photo (a floating cart button hid the corner
 * of the product it was selling). What the action is depends on what the
 * product needs — see `CardAction`: "Add to cart" when there is nothing to
 * choose, "View options" when a size or colour must be picked on the product
 * page first, "Out of stock" when it cannot be bought.
 *
 * **Every row lines up.** The name always reserves two lines, the body
 * stretches, and the action is pushed to the card's foot, so a one-line name
 * beside a two-line one never leaves the buttons staggered.
 *
 * **4:5 photo tile, framed by the photo's own shape.** A photo close to the
 * frame's shape (a model shot) fills it (`CARD_PHOTO_FILL`); anything else —
 * a square packshot, a banner-shaped upload — stays whole (`CARD_PHOTO`,
 * `object-contain`), inset on the recessed neutral well. On a light shop that
 * photo is multiplied onto the well (`--media-blend`, set by `storeVars`), so
 * a packshot's white background melts into the tile instead of drawing a
 * white box inside a grey one. The category is NOT repeated on every card.
 *
 * **Classic, not boxed.** There is no card frame: the photo sits in its own
 * rounded tile and the words sit on the page beneath it. A saving is said in
 * words beside the price ("27% off"), not as a sticker on the photo.
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
  /**
   * Extra classes for the `<li>` — per-row visibility caps, rail widths. A
   * cap that re-shows the card must use `flex` (`hidden md:flex`), not
   * `list-item`, or the action loses its place at the card's foot.
   */
  className?: string
}) {
  const large = size === 'lg'
  return (
    <li className={`group flex flex-col ${className}`}>
      <Link
        to={storeProductUrl(store.slug, product.slug)}
        className="flex flex-1 flex-col rounded-lg"
      >
        <ProductMedia product={product} skin={skin} large={large} eager={eager} />

        <div
          // `lg:flex-none` so the lead card's spare height all goes to its
          // cover above, rather than being split with the text below it.
          className={`flex flex-1 flex-col ${large ? 'gap-1.5 pt-4 sm:pt-5 lg:flex-none' : 'gap-1 pt-3'}`}
        >
          {/* Two lines reserved whatever the name's length, so prices and
              buttons line up across a row. 14px medium on a grid card; the
              lead card sets it larger and semibold. */}
          <h3
            className={`line-clamp-2 decoration-1 underline-offset-4 group-hover:underline ${
              large
                ? 'font-display text-lg font-semibold leading-snug sm:text-xl'
                : 'min-h-10 text-sm font-medium leading-5'
            } ${skin.text}`}
          >
            {displayName(product.name)}
          </h3>

          {large && product.description && (
            <p className={`line-clamp-2 text-sm ${skin.muted}`}>
              {plainLetters(product.description)}
            </p>
          )}

          <PriceLabel product={product} size={size} />

          {/* One quiet line, only when there is something to say. Sold out
              is drawn over the cover instead. */}
          <CardNote product={product} />
        </div>
      </Link>

      <div className={large ? 'mt-4' : 'mt-3'}>
        <CardAction store={store} product={product} />
      </div>
    </li>
  )
}

/**
 * A product photo on a neutral tile: whole, inset, and multiplied onto the
 * well on light shops so a white packshot background disappears into it.
 * Shared with the category thumbnails, which sit on the same tile.
 */
export const CARD_PHOTO =
  'h-full w-full object-contain p-2 sm:p-3 [mix-blend-mode:var(--media-blend,normal)]'

/**
 * A photo already close to its frame's shape — a model shot in a portrait
 * frame — fills it edge to edge; a few percent off the top and bottom is
 * the whole cost, and it stops a fashion catalogue reading as small photos
 * in grey boxes. The focus sits a little above centre, where faces are.
 */
export const CARD_PHOTO_FILL = 'h-full w-full object-cover object-[center_30%]'

/**
 * Should a photo of `width × height` fill a frame of `frame` (width / height)
 * rather than sit whole inside it? Only when the two shapes are close: within
 * ~22% narrower or ~15% wider. A square packshot in a 4:5 frame, a wide
 * banner or a tall phone screenshot stays whole (`CARD_PHOTO`) — cropping
 * those would cut off the product or its words.
 */
export function photoFillsFrame(width: number, height: number, frame: number): boolean {
  if (!width || !height) return false
  const r = width / height / frame
  return r >= 0.78 && r <= 1.15
}

/** Card frame shape (width / height): 4:5, or 4:3 for a spotlight's lead. */
const CARD_FRAME = 4 / 5
const LEAD_FRAME = 4 / 3

/**
 * The cover slot: the photo on the neutral well — filling the 4:5 frame
 * when its own shape is close (`photoFillsFrame`), whole and inset otherwise
 * — and a sold-out label over its top-left corner, the one status worth
 * putting on the picture, because it decides whether the card is worth
 * opening at all.
 *
 * 4:5 because the catalogues on the platform are mostly clothing, sarees and
 * people photographed upright; a square packshot still sits whole inside it.
 * The fit is decided once the photo loads (the API sends no dimensions), so
 * every photo starts whole and a portrait one settles into the frame.
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
  const soldOut = product.stockQuantity <= 0
  const [fill, setFill] = useState(false)
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
          : 'aspect-[4/5]'
      } rounded-lg ${skin.well}`}
    >
      {product.image?.url ? (
        <MediaImg
          src={product.image.url}
          alt={product.image.altText ?? product.name}
          sizes={large ? '(min-width: 1024px) 33vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onLoad={(e) =>
            setFill(
              photoFillsFrame(
                e.currentTarget.naturalWidth,
                e.currentTarget.naturalHeight,
                large ? LEAD_FRAME : CARD_FRAME,
              ),
            )
          }
          className={`${fill ? CARD_PHOTO_FILL : CARD_PHOTO} transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none ${soldOut ? 'opacity-60' : ''}`}
        />
      ) : (
        <Monogram name={product.name} large={large} />
      )}

      {soldOut && (
        <span className="absolute left-2 top-2 rounded-sm bg-fg px-1.5 py-0.5 text-xs font-semibold text-bg">
          Sold out
        </span>
      )}
    </div>
  )
}

/**
 * A product with no photo yet: its first letter, large and semibold — a
 * monogram on a plain tile reads as "photo coming" and still looks
 * intentional, where an icon over "NO IMAGE" looked broken.
 */
function Monogram({ name, large }: { name: string; large: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-full w-full items-center justify-center font-display font-semibold text-muted opacity-50 ${
        large ? 'text-6xl' : 'text-5xl'
      }`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The card's one status line: low stock, in words, in the warning colour —
 * not a chip. Nothing when there is no news. (How many options a product has
 * is not repeated here: the card's "View Options" button already says it.)
 */
function CardNote({ product }: { product: PublicProduct }) {
  const low =
    product.stockQuantity > 0 && stockLevel(product.stockQuantity) === 'low'
  if (!low) return null
  return (
    <p className="mt-auto pt-1 text-xs font-semibold text-warning">
      Only a few left
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
 * through and the saving in words beside it, only when the product is
 * genuinely on sale (`discountPercent`; nothing is claimed otherwise). The
 * price is the strongest thing in the line, in the text colour; the MRP is
 * smaller and muted, and the saving is the one touch of colour — in words, so
 * it never relies on colour alone.
 */
export function PriceLabel({
  product,
  size = 'md',
}: {
  product: PublicProduct
  size?: 'md' | 'lg'
}) {
  if (product.price === null) return null
  const off = discountPercent(product)
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
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
      {off !== null && (
        <>
          <s className="font-figure text-xs text-muted">
            <span className="sr-only">MRP </span>
            {formatPrice(product.compareAtPrice!)}
          </s>
          <span className="text-xs font-semibold text-success">{off}% off</span>
        </>
      )}
    </p>
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
  'grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

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
