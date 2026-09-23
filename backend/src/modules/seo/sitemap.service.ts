import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
} from "../stores/publicStore.service.js";
import { loadShelves, shelfIndex } from "../stores/shelfTree.js";
import { listBrowsableCategories } from "../discovery/browse.service.js";

/**
 * XML sitemaps for the public storefronts.
 *
 * A marketplace cannot rely on crawling to find its catalog. A product sits
 * three clicks below the marketplace homepage, behind a paginated listing
 * that only loads more on a button press — so a crawler following links
 * reaches the newest handful of products in a store and stops. The sitemap
 * is how store #40's three-hundredth product gets discovered at all, and
 * `lastmod` is how a price change gets re-crawled in days instead of months.
 *
 * ## Why these live under /api/v1/public
 *
 * A sitemap is conventionally served from the site root, which here would
 * mean a new nginx `location` on four vhosts. Mounted under the API prefix
 * it is reachable **today** through the `/api` proxy every vhost already
 * has, on every environment, with no server change — and a sitemap declared
 * in `robots.txt` is read for the whole host whatever path it sits at.
 * `public/robots.txt` points here.
 *
 * ## Visibility
 *
 * Every query reuses the storefront's own predicates, so a sitemap can never
 * advertise a URL a store page would 404 or hide. Products opted out with
 * "Hide from Search" are left out too: the flag means the seller does not
 * want that product found by searching, and handing it to Google in a
 * sitemap is the most literal possible contradiction of that.
 */

/** Sitemaps are cheap to build and stale-tolerant; an hour is plenty. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * The protocol cap is 50,000 URLs per file. A single store reaching that is
 * not a scenario this platform has, but truncating silently at the limit is
 * better than emitting a file Google rejects whole.
 */
const MAX_URLS = 50_000;

type CacheEntry = { xml: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

async function cached(key: string, build: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.xml;
  const xml = await build();
  cache.set(key, { xml, expiresAt: Date.now() + CACHE_TTL_MS });
  return xml;
}

/** Drops every cached file. Call after anything that changes what is public. */
export function clearSitemapCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Slugs are generated, so they are already URL-safe — but `origin` comes from
 * a request header and a store name could in principle reach a slug, and an
 * unescaped `&` invalidates the whole file rather than the one URL.
 */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

interface SitemapUrl {
  loc: string;
  lastmod?: Date | null;
  /**
   * A hint, not an instruction — Google ignores `priority` outright these
   * days. It is emitted because Bing still reads it and it costs nothing.
   */
  priority?: number;
}

function urlSet(urls: SitemapUrl[]): string {
  const body = urls
    .slice(0, MAX_URLS)
    .map((url) => {
      const parts = [`<loc>${escapeXml(url.loc)}</loc>`];
      if (url.lastmod) parts.push(`<lastmod>${url.lastmod.toISOString()}</lastmod>`);
      if (url.priority !== undefined)
        parts.push(`<priority>${url.priority.toFixed(1)}</priority>`);
      return `<url>${parts.join("")}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function sitemapIndex(entries: { loc: string; lastmod?: Date | null }[]): string {
  const body = entries
    .slice(0, MAX_URLS)
    .map((entry) => {
      const parts = [`<loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod)
        parts.push(`<lastmod>${entry.lastmod.toISOString()}</lastmod>`);
      return `<sitemap>${parts.join("")}</sitemap>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

/** Where the sitemap files themselves live, relative to the site origin. */
const SITEMAP_BASE = "/api/v1/public";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * The index: the marketplace file plus one file per published store.
 *
 * One file per store rather than one giant file is deliberate. Search Console
 * reports indexing coverage **per sitemap**, so this shape answers "how much
 * of THIS seller's catalog is indexed" — the question a seller actually asks
 * — without any extra reporting being built.
 */
export function buildSitemapIndex(origin: string): Promise<string> {
  return cached(`index:${origin}`, async () => {
    const stores = await prisma.store.findMany({
      where: PUBLIC_STORE_VISIBILITY,
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: MAX_URLS - 1,
    });

    return sitemapIndex([
      { loc: `${origin}${SITEMAP_BASE}/sitemap-stores.xml` },
      { loc: `${origin}${SITEMAP_BASE}/sitemap-categories.xml` },
      ...stores.map((store) => ({
        loc: `${origin}${SITEMAP_BASE}/sitemap-store-${encodeURIComponent(store.slug)}.xml`,
        lastmod: store.updatedAt,
      })),
    ]);
  });
}

/** The marketplace surface: the homepage and every published store's front page. */
export function buildMarketplaceSitemap(origin: string): Promise<string> {
  return cached(`stores:${origin}`, async () => {
    const stores = await prisma.store.findMany({
      where: PUBLIC_STORE_VISIBILITY,
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: MAX_URLS - 1,
    });

    return urlSet([
      { loc: `${origin}/`, priority: 1 },
      ...stores.map((store) => ({
        loc: `${origin}/store/${store.slug}`,
        lastmod: store.updatedAt,
        priority: 0.8,
      })),
    ]);
  });
}

/**
 * One store's own pages: its homepage, its browse-all page, every category
 * that has something to show, and every publicly visible product.
 *
 * A category is included only when the products query found something in it
 * **or beneath it** — a parent shelf whose stock all lives in its children is
 * a real page and belongs here, while a genuinely empty shelf is a thin page
 * that would only dilute the store.
 */
export function buildStoreSitemap(origin: string, slug: string): Promise<string> {
  return cached(`store:${origin}:${slug}`, async () => {
    const store = await prisma.store.findFirst({
      where: { slug, ...PUBLIC_STORE_VISIBILITY },
      select: { id: true, slug: true, updatedAt: true },
    });
    // Unpublished and non-existent are the same answer everywhere else on
    // the public surface; a sitemap must not be the one place that leaks the
    // difference.
    if (!store) throw HttpError.notFound("Store not found");

    const products = await prisma.storeProduct.findMany({
      where: {
        storeId: store.id,
        ...PUBLIC_PRODUCT_VISIBILITY,
        hideFromSearch: false,
      },
      select: { slug: true, updatedAt: true, categoryId: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_URLS,
    });

    const shelves = await loadShelves(store.id);
    const index = shelfIndex(shelves);
    const stocked = new Set(products.map((product) => product.categoryId));
    const categories = shelves.filter(
      (shelf) =>
        index.visible(shelf.id) &&
        index.descendantIds(shelf.id).some((id) => stocked.has(id)),
    );

    return urlSet([
      { loc: `${origin}/store/${store.slug}`, lastmod: store.updatedAt, priority: 0.8 },
      { loc: `${origin}/store/${store.slug}/shop`, priority: 0.5 },
      ...categories.map((category) => ({
        loc: `${origin}/store/${store.slug}/category/${category.slug}`,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        loc: `${origin}/store/${store.slug}/product/${product.slug}`,
        lastmod: product.updatedAt,
        priority: 0.6,
      })),
    ]);
  });
}

/**
 * The global category landing pages (`/c/{slug}`).
 *
 * These are the platform's only pages that can compete for a *category* term
 * rather than a store name, so they get the highest priority of anything a
 * seller does not own. Only nodes with something in them are listed —
 * `listBrowsableCategories` already excludes the empty ones, which is what
 * keeps an empty branch of the 154-node taxonomy from being submitted to
 * Google as a thin page.
 *
 * No `lastmod`: the page's content changes whenever any product in its branch
 * changes, across every store, and a date that is wrong is worse than one
 * that is absent.
 */
export function buildCategorySitemap(origin: string): Promise<string> {
  return cached(`categories:${origin}`, async () => {
    const categories = await listBrowsableCategories();
    return urlSet(
      categories.map((category) => ({
        loc: `${origin}/c/${category.slug}`,
        priority: 0.9,
      })),
    );
  });
}
