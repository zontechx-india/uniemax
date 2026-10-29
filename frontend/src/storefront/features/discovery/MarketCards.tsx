import { MediaImg } from '../../../shared/media/MediaImg'
import { ChevronRightIcon, ShieldCheckIcon, StoreIcon } from '../../layout/icons'
import type { MarketStore } from './discoveryApi'

/**
 * Marketplace cards shared by the homepage and the marketplace listing pages
 * (`/shops`): the store card, the count-capped card grid, the rail scroller
 * and the loading placeholders shaped like both cards.
 */

/**
 * A card grid whose column count is capped by **what is actually in it**, and
 * whose row is capped by how wide those cards should be.
 *
 * Store cards are **portrait** (9:16 artwork), so they are narrow — ~220px —
 * and a 1440px row holds six of them rather than four. Each rung therefore
 * carries a `max-w` as well as a column count: `n` cards at ~220px plus the
 * 20px gaps between them. Without it, three stores in a `grid-cols-3` would
 * each be 440px wide at 1440 — the cap is what keeps a short row looking like
 * a deliberate three-up instead of three stretched tiles.
 *
 * Capping columns at the item count is the other half: it is why three stores
 * never render as a six-up row with three holes in it.
 *
 * Literal class strings, because Tailwind scans source text — an interpolated
 * `lg:grid-cols-${n}` is never generated.
 */
const CARD_RAMP = [
  'grid-cols-1 max-w-[220px]',
  'grid-cols-2 max-w-[460px]',
  'grid-cols-2 sm:grid-cols-3 sm:max-w-[700px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 md:max-w-[940px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:max-w-[1180px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
] as const

/** The grid classes for `count` cards — never more columns than there are. */
export function gridFor(count: number): string {
  const step = CARD_RAMP[Math.min(Math.max(count, 1), CARD_RAMP.length) - 1]
  return `grid gap-4 sm:gap-5 ${step}`
}

/** The full ramp — what a placeholder grid uses before any count is known. */
export const CARD_GRID = gridFor(CARD_RAMP.length)

/**
 * The scroller itself. Bleeds to the screen edge on phones (so the last card
 * is visibly cut off) and tucks back into the content column from `sm`.
 */
export const RAIL_SCROLLER =
  'flex gap-4 pb-1 sm:gap-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 snap-x snap-proximity [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

/**
 * Loading placeholders shaped like the real card: `media="banner"` mirrors the
 * store card (banner + centred logo), `media="square"` the product card.
 *
 * **`count` is the minimum the section will occupy, not the maximum it might.**
 * A section that asks the API for twelve and draws twelve placeholders looks
 * right on a full marketplace and collapses upward on this one, where three
 * stores arrive — and a page that shrinks under the cursor moves whatever the
 * visitor was about to click. One row's worth only ever grows downward.
 *
 * `layout="rail"` renders the same cards in the scroller the section will
 * become, so Fresh Finds does not visibly change shape when its data lands.
 */
export function CardSkeletons({
  count,
  grid = CARD_GRID,
  media = 'banner',
  layout = 'grid',
}: {
  count: number
  grid?: string
  media?: 'banner' | 'square'
  layout?: 'grid' | 'rail'
}) {
  const rail = layout === 'rail'
  return (
    <div className={rail ? RAIL_SCROLLER : grid}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`animate-pulse overflow-hidden rounded-lg border border-line bg-surface ${
            rail
              ? 'w-[46%] shrink-0 sm:w-[31%] lg:w-[23%] xl:w-[19%]'
              : ''
          }`}
        >
          <div
            className={`w-full bg-surface-alt ${media === 'banner' ? 'aspect-[9/14]' : 'aspect-square'}`}
          />
          {media === 'banner' ? (
            <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-3">
              <div className="flex items-start gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-md bg-surface-alt" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/3 rounded bg-surface-alt" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-surface-alt" />
                </div>
              </div>
              <div className="h-9 w-full rounded-md bg-surface-alt" />
            </div>
          ) : (
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/2 rounded bg-surface-alt" />
              <div className="h-4 w-3/4 rounded bg-surface-alt" />
              <div className="h-3 w-1/3 rounded bg-surface-alt" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Store logo or the store glyph — cards never break on a missing logo.
 *
 * **`object-contain`, not `object-cover`.** A seller's logo is as often a
 * wordmark as a square mark, and cover-cropping one into a small tile keeps the
 * middle three letters and throws the rest away — on the live marketplace that
 * turned ZUNO HUB, Poorvika and Unicon Solutions into unreadable fragments.
 * Contained on a bordered surface tile it reads as an app icon: whatever shape
 * the logo is, all of it survives.
 */
export function StoreLogoTile({
  logoUrl,
  className = 'h-12 w-12',
}: {
  logoUrl: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <MediaImg
        sizes="96px"
        src={logoUrl}
        alt=""
        loading="lazy"
        // `bg-surface-alt`, not `bg-surface`: contained on the card's own
        // white the tile has no edge of its own and a pale logo dissolves
        // into the card. A faint grey plate gives every mark the same
        // footprint whatever its own background.
        className={`${className} rounded-md border border-line bg-surface-alt object-contain p-1`}
      />
    )
  }
  return (
    <span
      className={`${className} flex items-center justify-center rounded-md border border-line bg-surface-alt text-muted`}
    >
      <StoreIcon className="h-1/2 w-1/2" />
    </span>
  )
}

/** Published within this window → the card wears a "New" chip. */
const NEW_STORE_DAYS = 30

function isNewlyOpened(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  const opened = new Date(publishedAt).getTime()
  if (Number.isNaN(opened)) return false
  return Date.now() - opened < NEW_STORE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Marketplace store card — a **storefront preview**, not a list row: a large
 * banner cut from the store's newest product cover, the store's logo
 * straddling the banner edge, then name · rating · product count · a "Visit
 * Store" CTA.
 *
 * The whole card remains one link; "Visit Store →" is a styled `<span>`, not a
 * nested `<a>` — that would be invalid HTML and a second tab stop for the same
 * destination.
 *
 * Hover is the premium cue: 4px lift, deeper halo (`shadow-lifted`), the
 * banner zooms, and the CTA fills with the brand color.
 */
export function StoreCard({ store }: { store: MarketStore }) {
  return (
    <a
      href={`/store/${store.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
    >
      {/* The New badge rides the ARTWORK rather than the text block. It is a
          fact about the shop, not about its name, and overlaid it costs no
          height at all. */}
      <div className="relative">
        <StorePreview images={store.previewImages} />
        {isNewlyOpened(store.publishedAt) && (
          <span className="absolute left-2 top-2 rounded-pill bg-brand px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-contrast shadow-floating">
            New
          </span>
        )}
      </div>

      {/* `flex-1` + `mt-auto` on the button: a card whose name runs to two
          lines is taller than its neighbour, and the grid stretches both to
          match — without this the buttons in a row would sit at two different
          heights, which is the tell that a grid was laid out by accident. */}
      <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3">
        <div className="flex items-start gap-2.5">
          {/* One logo size at every width: the tile is ~220px at its widest,
              so the footer never has the room for a bigger badge. */}
          <StoreLogoTile logoUrl={store.logoUrl} className="h-9 w-9 shrink-0" />

          <span className="min-w-0 flex-1">
            {/* Two lines, not an ellipsis. `truncate` fits a name to whatever
                room is left, which on a narrow tile is about 130px — every
                shop read as "Retail S…", "Abhi's O…". */}
            <span className="line-clamp-2 block font-heading text-base font-semibold leading-tight text-fg">
              {store.name}
            </span>

            {/* Real, not decoration: an admin checked this store's GSTIN by
                hand. Absent for every other store — never a "not verified"
                label, which would read as a warning against honest new shops. */}
            {store.isVerified && (
              <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-success">
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                Verified seller
              </span>
            )}

            {/* What the shop actually sells, from its own top-level shelves.
                "Poorvika", "MotoCore", "ZUNO HUB" are names a shopper cannot
                decode; "Mobiles · Accessories" underneath one is the whole
                difference between a card worth opening and a logo. Absent
                when a store has no active categories, rather than a
                placeholder — and deliberately NOT a product count, which is
                the shop's number rather than a reason to visit it. */}
            {store.categories.length > 0 && (
              <span className="mt-1 block truncate text-xs text-muted">
                {store.categories.join(' · ')}
              </span>
            )}
          </span>
        </div>

        {/* A real button, pinned to the bottom. The whole card is still one
            link — this is a styled `<span>`, never a nested `<a>`, so there is
            no second tab stop for the same destination. */}
        <span className="mt-auto flex h-9 w-full items-center justify-center gap-1 rounded-md border border-line text-xs font-bold text-fg transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast">
          Visit store
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </a>
  )
}

/**
 * The card's artwork: **a mosaic of the shop's own product covers**.
 *
 * The API has always sent up to four (`previewImages`) and the card used
 * exactly one of them, cover-cropped to 16:9 and treated as if it were store
 * branding. It is not — it is a photograph of one product, and a zoomed crop of
 * one product tells a shopper nothing about the shop. On the live marketplace
 * two neighbouring cards showed near-identical crops of the same brownie and
 * read as a duplicate render.
 *
 * A shop is a *collection*, so the artwork is a collection: a lead cover beside
 * a stack of two, hairline-separated. It degrades by count rather than by
 * breakpoint — four or three covers make the mosaic, two split the frame, one
 * fills it — so a brand-new shop with a single product still gets a deliberate
 * tile instead of a grid with holes in it.
 */
function StorePreview({ images }: { images: string[] }) {
  const shots = images.slice(0, 4)

  return (
    <div className="aspect-[9/14] w-full overflow-hidden bg-surface-alt">
      {/* The zoom lives on the inner layer so the hairlines and the frame stay
          put while the photographs move. */}
      <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]">
        {shots.length === 0 ? (
          // A soft brand-tinted panel, not a grey glyph on grey. A shop with no
          // products yet is the one most in need of looking deliberate.
          <div className="flex h-full w-full items-center justify-center bg-surface-alt">
            <StoreIcon className="h-9 w-9 text-brand opacity-40" />
          </div>
        ) : shots.length === 1 ? (
          <Cover url={shots[0]!} />
        ) : shots.length === 2 ? (
          // Split across the SHORT axis: in a portrait frame two side-by-side
          // cells would be slivers, while two stacked ones are each a normal
          // landscape crop.
          <div className="grid h-full grid-rows-2 gap-px bg-line">
            {shots.map((url) => (
              <Cover key={url} url={url} />
            ))}
          </div>
        ) : (
          // Lead across the top two thirds, two beneath it — the portrait
          // equivalent of the lead-plus-stack this used to be in landscape.
          <div className="grid h-full grid-rows-3 gap-px bg-line">
            <div className="row-span-2 overflow-hidden">
              <Cover url={shots[0]!} />
            </div>
            <div className="grid grid-cols-2 gap-px bg-line">
              <Cover url={shots[1]!} />
              <Cover url={shots[2]!} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Cover({ url }: { url: string }) {
  return (
    <MediaImg
      sizes="(min-width: 640px) 220px, 50vw"
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full bg-surface object-cover"
    />
  )
}
