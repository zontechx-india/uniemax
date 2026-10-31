import type { ComponentType } from 'react'
import {
  BagIcon,
  BoxIcon,
  CartIcon,
  ClockIcon,
  GlobeIcon,
  HomeIcon,
  ImageIcon,
  MegaphoneIcon,
  StoreIcon,
  TagIcon,
} from '../../layout/icons'

/**
 * The marketplace homepage (`/`) as a list of sections the platform team
 * reorders and switches on/off in the admin console (Homepage sections).
 *
 * Mirrors `MARKET_HOME_SECTION_KEYS` in the backend's
 * `modules/marketHome/marketHome.schema.ts` — same keys, same default order.
 * The header and footer are not sections: always at the top and the bottom.
 */
export const MARKET_HOME_SECTION_KEYS = [
  'banners',
  'intro',
  'popularCategories',
  'continueShopping',
  'topStores',
  'shopByCategory',
  'freshFinds',
  'moreToExplore',
  'recentlyViewed',
  'myStores',
  'becomeSeller',
] as const

export type MarketHomeSectionKey = (typeof MARKET_HOME_SECTION_KEYS)[number]

export interface MarketHomeSection {
  key: MarketHomeSectionKey
  enabled: boolean
}

/**
 * Sections that start switched off. Mirrors `DEFAULT_OFF_SECTIONS` in the
 * backend: the Popular row waits for its new design, but an admin can turn
 * it on.
 */
const DEFAULT_OFF_SECTIONS: readonly MarketHomeSectionKey[] = ['popularCategories']

/** What `/` shows before an admin has saved anything. */
export const DEFAULT_MARKET_HOME_SECTIONS: MarketHomeSection[] =
  MARKET_HOME_SECTION_KEYS.map((key) => ({
    key,
    enabled: !DEFAULT_OFF_SECTIONS.includes(key),
  }))

export interface MarketHomeSectionMeta {
  label: string
  /** What the section shows — one short line for the admin list. */
  hint: string
  icon: ComponentType<{ className?: string }>
  /** Can move, but can never be switched off (and why). */
  alwaysOn?: string
}

export const MARKET_HOME_SECTION_META: Record<
  MarketHomeSectionKey,
  MarketHomeSectionMeta
> = {
  banners: {
    label: 'Banners',
    hint: 'The promo carousel from Homepage banners',
    icon: ImageIcon,
  },
  intro: {
    label: 'Welcome bar',
    hint: 'Page heading and trust points',
    icon: HomeIcon,
    alwaysOn: "Holds the page's main heading, so it is always shown",
  },
  popularCategories: {
    label: 'Popular categories',
    hint: 'Category chips with a link to all categories',
    icon: TagIcon,
  },
  continueShopping: {
    label: 'Continue shopping',
    hint: "The visitor's cart, one card per store — only when it has items",
    icon: CartIcon,
  },
  topStores: {
    label: 'Top Stores',
    hint: 'Listed stores, best first',
    icon: StoreIcon,
  },
  shopByCategory: {
    label: 'Shop by category',
    hint: 'A tile for each top category',
    icon: TagIcon,
  },
  freshFinds: {
    label: 'Fresh Finds',
    hint: 'The newest products across all stores',
    icon: BoxIcon,
  },
  moreToExplore: {
    label: 'More to explore',
    hint: 'A product row per top category',
    icon: GlobeIcon,
  },
  recentlyViewed: {
    label: 'Recently Viewed',
    hint: 'Stores the visitor opened — only when there are some',
    icon: ClockIcon,
  },
  myStores: {
    label: 'My Stores',
    hint: 'Signed-in sellers only — their own stores',
    icon: BagIcon,
  },
  becomeSeller: {
    label: 'Become a Seller',
    hint: 'The panel that invites visitors to open a store',
    icon: MegaphoneIcon,
  },
}
