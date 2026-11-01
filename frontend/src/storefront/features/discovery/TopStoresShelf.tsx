import { MediaImg } from '../../../shared/media/MediaImg'
import { ChevronRightIcon, ShieldCheckIcon, StoreIcon } from '../../layout/icons'
import type { MarketStore } from './discoveryApi'
import { isNewlyOpened, StoreLogoTile } from './MarketCards'
import type { TopStoresDesign } from './marketHomeSections'

/**
 * Top Stores in any of four compact designs (the admin picks it in Homepage
 * sections):
 *
 *  - `list`  — logo-led rows with two or three product photos (default)
 *  - `cards` — landscape cards topped by a strip of three photos, in a row
 *  - `grid`  — portrait cards, two photos and an overlapping logo
 *  - `story` — tall cards led by one large photo, in a row
 *
 * Every card carries only real facts: logo, name, Verified, New, the shop's
 * top shelves and its own newest product photos (`previewImages`) — no
 * ratings until real reviews exist.
 *
 * The two grids show **whole rows only** at every width (the homepage's "no
 * grid ends in holes" rule), so 5 stores in a 2-column grid show 4. The two
 * rows scroll sideways on phones and become one grid row from `lg`.
 *
 * Plain `<a>` links: store pages live in the public router (full page load).
 */

type Counts = readonly [phone: number, sm: number, lg: number]

/** Grid shape per design: columns and the most items, phone · sm · lg. */
const GRID_SHAPE: Partial<Record<TopStoresDesign, { cols: Counts; max: Counts }>> = {
  list: { cols: [1, 2, 3], max: [4, 6, 6] },
  grid: { cols: [2, 3, 6], max: [4, 6, 6] },
}

/** Rows scroll on phones; from `lg` they are one grid row of this many. */
const ROW_DESKTOP: Partial<Record<TopStoresDesign, number>> = { cards: 5, story: 6 }
const ROW_MAX = 8

const RAIL =
  '-mx-4 flex snap-x snap-proximity scroll-px-4 overflow-x-auto px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:overflow-visible lg:px-0'

const LIST: Record<TopStoresDesign, string> = {
  list: 'divide-y divide-line rounded-2xl border border-line bg-surface px-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:border-0 sm:bg-transparent sm:px-0 lg:grid-cols-3',
  grid: 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6',
  cards: `${RAIL} gap-3 lg:grid-cols-5 lg:gap-4`,
  story: `${RAIL} gap-2.5 lg:grid-cols-6 lg:gap-4`,
}

const ITEM: Record<TopStoresDesign, string> = {
  list: '',
  grid: '',
  cards: 'w-60 shrink-0 snap-start lg:w-auto',
  story: 'w-37 shrink-0 snap-start lg:w-auto',
}

const CARD = 'group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-fg/25'

/** How many of `total` a grid shows: whole rows only, never fewer than one row. */
function wholeRows(total: number, cols: number, max: number): number {
  const n = Math.min(total, max)
  return n < cols ? n : Math.floor(n / cols) * cols
}

/**
 * Hide item `index` at each width where it falls outside the shown count.
 * Literal class strings, because Tailwind scans source text.
 */
function visibility(index: number, shown: Counts): string {
  return [
    index < shown[0] ? '' : 'hidden',
    index < shown[1] ? 'sm:block' : 'sm:hidden',
    index < shown[2] ? 'lg:block' : 'lg:hidden',
  ].join(' ')
}

function shownCounts(design: TopStoresDesign, total: number): Counts {
  const shape = GRID_SHAPE[design]
  if (shape) {
    return [
      wholeRows(total, shape.cols[0], shape.max[0]),
      wholeRows(total, shape.cols[1], shape.max[1]),
      wholeRows(total, shape.cols[2], shape.max[2]),
    ]
  }
  const row = Math.min(total, ROW_MAX)
  return [row, row, Math.min(total, ROW_DESKTOP[design] ?? row)]
}

export function TopStoresShelf({
  stores,
  design,
}: {
  stores: MarketStore[] | null
  design: TopStoresDesign
}) {
  if (stores === null) {
    return (
      <ul className={LIST[design]} aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={`${ITEM[design]} ${i >= 2 && design === 'grid' ? 'hidden sm:block' : ''}`}>
            <div
              className={`animate-pulse rounded-2xl bg-surface-alt ${
                design === 'list' ? 'my-2 h-15 sm:my-0 sm:h-20' : design === 'story' ? 'h-60' : 'h-40'
              }`}
            />
          </li>
        ))}
      </ul>
    )
  }

  const shown = shownCounts(design, stores.length)
  const Card = CARDS[design]

  return (
    <ul className={LIST[design]}>
      {stores.slice(0, Math.max(...shown)).map((store, index) => (
        <li key={store.id} className={`${ITEM[design]} ${visibility(index, shown)}`}>
          <Card store={store} />
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Card pieces
// ---------------------------------------------------------------------------

/** One product photo, cover-cropped; an empty cell when the shop has fewer. */
function Shot({ src, sizes }: { src: string | undefined; sizes: string }) {
  if (!src) return <span className="block h-full w-full bg-surface-alt" />
  return (
    <MediaImg
      sizes={sizes}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full bg-surface object-cover"
    />
  )
}

/** A shop with no photographed products yet still gets a deliberate panel. */
function NoShots() {
  return (
    <span className="flex h-full w-full items-center justify-center bg-surface-alt">
      <StoreIcon className="h-7 w-7 text-brand opacity-40" />
    </span>
  )
}

/** `count` photos side by side, hairline-separated. */
function ShotStrip({ images, count, sizes }: { images: string[]; count: number; sizes: string }) {
  if (images.length === 0) return <NoShots />
  return (
    <span className={`grid h-full gap-px bg-line ${count === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {Array.from({ length: count }, (_, i) => (
        <Shot key={i} src={images[i]} sizes={sizes} />
      ))}
    </span>
  )
}

function NewChip({ className = '' }: { className?: string }) {
  return (
    <span className={`rounded-pill bg-brand px-2 py-0.5 text-xs font-bold text-brand-contrast ${className}`}>
      New
    </span>
  )
}

/** Name with the Verified mark — an admin checked the GSTIN by hand. */
function StoreName({ store, className = 'text-sm' }: { store: MarketStore; className?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className={`truncate font-bold text-fg transition-colors group-hover:text-brand ${className}`}>
        {store.name}
      </span>
      {store.isVerified && (
        <span className="shrink-0 text-success">
          <ShieldCheckIcon className="h-4 w-4" />
          <span className="sr-only">Verified seller</span>
        </span>
      )}
    </span>
  )
}

/** What the shop sells, from its own top shelves; absent when it has none. */
function StoreShelves({ store }: { store: MarketStore }) {
  if (store.categories.length === 0) return null
  return <span className="mt-0.5 block truncate text-xs text-muted">{store.categories.join(' · ')}</span>
}

/** The logo overlapping a photo's bottom edge (grid and story cards). */
function OverlapLogo({ store }: { store: MarketStore }) {
  return (
    <span className="absolute -bottom-4 left-2.5 rounded-lg bg-surface p-0.5 lg:left-3">
      <StoreLogoTile logoUrl={store.logoUrl} className="h-9 w-9" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// The four designs
// ---------------------------------------------------------------------------

function ListRow({ store }: { store: MarketStore }) {
  return (
    <a
      href={`/store/${store.slug}`}
      className="group flex h-19 items-center gap-3 sm:h-20 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:px-3.5 sm:transition-colors sm:hover:border-fg/25"
    >
      <StoreLogoTile logoUrl={store.logoUrl} className="h-11 w-11 shrink-0 sm:h-12 sm:w-12" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <StoreName store={store} className="text-sm sm:text-base" />
          {isNewlyOpened(store.publishedAt) && (
            <span className="shrink-0 rounded-pill bg-brand-soft px-1.5 text-xs font-bold text-brand">New</span>
          )}
        </span>
        <StoreShelves store={store} />
      </span>
      {store.previewImages.length > 0 && (
        <span aria-hidden className="flex shrink-0 gap-1">
          {store.previewImages.slice(0, 3).map((src, i) => (
            <span
              key={src}
              className={`size-10 overflow-hidden rounded-lg sm:size-11 ${i === 2 ? 'hidden lg:block' : ''}`}
            >
              <Shot src={src} sizes="44px" />
            </span>
          ))}
        </span>
      )}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted sm:hidden" />
    </a>
  )
}

function StripCard({ store }: { store: MarketStore }) {
  return (
    <a href={`/store/${store.slug}`} className={CARD}>
      <span className="relative block h-20 lg:h-24">
        <ShotStrip images={store.previewImages} count={3} sizes="(min-width: 1024px) 80px, 80px" />
        {isNewlyOpened(store.publishedAt) && <NewChip className="absolute left-2 top-2" />}
      </span>
      <span className="flex items-center gap-2.5 p-3">
        <StoreLogoTile logoUrl={store.logoUrl} className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <StoreName store={store} />
          <StoreShelves store={store} />
        </span>
      </span>
    </a>
  )
}

function GridCard({ store }: { store: MarketStore }) {
  return (
    <a href={`/store/${store.slug}`} className={CARD}>
      <span className="relative block h-26 lg:h-28">
        <ShotStrip images={store.previewImages} count={2} sizes="(min-width: 1024px) 96px, 25vw" />
        <OverlapLogo store={store} />
        {isNewlyOpened(store.publishedAt) && <NewChip className="absolute right-2 top-2" />}
      </span>
      <span className="block px-2.5 pb-2.5 pt-6 lg:px-3 lg:pb-3">
        <StoreName store={store} />
        <StoreShelves store={store} />
      </span>
    </a>
  )
}

function StoryCard({ store }: { store: MarketStore }) {
  return (
    <a href={`/store/${store.slug}`} className={CARD}>
      <span className="relative block h-43 lg:h-56">
        {store.previewImages.length > 0 ? (
          <Shot src={store.previewImages[0]} sizes="(min-width: 1024px) 200px, 148px" />
        ) : (
          <NoShots />
        )}
        <OverlapLogo store={store} />
        {isNewlyOpened(store.publishedAt) && <NewChip className="absolute left-2 top-2" />}
      </span>
      <span className="block px-2.5 pb-3 pt-6 lg:px-3">
        <StoreName store={store} />
        <StoreShelves store={store} />
      </span>
    </a>
  )
}

const CARDS: Record<TopStoresDesign, (props: { store: MarketStore }) => React.ReactNode> = {
  list: ListRow,
  cards: StripCard,
  grid: GridCard,
  story: StoryCard,
}
