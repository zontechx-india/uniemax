import { useEffect, useState } from 'react'
import { publicStoreApi } from '../../../features/stores/storesApi'
import type { HomepageSectionKey } from '../../../features/stores/storesApi'
import { SMALL_SHOP_MAX } from '../../../features/publicStore/shopShape'

/**
 * What each homepage section has to show, for the Store Builder's list —
 * so a seller sees "4 products" or "Empty" under a section instead of
 * wondering why a switched-on row is missing from the shop.
 *
 * Read from the SAME payload the storefront renders (`GET /public/stores/
 * :slug/home`, which an owner can read for a draft too), so the numbers can
 * never disagree with the shop. Refetched whenever the builder saves.
 */
export interface SectionCounts {
  counts: Record<HomepageSectionKey, number>
  /**
   * The shop is small enough that the storefront shows every product once in
   * "All Products" — Featured, Best Sellers and New Arrivals lead that grid
   * instead of getting rows of their own (see `shapeHome` in StoreHomePage).
   */
  smallShop: boolean
  /** Products shown in "All Products" (the whole shop when it is small). */
  catalogSize: number
}

export function useSectionCounts(slug: string, refreshToken: number): SectionCounts | null {
  const [value, setValue] = useState<SectionCounts | null>(null)

  useEffect(() => {
    let cancelled = false
    publicStoreApi
      .getHome(slug)
      .then((home) => {
        if (cancelled) return
        const catalogOn = home.sections.some(
          (section) => section.key === 'catalog' && section.enabled,
        )
        setValue({
          counts: {
            banners: home.banners.length,
            categories: home.featuredCategories.length,
            featured: home.featured.length,
            newArrivals: home.newArrivals.length,
            bestSellers: home.bestSellers.length,
            categoryRows: home.categoryRows.length,
            catalog: home.catalog.length,
          },
          smallShop: catalogOn && home.catalog.length > 0 && home.catalog.length <= SMALL_SHOP_MAX,
          catalogSize: home.catalog.length,
        })
      })
      // Counts are a hint; without them the list simply shows its usual text.
      .catch(() => !cancelled && setValue(null))
    return () => {
      cancelled = true
    }
  }, [slug, refreshToken])

  return value
}
