import {
  HOMEPAGE_SECTION_LAYOUTS,
  SECTION_TITLES,
} from '../stores/storesApi'
import type {
  HomepageSection,
  HomepageSectionKey,
} from '../stores/storesApi'

/**
 * The platform's own name and strapline for each homepage section — what a row
 * is called when its owner has not renamed it.
 *
 * Shared, deliberately: the storefront renders these, and the Store Builder
 * shows the very same strings as the placeholder in its Title and Subtitle
 * fields. A seller therefore always sees the real default before deciding to
 * overwrite it, and clearing a field visibly returns the default rather than
 * leaving a heading blank.
 */
export const SECTION_DEFAULT_COPY: Record<
  HomepageSectionKey,
  { title: string; subtitle?: string }
> = {
  banners: { title: 'Banners' },
  categories: { title: 'Shop by Category' },
  featured: {
    title: SECTION_TITLES.featured,
    subtitle: 'Hand-picked by the shop',
  },
  newArrivals: {
    title: SECTION_TITLES.newArrivals,
    subtitle: 'Just added to the shop',
  },
  bestSellers: {
    title: SECTION_TITLES.bestSellers,
    subtitle: 'What everyone is buying',
  },
  categoryRows: { title: 'Category Highlights' },
  catalog: {
    title: 'All Products',
    subtitle: 'The newest across the whole shop',
  },
}

/**
 * The composition a section uses when its owner has not chosen one — **the
 * first entry in its layout list**, by definition rather than by coincidence.
 *
 * Both sides read it: the storefront falls back to it, and the Store Builder
 * marks it selected while nothing is stored. Written as two literals instead,
 * they would eventually disagree and the builder would show a choice the shop
 * was not honouring. `null` for a section with only one shape.
 */
export function defaultLayout(key: HomepageSectionKey): string | null {
  return (HOMEPAGE_SECTION_LAYOUTS[key] as readonly string[])[0] ?? null
}

/** Up to this many category shelves, Shop by Category defaults to Cards. */
export const FEW_CATEGORIES = 4

/**
 * The Shop by Category layout a shop actually shows: the owner's stored
 * choice, else **Cards (`tiles`) for a shop with only a few shelves** — two
 * 80px chips left a desktop row almost empty — and the Compact row for more.
 *
 * Because this default depends on the shop, the Store Builder **always stores
 * the seller's pick** for this section (never "no value" for the first
 * option, as other sections do), and ticks the result of this function while
 * nothing is stored. Both sides read it here so they cannot disagree.
 */
export function categoryLayoutFor(stored: string | null, shelves: number): string {
  return stored ?? (shelves <= FEW_CATEGORIES ? 'tiles' : 'chips')
}

/**
 * What a section should actually render: the owner's choice where they made
 * one, the platform's default everywhere else.
 *
 * Settings are always a *preference*, never a promise — one naming a layout
 * the storefront no longer draws was already dropped by
 * `resolveSectionSettings`, so this can never be handed a shape it does not
 * understand.
 */
export function sectionCopy(section: HomepageSection) {
  const fallback = SECTION_DEFAULT_COPY[section.key]
  const settings = section.settings
  return {
    title: settings?.title ?? fallback.title,
    subtitle: settings?.subtitle ?? fallback.subtitle,
    layout: settings?.layout ?? null,
  }
}
