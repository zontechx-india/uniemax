import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { mediaUrl } from "../../package/storage/index.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
} from "../stores/publicStore.service.js";
import { activeShelfChain } from "../stores/shelfTree.js";
import type { NewProductsQuery, SearchQuery } from "./discovery.schema.js";

/**
 * Platform-wide discovery: global search + trust stats for the marketplace
 * homepage. Everything here is anonymous and read-only, and every query
 * reuses `PUBLIC_PRODUCT_VISIBILITY` — the same rule the storefront enforces
 * — so search can never surface something a store page would hide.
 *
 * Matching is `contains` (ILIKE) on names. That is the right tool at this
 * scale; when the catalog grows into millions of rows the upgrade path is a
 * pg_trgm GIN index / Postgres FTS behind this same service function — the
 * API contract doesn't change.
 */

/**
 * A store must be published — and not admin-suspended — for ANY of its
 * content to be discoverable. Re-exported from the storefront so discovery
 * can never surface what a store page would hide.
 */
const publishedStore = PUBLIC_STORE_VISIBILITY;

/**
 * A product is marketplace-discoverable when it is publicly visible, its
 * store is published, and its owner hasn't opted it out of discovery —
 * "Hide from Search" applies to every platform-wide surface (search AND the
 * homepage product rail), exactly like in-store search.
 */
const discoverableProduct = {
  ...PUBLIC_PRODUCT_VISIBILITY,
  hideFromSearch: false,
  store: publishedStore,
} satisfies Prisma.StoreProductWhereInput;

/** Card-sized product hit — shared by search and the new-products rail. */
const marketProductSelect = {
  id: true,
  name: true,
  slug: true,
  priceMin: true,
  stockTotal: true,
  category: { select: { name: true } },
  store: { select: { name: true, slug: true } },
  media: {
    where: { type: "IMAGE" },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { key: true, altText: true },
  },
} satisfies Prisma.StoreProductSelect;

type MarketProductRow = Prisma.StoreProductGetPayload<{
  select: typeof marketProductSelect;
}>;

function shapeMarketProduct(product: MarketProductRow) {
  const cover = product.media[0] ?? null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.priceMin,
    stockQuantity: product.stockTotal,
    categoryName: product.category.name,
    store: product.store,
    image: cover
      ? { url: mediaUrl("media", cover.key), altText: cover.altText }
      : null,
  };
}

/**
 * Categories are discoverable when they're active, their parent chain is
 * active, their store is published, and they contain at least one visible
 * product — a hit must never land the visitor on an empty page.
 */
function discoverableCategoryWhere(q: string): Prisma.StoreCategoryWhereInput {
  return {
    name: { contains: q, mode: "insensitive" },
    ...activeShelfChain(),
    store: publishedStore,
    products: { some: PUBLIC_PRODUCT_VISIBILITY },
  };
}

/**
 * Grouped global search: stores, categories, products — each group capped at
 * `limit` and queried concurrently. Category and product hits carry their
 * owning store, because categories/products only exist inside a store
 * (`/store/{storeSlug}/…` is their only address).
 */
export async function searchPlatform({ q, limit }: SearchQuery) {
  const [stores, categories, products] = await Promise.all([
    prisma.store.findMany({
      where: { ...publishedStore, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, slug: true, logoKey: true },
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: limit,
    }),

    prisma.storeCategory.findMany({
      where: discoverableCategoryWhere(q),
      select: {
        id: true,
        name: true,
        slug: true,
        parent: { select: { name: true } },
        store: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),

    prisma.storeProduct.findMany({
      where: {
        ...discoverableProduct,
        name: { contains: q, mode: "insensitive" },
      },
      select: marketProductSelect,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  return {
    stores: stores.map(({ logoKey, ...store }) => ({
      ...store,
      logoUrl: mediaUrl("logo", logoKey),
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentName: category.parent?.name ?? null,
      store: category.store,
    })),
    products: products.map(shapeMarketProduct),
  };
}

// ---------------------------------------------------------------------------
// New products — the homepage "Fresh Finds" rail
// ---------------------------------------------------------------------------

/**
 * Newest discoverable products across all published stores. Recency-based
 * like the New Stores rail (no analytics involved), and the exact same
 * visibility + hide-from-search rules as global search.
 */
export async function listNewProducts({ page, pageSize }: NewProductsQuery) {
  const [total, products] = await Promise.all([
    prisma.storeProduct.count({ where: discoverableProduct }),
    prisma.storeProduct.findMany({
      where: discoverableProduct,
      select: marketProductSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, products: products.map(shapeMarketProduct) };
}

// ---------------------------------------------------------------------------
// Popular categories — the homepage "Shop by Category" strip
// ---------------------------------------------------------------------------

/** How many category chips the strip serves. */
const POPULAR_CATEGORIES_LIMIT = 12;

/**
 * Micro-cache, same rationale as the stats cache below: every visitor asks,
 * the answer changes slowly.
 */
const CATEGORIES_TTL_MS = 60_000;
let categoriesCache: {
  data: PopularCategory[];
  expiresAt: number;
} | null = null;

export interface PopularCategory {
  name: string;
  /** How many discoverable categories share the name (≈ store spread). */
  count: number;
}

/**
 * The most common category names across published stores. Categories are
 * per-store (there is no global taxonomy), so the platform's "categories"
 * are an aggregation: group discoverable category names case-insensitively,
 * keep the most frequent spelling for display, order by spread. Only
 * categories with at least one visible product count — a chip must never
 * lead to an empty search.
 */
export async function getPopularCategories(): Promise<PopularCategory[]> {
  const now = Date.now();
  if (categoriesCache && categoriesCache.expiresAt > now)
    return categoriesCache.data;

  const grouped = await prisma.storeCategory.groupBy({
    by: ["name"],
    where: {
      ...activeShelfChain(),
      store: publishedStore,
      products: { some: PUBLIC_PRODUCT_VISIBILITY },
    },
    _count: { name: true },
    orderBy: { _count: { name: "desc" } },
    // Overfetch so case-insensitive merging below can still fill the strip.
    take: POPULAR_CATEGORIES_LIMIT * 3,
  });

  // Merge "Cricket" / "cricket" style duplicates across stores; the most
  // frequent spelling (first seen — rows arrive ordered by count) wins.
  const merged = new Map<string, PopularCategory>();
  for (const row of grouped) {
    const key = row.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) existing.count += row._count.name;
    else merged.set(key, { name: row.name, count: row._count.name });
  }

  const data = [...merged.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, POPULAR_CATEGORIES_LIMIT);

  categoriesCache = { data, expiresAt: now + CATEGORIES_TTL_MS };
  return data;
}

// ---------------------------------------------------------------------------
// Platform stats
// ---------------------------------------------------------------------------

/**
 * Micro-cache for the homepage trust counters. The numbers change slowly and
 * every visitor requests them, so one process-wide value with a short TTL
 * turns a count-scan per page view into one per minute. (When the API runs
 * multi-instance each process keeps its own copy — still correct, still
 * bounded at one scan per instance per minute.)
 */
const STATS_TTL_MS = 60_000;
let statsCache: { data: PlatformStats; expiresAt: number } | null = null;

export interface PlatformStats {
  stores: number;
  products: number;
  orders: number;
}

/**
 * Published-store count + publicly visible product count + orders placed.
 * Cancelled orders are excluded — a trust counter must reflect real trade,
 * and orders survive store deletion (SetNull + snapshots), so the count
 * never shrinks when a seller leaves.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = Date.now();
  if (statsCache && statsCache.expiresAt > now) return statsCache.data;

  const [stores, products, orders] = await Promise.all([
    prisma.store.count({ where: publishedStore }),
    prisma.storeProduct.count({
      where: { ...PUBLIC_PRODUCT_VISIBILITY, store: publishedStore },
    }),
    prisma.order.count({ where: { status: { not: "CANCELLED" } } }),
  ]);

  const data = { stores, products, orders };
  statsCache = { data, expiresAt: now + STATS_TTL_MS };
  return data;
}
