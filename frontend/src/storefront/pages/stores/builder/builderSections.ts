import type { ComponentType } from 'react'
import type { HomepageSectionKey } from '../../../features/stores/storesApi'
import { HOMEPAGE_SECTION_LAYOUTS } from '../../../features/stores/storesApi'
import {
  BoxIcon,
  ImageIcon,
  SlidersIcon,
  StarIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
} from '../../../layout/icons'

/**
 * What the Store Builder knows about each storefront section.
 *
 * **One table, and it is most of the product.** Every control the builder
 * shows is derived from here: which rows the list renders, what each row is
 * called in plain words, which fields its editor offers, which layout buttons
 * exist and what each of them is called. Nothing is hand-wired per section, so
 * a section can never end up offering a control the storefront cannot honour —
 * the layout ids come straight from `HOMEPAGE_SECTION_LAYOUTS`, which is also
 * what the API validates writes against.
 *
 * The language is deliberately flat. A seller reading "Products you marked as
 * Featured" knows what will happen; a seller reading "configure merchandising
 * entity rendering" does not.
 */

export interface LayoutOption {
  /** Stored value — must appear in `HOMEPAGE_SECTION_LAYOUTS[key]`. */
  id: string
  label: string
  /** One line, shown under the choice. */
  hint: string
}

export interface BuilderSectionMeta {
  label: string
  /** The one line under the section's name in the list. */
  hint: string
  icon: ComponentType<{ className?: string }>
  /** Longer explanation, shown at the top of the editor. */
  about: string
  /** Offer a heading override? (False where the section paints no heading.) */
  title: boolean
  /** Offer the small line beside the heading? */
  subtitle: boolean
  /** Offer a button-label field? Hero only — it is the only one with a button. */
  ctaLabel?: boolean
  /** Presentation choices, in the order they are offered. */
  layouts: LayoutOption[]
  /**
   * Where this section's CONTENT comes from, when it is not the section's own
   * settings. Rendered as a link out of the editor, because "why is my
   * Featured row empty" is answered on the Products screen, not here.
   */
  source?: { label: string; to: string; note: string }
  /** A whole editor of its own (banners) rather than the standard fields. */
  editor?: 'banners'
}

export const BUILDER_SECTIONS: Record<HomepageSectionKey, BuilderSectionMeta> = {
  hero: {
    label: 'Welcome Hero',
    hint: 'Your shop name, intro line and main button',
    icon: StoreIcon,
    about:
      'The opening of your storefront. Leave the fields blank and it uses your store name and your About text — write something here to say it your own way.',
    title: true,
    subtitle: true,
    ctaLabel: true,
    layouts: [
      {
        id: 'split',
        label: 'Text + Images',
        hint: 'Your words on the left, pictures of your products on the right',
      },
      {
        id: 'minimal',
        label: 'Text only',
        hint: 'A centred introduction with no pictures',
      },
    ],
  },
  banners: {
    label: 'Banners',
    hint: 'Your promotional images',
    icon: ImageIcon,
    about:
      'Wide promotional pictures near the top of your shop. With more than one they rotate on their own, and each can take a shopper to a product, a category or any web address.',
    title: false,
    subtitle: false,
    layouts: [],
    editor: 'banners',
  },
  categories: {
    label: 'Shop by Category',
    hint: 'Links to each of your categories',
    icon: TagIcon,
    about:
      'How shoppers find their way around. It lists your categories — star some under Categories to show only those.',
    title: true,
    subtitle: false,
    layouts: [
      {
        id: 'chips',
        label: 'Compact row',
        hint: 'One scrolling line — fits any number of categories',
      },
      {
        id: 'tiles',
        label: 'Cards',
        hint: 'A block of cards. Best when your categories are the main pitch',
      },
    ],
    source: {
      label: 'Manage categories',
      to: 'categories',
      note: 'Star a category there to show only your chosen few here.',
    },
  },
  featured: {
    label: 'Featured Products',
    hint: 'Products you marked as Featured',
    icon: StarIcon,
    about:
      'The products you want seen first. Mark a product as Featured and it appears here.',
    title: true,
    subtitle: true,
    layouts: [
      {
        id: 'spotlight',
        label: 'Spotlight',
        hint: 'One large product beside six smaller ones',
      },
      { id: 'rail', label: 'Sliding row', hint: 'Swipes sideways' },
      { id: 'grid', label: 'Simple row', hint: 'One tidy row of products' },
    ],
    source: {
      label: 'Mark products as Featured',
      to: 'products',
      note: 'This row stays hidden until at least one product is marked.',
    },
  },
  newArrivals: {
    label: 'New Arrivals',
    hint: 'Products you marked as New Arrival',
    icon: BoxIcon,
    about:
      'Your latest stock. Mark a product as New Arrival and it appears here.',
    title: true,
    subtitle: true,
    layouts: [
      { id: 'rail', label: 'Sliding row', hint: 'Swipes sideways' },
      { id: 'grid', label: 'Simple row', hint: 'One tidy row of products' },
    ],
    source: {
      label: 'Mark products as New Arrival',
      to: 'products',
      note: 'This row stays hidden until at least one product is marked.',
    },
  },
  bestSellers: {
    label: 'Best Sellers',
    hint: 'Products you marked as Best Seller',
    icon: TruckIcon,
    about:
      'What sells. Mark a product as Best Seller and it appears here.',
    title: true,
    subtitle: true,
    layouts: [
      { id: 'rail', label: 'Sliding row', hint: 'Swipes sideways' },
      { id: 'grid', label: 'Simple row', hint: 'One tidy row of products' },
    ],
    source: {
      label: 'Mark products as Best Seller',
      to: 'products',
      note: 'This row stays hidden until at least one product is marked.',
    },
  },
  categoryRows: {
    label: 'Category Highlights',
    hint: 'A shelf of products per category — fills itself',
    icon: SlidersIcon,
    about:
      'A shelf for each of your first three categories, showing that shelf’s newest products. It fills itself from your catalogue, so there is nothing to mark and nothing to keep up to date.',
    title: false,
    subtitle: false,
    layouts: [],
  },
  catalog: {
    label: 'All Products',
    hint: 'Your newest products — fills itself',
    icon: BoxIcon,
    about:
      'Your newest products across the whole shop, whatever you have marked. It fills itself, so a brand-new shop still has something to show.',
    title: true,
    subtitle: true,
    layouts: [
      { id: 'grid', label: 'Simple row', hint: 'One tidy row of products' },
      { id: 'rail', label: 'Sliding row', hint: 'Swipes sideways' },
    ],
  },
}

/**
 * Guard rail: the layout ids offered above must be exactly the ones the API
 * accepts. Thrown at module load in development rather than discovered as a
 * 400 after a seller clicks something — the two lists drifting apart is the
 * one way this table can lie.
 */
if (import.meta.env.DEV) {
  for (const [key, meta] of Object.entries(BUILDER_SECTIONS)) {
    const allowed = HOMEPAGE_SECTION_LAYOUTS[
      key as HomepageSectionKey
    ] as readonly string[]
    const stray = meta.layouts
      .map((layout) => layout.id)
      .filter((id) => !allowed.includes(id))
    if (stray.length > 0) {
      throw new Error(
        `BUILDER_SECTIONS.${key} offers unsupported layout(s): ${stray.join(', ')}`,
      )
    }
    // The first option is the one shown as selected before a seller chooses
    // anything, and the storefront falls back to the first of ITS list — so
    // listing them in a different order would tick a box the shop is not
    // honouring.
    if (meta.layouts.length > 0 && meta.layouts[0]!.id !== allowed[0]) {
      throw new Error(
        `BUILDER_SECTIONS.${key} must offer "${allowed[0]}" first — it is the default`,
      )
    }
  }
}

/** Does this section have anything to edit beyond being on or off? */
export function sectionIsEditable(meta: BuilderSectionMeta): boolean {
  return Boolean(
    meta.editor || meta.title || meta.subtitle || meta.layouts.length > 0,
  )
}
