import type { FastifyBaseLogger } from "fastify";
import { shareImagePath } from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";
import { browseCategory } from "../discovery/browse.service.js";
import {
  getPublicCategory,
  getPublicProduct,
  getPublicStoreShell,
  getVisibleStore,
} from "../stores/publicStore.service.js";
import type { PageHead } from "./pageHead.js";
import type { PageShellQuery } from "./pageShell.schema.js";
import { productMetaDescription } from "./productText.js";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  categoryTrail,
  productJsonLd,
  storeBreadcrumbJsonLd,
  storeCategoryPath,
  storeHomePath,
  storeJsonLd,
  storeProductPath,
} from "./structuredData.js";

/**
 * Which head a storefront URL gets, and whether it is a real page.
 * docs/SEO.md (§4, §5) is the source of truth — update it with any change here.
 *
 * Each resolver mirrors the SPA page's own `useSeo` call — `StoreHomePage`,
 * `StoreCategoryPage`, `StoreProductPage`, `StoreShopPage`, the support
 * pages and `BrowseCategoryPage` — using the same public services the SPA's
 * API calls hit, so visibility is decided by exactly the same predicates.
 * When a page's head rules change in the SPA, they change here too.
 *
 * Rendered **anonymously**: an unpublished store is a 404 here even for its
 * owner. That costs the owner nothing (the SPA still loads their draft over
 * the API with their session) and keeps every resolved head safe to cache
 * and to hand to any crawler.
 *
 * The status is the point of half of this: the nginx SPA fallback answered
 * `200` for every dead slug, so a deleted product stayed "live" to a search
 * engine. A missing store, product, category or unknown sub-path is now a
 * real `404` (with the same shell, so a visitor still gets the SPA's own
 * not-found screen).
 */

export type PageKind = "store" | "browse";

export interface ResolvedPage {
  status: 200 | 404;
  head: PageHead;
}

/** Must match `SECTION_TITLES` in `frontend/src/storefront/features/stores/storesApi.ts`. */
const SECTION_TITLES: Record<NonNullable<PageShellQuery["section"]>, string> = {
  featured: "Featured Products",
  newArrivals: "New Arrivals",
  bestSellers: "Best Sellers",
};

/** Must match `PAGE_SIZE` in `BrowseCategoryPage.tsx` — it decides the "shops" count. */
const BROWSE_PAGE_SIZE = 24;

const NOINDEX = "noindex, follow";

const pageNotFound: ResolvedPage = {
  status: 404,
  head: { title: ["Page not found"], robots: NOINDEX },
};

/** Worded like the SPA's `StoreUnavailable` screen, which sets no head of its own. */
const storeNotFound: ResolvedPage = {
  status: 404,
  head: {
    title: ["Store not available"],
    description: "The store you're looking for doesn't exist or is no longer published.",
    robots: NOINDEX,
  },
};

// ---------------------------------------------------------------------------
// Entry point — caching and the time limit
// ---------------------------------------------------------------------------

/** A viral store link is many identical renders a minute; this absorbs the burst. */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
/**
 * Every storefront landing now waits on this before its first byte. Past the
 * limit the visitor gets the platform-default shell immediately — the SPA
 * then writes the real head as it always has.
 */
const RESOLVE_TIMEOUT_MS = 1_500;

const cache = new Map<string, { page: ResolvedPage; expiresAt: number }>();

/**
 * The page for `segments` (the decoded path segments after `/store` or `/c`;
 * `null` when the path could not be decoded). Returns `null` when the head
 * could not be resolved in time or the lookup failed — the caller then
 * serves the shell unmodified, exactly what nginx served before.
 */
export async function resolvePage(
  kind: PageKind,
  segments: string[] | null,
  query: PageShellQuery,
  context: { origin: string; path: string; log: FastifyBaseLogger },
): Promise<ResolvedPage | null> {
  if (!segments) return pageNotFound;

  const { origin, path, log } = context;
  const key = [kind, origin, path, query.q, query.section ?? "", query.page, query.sort].join("|");
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.page;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), RESOLVE_TIMEOUT_MS);
  });

  try {
    const work = kind === "store" ? storePage(segments, query, origin) : browsePage(segments, query, origin);
    const result = await Promise.race([work, timeout]);
    if (result === "timeout") {
      log.warn({ path }, "page shell: page data was too slow — serving the default head");
      return null;
    }
    // Only real pages are cached. A 404 must clear the moment the page
    // exists: a seller who previews a draft, publishes and shares the link
    // straight away would otherwise hand WhatsApp a "not available" card.
    if (result.status === 200) remember(key, result);
    return result;
  } catch (error) {
    log.error({ err: error, path }, "page shell: could not resolve the head — serving the default");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function remember(key: string, page: ResolvedPage) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { page, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** The services throw a 404 `HttpError` for "not visible"; anything else is a real failure. */
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// /store/{slug}/…
// ---------------------------------------------------------------------------

/** Mirrors the routes in `frontend/src/storefront/app/publicRouter.tsx`. */
async function storePage(
  segments: string[],
  query: PageShellQuery,
  origin: string,
): Promise<ResolvedPage> {
  const [storeSlug, section, childSlug, ...extra] = segments;
  if (!storeSlug || extra.length > 0) return pageNotFound;

  if (section === undefined) return storeHomePage(storeSlug, origin);
  if (section === "category" && childSlug) return storeCategoryPage(storeSlug, childSlug, origin);
  if (section === "product" && childSlug) return storeProductPage(storeSlug, childSlug, origin);
  if (section === "shop" && !childSlug) return storeShopPage(storeSlug, query);
  if (section === "support") return storeSupportPage(storeSlug, childSlug);
  return pageNotFound;
}

/**
 * Name, slug and the logo's share image — all a non-home store page's head
 * needs. One query. Heads use share images (small JPEGs), never originals:
 * WhatsApp drops a preview image it cannot fetch quickly.
 */
async function findStore(slug: string) {
  const store = await orNull(getVisibleStore(slug));
  return store
    ? {
        name: store.name,
        slug: store.slug,
        shareImageUrl: store.logoKey ? shareImagePath("logo", store.logoKey) : null,
      }
    : null;
}

/** `StoreHomePage` → `useStoreHomeSeo`. */
async function storeHomePage(slug: string, origin: string): Promise<ResolvedPage> {
  const store = await orNull(getPublicStoreShell(slug));
  if (!store) return storeNotFound;

  const shelves = store.categories
    .slice(0, 6)
    .map((category) => category.name)
    .join(", ");

  return {
    status: 200,
    head: {
      title: [store.name],
      description:
        store.footer.info.about ||
        (shelves
          ? `Shop ${shelves} at ${store.name} on UnieMax. Order online with delivery or store pickup.`
          : `Shop ${store.name} on UnieMax — order online with delivery or store pickup.`),
      canonical: storeHomePath(store.slug),
      image: store.shareImageUrl,
      jsonLd: [storeJsonLd(store, origin)],
    },
  };
}

/** `StoreCategoryPage` → `useCategorySeo`. */
async function storeCategoryPage(
  slug: string,
  categorySlug: string,
  origin: string,
): Promise<ResolvedPage> {
  const [store, category] = await Promise.all([
    findStore(slug),
    orNull(getPublicCategory(slug, categorySlug)),
  ]);
  if (!store) return storeNotFound;

  const canonical = storeCategoryPath(store.slug, categorySlug);
  if (!category) {
    return {
      status: 404,
      head: { title: [store.name], canonical, image: store.shareImageUrl, robots: NOINDEX },
    };
  }

  const children = category.subcategories.map((sub) => sub.name).join(", ");
  return {
    status: 200,
    head: {
      title: [category.name, store.name],
      description: children
        ? `${category.name} at ${store.name} — ${children}. Order online with delivery or store pickup on UnieMax.`
        : `Shop ${category.name} at ${store.name} on UnieMax. Order online with delivery or store pickup.`,
      canonical,
      image: store.shareImageUrl,
      jsonLd: [storeBreadcrumbJsonLd(store, categoryTrail(store.slug, category), origin)],
    },
  };
}

/** `StoreProductPage` → `useProductSeo`. */
async function storeProductPage(
  slug: string,
  productSlug: string,
  origin: string,
): Promise<ResolvedPage> {
  const [store, product] = await Promise.all([
    findStore(slug),
    orNull(getPublicProduct(slug, productSlug)),
  ]);
  if (!store) return storeNotFound;
  if (!product) {
    return {
      status: 404,
      head: { title: [store.name], image: store.shareImageUrl, type: "product", robots: NOINDEX },
    };
  }

  const description = productMetaDescription(
    {
      name: product.name,
      description: product.description,
      price: product.price?.toString() ?? null,
      category: product.category,
    },
    store.name,
  );
  const url = storeProductPath(store.slug, product.slug);

  return {
    status: 200,
    head: {
      title: [product.name, store.name],
      description,
      canonical: url,
      image: product.shareImageUrl ?? store.shareImageUrl,
      type: "product",
      jsonLd: [
        productJsonLd(store, product, description, origin),
        storeBreadcrumbJsonLd(
          store,
          [...categoryTrail(store.slug, product.category), { name: product.name, path: url }],
          origin,
        ),
      ],
    },
  };
}

/** `StoreShopPage` — only the unscoped listing is a destination. */
async function storeShopPage(slug: string, query: PageShellQuery): Promise<ResolvedPage> {
  const store = await findStore(slug);
  if (!store) return storeNotFound;

  const scoped = Boolean(query.q || query.section);
  return {
    status: 200,
    head: {
      title: [
        query.q ? `Search “${query.q}”` : query.section ? SECTION_TITLES[query.section] : "Shop",
        store.name,
      ],
      description: scoped
        ? null
        : `Browse every product from ${store.name} on UnieMax — order online with delivery or store pickup.`,
      canonical: `/store/${store.slug}/shop`,
      image: store.shareImageUrl,
      robots: scoped ? NOINDEX : null,
    },
  };
}

/** `StoreHelpPage` (`usePageTitle`) and `StoreHelpTicketPage` (`usePrivatePageTitle`). */
async function storeSupportPage(
  slug: string,
  ticketId: string | undefined,
): Promise<ResolvedPage> {
  const store = await findStore(slug);
  if (!store) return storeNotFound;

  return {
    status: 200,
    head: ticketId
      ? { title: ["Support request", store.name], robots: NOINDEX }
      : { title: ["Help & Support", store.name] },
  };
}

// ---------------------------------------------------------------------------
// /c/{slug}
// ---------------------------------------------------------------------------

/** `BrowseCategoryPage` → `useBrowseSeo`. */
async function browsePage(
  segments: string[],
  query: PageShellQuery,
  origin: string,
): Promise<ResolvedPage> {
  const [slug, ...extra] = segments;
  if (!slug || extra.length > 0) return pageNotFound;

  const canonical = `/c/${slug}`;
  const data = await browseCategory(slug, {
    page: query.page,
    pageSize: BROWSE_PAGE_SIZE,
    sort: query.sort,
  });
  if (!data) {
    return {
      status: 404,
      head: { title: ["Shop by category"], canonical, robots: NOINDEX },
    };
  }

  const { name } = data.category;
  const { total } = data;
  const shops = new Set(data.products.map((product) => product.store.slug)).size;
  // Page 2+ and any non-default sort re-cut the same set: reachable, not indexable.
  const scoped = query.page > 1 || query.sort !== "newest";

  return {
    status: 200,
    head: {
      title: [name, "Shop by category"],
      description:
        total > 0
          ? `Shop ${name} on UnieMax — ${total} product${total === 1 ? "" : "s"}${
              shops > 1 ? ` from ${shops} independent shops` : ""
            }. Buy direct from the seller with cash on delivery or secure online payment.`
          : `${name} on UnieMax — buy direct from independent sellers with cash on delivery or secure online payment.`,
      canonical,
      robots: total === 0 || scoped ? NOINDEX : null,
      jsonLd:
        total > 0 && !scoped
          ? [
              breadcrumbJsonLd(
                [
                  { name: "UnieMax", path: "/" },
                  ...data.category.path.map((crumb) => ({ name: crumb.name, path: `/c/${crumb.slug}` })),
                ],
                origin,
              ),
              {
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: data.category.name,
                numberOfItems: data.products.length,
                itemListElement: data.products.map((product, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  url: absoluteUrl(storeProductPath(product.store.slug, product.slug), origin),
                  name: product.name,
                })),
              },
            ]
          : [],
    },
  };
}
