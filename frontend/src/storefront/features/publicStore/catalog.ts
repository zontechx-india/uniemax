/**
 * Client-side catalog concerns that survive server-side querying.
 *
 * Searching, sorting, category scoping and pagination all happen in SQL now
 * (see `useProductQuery` → `GET /public/stores/:slug/products`), so this file
 * holds only what the browser still legitimately owns: the *pending* filter
 * selection before it is sent to the API, and how a stock number is presented.
 */

import type { PublicProduct } from '../stores/storesApi'

export type StockLevel = 'in' | 'low' | 'out'

/** Below this (but above 0) total stock a product reads as "Low Stock". */
export const LOW_STOCK_THRESHOLD = 5

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out'
  if (stock <= LOW_STOCK_THRESHOLD) return 'low'
  return 'in'
}

/**
 * Filter selection held by the UI and translated into query params.
 * Availability and price are live; brand / rating / discount are future
 * filters the panel is already shaped for.
 */
export interface CatalogFilters {
  inStockOnly: boolean
  minPrice: number | null
  maxPrice: number | null
}

export const NO_FILTERS: CatalogFilters = {
  inStockOnly: false,
  minPrice: null,
  maxPrice: null,
}

/** How many filters are actively narrowing the list (drives the badge). */
export function activeFilterCount(filters: CatalogFilters): number {
  let n = 0
  if (filters.inStockOnly) n += 1
  if (filters.minPrice !== null) n += 1
  if (filters.maxPrice !== null) n += 1
  return n
}

/** True when a product's options sell at different prices ("From ₹299"). */
export function hasPriceRange(product: Pick<PublicProduct, 'price' | 'priceMax' | 'variantCount'>): boolean {
  return (
    product.variantCount > 0 &&
    product.price !== null &&
    product.priceMax !== null &&
    Number(product.priceMax) > Number(product.price)
  )
}
