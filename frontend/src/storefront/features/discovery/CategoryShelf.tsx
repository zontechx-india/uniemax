import { Link } from 'react-router-dom'
import { MediaImg } from '../../../shared/media/MediaImg'
import { ArrowRightIcon } from '../../layout/icons'
import { CategoryIcon } from './CategoryIcon'
import type { BrowsableCategory } from './discoveryApi'
import type { ShopByCategoryDesign } from './marketHomeSections'

/**
 * Shop by category as ONE compact row in any of three designs (the admin
 * picks it in Homepage sections): `tiles` — the pressed wells, `circles` —
 * round icons, `chips` — small pills in two lines. Every design ends in a
 * View all item.
 *
 * On a phone the heading is a vertical "Categories" tag at the start of the
 * row — no heading line above it — and the row scrolls sideways, bleeding off
 * the right edge so the last visible item is cut (the cue that there is
 * more). From `sm` the heading sits above the row as on every other section;
 * from `lg` the row stops scrolling (a mouse cannot swipe): circles and tiles
 * become one grid row, chips wrap.
 *
 * Pure rendering: the categories come from the caller's one shared
 * `GET /public/browse` fetch; `null` draws placeholders in the same shape.
 */

/** Categories before View all — about two swipes on a phone. */
const SHELF_MAX = 10
/** Tiles are wider, so a desktop row holds eight before View all. */
const TILE_DESKTOP_MAX = 8
const PLACEHOLDERS = 6

/** Bleeds right on a phone (the tag holds the left edge), both sides on a tablet. */
const SCROLLER =
  'min-w-0 flex-1 snap-x snap-proximity overflow-x-auto -mr-4 pr-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:overflow-visible lg:px-0'

const LIST: Record<ShopByCategoryDesign, string> = {
  tiles: `${SCROLLER} flex gap-2.5 lg:grid lg:grid-cols-9 lg:gap-4`,
  circles: `${SCROLLER} flex gap-2.5 lg:grid lg:grid-cols-11 lg:gap-4`,
  // Two lines on a phone and tablet, filled column by column as it scrolls.
  chips: `${SCROLLER} grid auto-cols-max grid-flow-col grid-rows-2 gap-2 lg:flex lg:flex-wrap`,
}

const ITEM: Record<ShopByCategoryDesign, string> = {
  tiles: 'w-24 shrink-0 snap-start lg:w-auto',
  circles: 'w-16 shrink-0 snap-start lg:w-auto',
  chips: 'snap-start',
}

const TILE_WELL = 'category-well grid h-full content-start justify-items-center gap-2 px-1.5 pt-2.5 pb-2 text-center sm:gap-2.5 sm:pt-3'
const TILE_PLATE = 'category-plate grid aspect-square w-[72%] max-w-24 place-items-center overflow-hidden'
const CIRCLE = 'grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-alt lg:size-20'
const CHIP_PICTURE = 'grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-alt'
const CHIP = 'flex h-10 items-center gap-2 rounded-pill border border-line bg-surface pr-3.5 pl-1 transition-colors hover:border-fg/30'
const LABEL = 'line-clamp-2 max-w-full text-xs font-semibold text-balance text-fg transition-colors group-hover:text-brand sm:text-sm'

export function CategoryShelf({
  categories,
  design,
  headingId,
}: {
  categories: BrowsableCategory[] | null
  design: ShopByCategoryDesign
  headingId: string
}) {
  return (
    <div className="flex items-stretch gap-2.5 sm:block">
      {/* One heading at every width: a vertical tag on a phone, a normal
          section title from `sm`. Reads bottom-to-top, like a book spine.
          On a phone it sits flush on the screen's left edge (`-ml-4` undoes
          the gutter) with only its two inner corners rounded — `rounded-l`
          because the 180° turn puts the element's left side on the right. */}
      <h2
        id={headingId}
        className="-ml-4 flex w-7 shrink-0 rotate-180 items-center justify-center rounded-l-lg bg-brand-soft sm:ml-0 sm:rounded-none text-xs font-semibold text-brand [writing-mode:vertical-rl] sm:mb-4 sm:w-auto sm:rotate-0 sm:justify-start sm:bg-transparent sm:font-heading sm:text-3xl sm:font-semibold sm:normal-case sm:tracking-normal sm:text-fg sm:[writing-mode:horizontal-tb]"
      >
        <span className="sm:hidden">Categories</span>
        <span className="hidden sm:inline">Shop by category</span>
      </h2>

      {categories === null ? (
        <ul className={LIST[design]} aria-hidden>
          {Array.from({ length: PLACEHOLDERS }, (_, i) => (
            <li key={i} className={ITEM[design]}>
              <Placeholder design={design} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={LIST[design]}>
          {categories.slice(0, SHELF_MAX).map((category, index) => (
            <li
              key={category.slug}
              className={`${ITEM[design]} ${design === 'tiles' && index >= TILE_DESKTOP_MAX ? 'lg:hidden' : ''}`}
            >
              <Link to={`/c/${category.slug}`} className={`group ${itemLayout(design)}`}>
                <CategoryPicture category={category} design={design} />
                <span
                  className={
                    design === 'chips'
                      ? 'whitespace-nowrap text-sm font-semibold text-fg transition-colors group-hover:text-brand'
                      : LABEL
                  }
                >
                  {category.name}
                </span>
              </Link>
            </li>
          ))}
          <li className={ITEM[design]}>
            <ViewAll design={design} />
          </li>
        </ul>
      )}
    </div>
  )
}

function itemLayout(design: ShopByCategoryDesign): string {
  if (design === 'tiles') return TILE_WELL
  if (design === 'chips') return CHIP
  return 'flex flex-col items-center gap-1.5 text-center lg:gap-2'
}

/**
 * The category's own picture (uploaded in admin → Categories), filling its
 * shape; without one, the category's icon — never a seller's product photo,
 * which read as random here.
 */
function CategoryPicture({
  category,
  design,
}: {
  category: BrowsableCategory
  design: ShopByCategoryDesign
}) {
  const shape = design === 'tiles' ? TILE_PLATE : design === 'chips' ? CHIP_PICTURE : CIRCLE
  const sizes =
    design === 'tiles'
      ? '(min-width: 640px) 96px, 72px'
      : design === 'chips'
        ? '32px'
        : '(min-width: 1024px) 80px, 56px'

  return (
    <span className={shape}>
      {category.imageUrl ? (
        <MediaImg
          sizes={sizes}
          src={category.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <CategoryIcon
          slug={category.slug}
          className={design === 'chips' ? 'h-4 w-4 text-brand' : 'h-[38%] w-[38%] text-brand'}
        />
      )}
    </span>
  )
}

/** The row's last item: every category, in the row's own shape. */
function ViewAll({ design }: { design: ShopByCategoryDesign }) {
  if (design === 'chips') {
    return (
      <Link
        to="/categories"
        aria-label="All categories"
        className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-pill bg-brand-soft px-3.5 text-sm font-semibold text-brand transition-colors hover:bg-brand hover:text-cta-contrast"
      >
        View all <ArrowRightIcon className="h-4 w-4" />
      </Link>
    )
  }

  return (
    <Link to="/categories" aria-label="All categories" className={`group ${itemLayout(design)}`}>
      <span
        className={`${design === 'tiles' ? TILE_PLATE : CIRCLE} bg-brand-soft! text-brand transition-colors group-hover:bg-brand! group-hover:text-cta-contrast`}
      >
        <ArrowRightIcon className="h-5 w-5" />
      </span>
      <span className={`${LABEL} text-brand!`}>View all</span>
    </Link>
  )
}

function Placeholder({ design }: { design: ShopByCategoryDesign }) {
  if (design === 'chips') {
    return <div className="h-10 w-28 animate-pulse rounded-pill bg-surface-alt" />
  }
  return (
    <div className={itemLayout(design)}>
      <div className={`${design === 'tiles' ? TILE_PLATE : CIRCLE} animate-pulse rounded-full bg-surface-alt`} />
      <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-surface-alt" />
    </div>
  )
}
