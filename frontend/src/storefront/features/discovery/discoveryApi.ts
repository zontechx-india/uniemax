import { call, callList, http } from '../../../shared/auth/http'
import type { ListMeta } from '../../../shared/auth/http'

/**
 * Marketplace discovery — the anonymous, platform-wide surface behind the
 * homepage (`/`): global search, the "New Stores" rail and the trust stats.
 * Backed by `/api/v1/public/*` (see docs/API.md).
 */

const PUBLIC = '/api/v1/public'

/** A store as a marketplace card needs it — branding + a taste of catalog. */
export interface MarketStore {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  /** Stamped on first publish; drives the "New Stores" ordering. */
  publishedAt: string | null
  /** Publicly visible products in the store. */
  productCount: number
  /** Cover images of the newest visible products (max 4) — the card strip. */
  previewImages: string[]
}

/** A product on the platform-wide "Fresh Finds" rail (same shape as search hits). */
export interface MarketProduct {
  id: string
  name: string
  slug: string
  /** "From" price (cheapest sellable variant). Decimal on the wire. */
  price: string | null
  /** That variant's MRP when above its price — "Sale"; null = no sale. */
  compareAtPrice: string | null
  stockQuantity: number
  categoryName: string
  store: { name: string; slug: string }
  image: { url: string | null; altText: string | null } | null
}

export interface SearchStoreHit {
  id: string
  name: string
  slug: string
  logoUrl: string | null
}

/** Categories exist only inside a store, so a hit carries its owner. */
export interface SearchCategoryHit {
  id: string
  name: string
  slug: string
  parentName: string | null
  store: { name: string; slug: string }
}

export interface SearchProductHit {
  id: string
  name: string
  slug: string
  /** "From" price (cheapest sellable variant). Decimal on the wire. */
  price: string | null
  /** That variant's MRP when above its price — "Sale"; null = no sale. */
  compareAtPrice: string | null
  stockQuantity: number
  categoryName: string
  store: { name: string; slug: string }
  image: { url: string | null; altText: string | null } | null
}

/** Always grouped — stores, categories and products are never interleaved. */
export interface SearchResults {
  stores: SearchStoreHit[]
  categories: SearchCategoryHit[]
  products: SearchProductHit[]
}

/** A "Shop by Category" chip — aggregated category name across stores. */
export interface PopularCategory {
  name: string
  count: number
}

export interface PlatformStats {
  stores: number
  products: number
  /** Orders placed platform-wide (cancelled excluded). */
  orders: number
}

export const discoveryApi = {
  /** Published stores, newest publish first (homepage "New Stores"). */
  async listStores(
    query: { page?: number; pageSize?: number } = {},
  ): Promise<{ items: MarketStore[]; meta: ListMeta }> {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.pageSize) params.set('pageSize', String(query.pageSize))
    const qs = params.toString()
    return callList<MarketStore>(
      http.get(`${PUBLIC}/stores${qs ? `?${qs}` : ''}`),
    )
  },

  /** Grouped global search; `q` needs 2+ characters. */
  async search(q: string, limit = 5): Promise<SearchResults> {
    const params = new URLSearchParams({ q, limit: String(limit) })
    return call<SearchResults>(http.get(`${PUBLIC}/search?${params}`))
  },

  /** Newest discoverable products platform-wide (homepage "Fresh Finds"). */
  async listNewProducts(pageSize = 12): Promise<MarketProduct[]> {
    const { items } = await callList<MarketProduct>(
      http.get(`${PUBLIC}/products?pageSize=${pageSize}`),
    )
    return items
  },

  /** Most common category names across published stores (homepage chips). */
  async popularCategories(): Promise<PopularCategory[]> {
    return call<PopularCategory[]>(http.get(`${PUBLIC}/categories`))
  },

  /** Marketplace trust counters. */
  async stats(): Promise<PlatformStats> {
    return call<PlatformStats>(http.get(`${PUBLIC}/stats`))
  },
}
