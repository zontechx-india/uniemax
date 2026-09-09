import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { mediaUrl } from "../../package/storage/index.js";
import {
  resolveCheckoutFields,
  resolveFooter,
  resolveHomepage,
  resolvePayments,
  resolveShipping,
} from "./stores.schema.js";
import type { HomepageSectionKey } from "./stores.schema.js";
import {
  resolveOptionTypes,
  resolveOptionValues,
  resolveSpecifications,
} from "./storeCatalog.schema.js";
import { sortByOptionOrder } from "./productOptions.js";
import { activeShelfChain, loadShelves, shelfIndex } from "./shelfTree.js";
import {
  effectiveDeliveryRule,
  isDeliverable,
  resolveProductDeliveryRule,
  restrictsDelivery,
} from "./deliveryRules.js";
import {
  effectiveProductShipping,
  resolveProductShippingOverride,
} from "./shippingRates.js";
import type {
  PublicDeliveryCheckQuery,
  PublicProductQuery,
  PublicStoreListQuery,
} from "./publicStore.schema.js";

/**
 * The anonymous storefront surface. Only **published** stores resolve; an
 * unpublished or unknown slug is a plain 404, so unpublished stores are
 * indistinguishable from non-existent ones.
 *
 * One exception — the **owner draft preview**: every function takes an
 * optional `viewerId` (the signed-in customer, if any, resolved best-effort by
 * the controller). An unpublished store resolves for its own owner, so owners
 * can see their storefront before publishing. Nobody else can tell the
 * difference: for any other viewer the store stays a 404. The shell carries
 * `isPublished` so the storefront can show a "draft preview" banner.
 *
 * Everything here is built to scale: the store shell carries the category tree
 * but **no products**, and product listings are filtered, sorted and paginated
 * in SQL against the denormalised `priceMin` / `stockTotal` columns
 * (see `catalogSlug.ts#recomputeProductAggregates`). Nothing loads a whole
 * catalog into memory.
 */

/** How many products each homepage section shows. */
const SECTION_LIMIT = 12;
/** How many related products a product page suggests. */
const RELATED_LIMIT = 8;

const storeShellSelect = {
  id: true,
  name: true,
  slug: true,
  logoKey: true,
  theme: true,
  // False only on an owner draft preview — drives the storefront banner.
  isPublished: true,
  // Raw section switches; `getPublicStoreHome` normalises them before use.
  homepage: true,
  // Owner-managed footer content; the shell resolves it to the full shape.
  footer: true,
  // Accepted payment methods — the checkout page shows what's available.
  payments: true,
  // Fulfilment mode (delivery/pickup/both) — same consumer.
  shipping: true,
  // Which customer fields the checkout collects (seller-toggled).
  checkout: true,
} satisfies Prisma.StoreSelect;

/**
 * A store is live to the public when it is published AND not suspended by a
 * platform admin. Suspension deliberately outranks the owner's own publish
 * switch — and it hides the store from its owner's draft preview too, since
 * a suspended store is off the marketplace for everyone.
 */
export const PUBLIC_STORE_VISIBILITY = {
  isPublished: true,
  suspendedAt: null,
} satisfies Prisma.StoreWhereInput;

/**
 * Resolves a publicly visible store by slug, or 404. "Visible" means
 * published — or unpublished but owned by the viewer (the draft preview).
 */
export async function getVisibleStore(slug: string, viewerId?: string) {
  const store = await prisma.store.findFirst({
    where: {
      slug,
      suspendedAt: null,
      ...(viewerId ? { OR: [{ isPublished: true }, { ownerId: viewerId }] } : { isPublished: true }),
    },
    select: storeShellSelect,
  });
  if (!store) throw HttpError.notFound("Store not found");
  return store;
}

/**
 * The single source of truth for "can a customer see this product",
 * independent of which store it belongs to. Exported so platform-wide
 * surfaces (marketplace search/stats in `modules/discovery`) enforce the
 * exact same rule — never a re-implementation that could drift.
 *
 * A product is publicly visible only when it is active, has something sellable
 * (`priceMin` is null exactly when every variant is disabled), and its whole
 * category chain is active — a disabled root hides its subcategories' products
 * too.
 */
export const PUBLIC_PRODUCT_VISIBILITY = {
  isActive: true,
  priceMin: { not: null },
  category: activeShelfChain(),
} satisfies Prisma.StoreProductWhereInput;

/** `PUBLIC_PRODUCT_VISIBILITY` scoped to one store. */
export function visibleProductWhere(storeId: string): Prisma.StoreProductWhereInput {
  return { storeId, ...PUBLIC_PRODUCT_VISIBILITY };
}

// ---------------------------------------------------------------------------
// Product shaping
// ---------------------------------------------------------------------------

/**
 * Listing shape — deliberately lean. The card only needs a "from" price, a
 * stock badge and a variant COUNT ("4 Variants Available"); the variants
 * themselves are never rendered in a listing, so they are never sent.
 */
const listProductSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  priceMin: true,
  priceMax: true,
  stockTotal: true,
  category: { select: { name: true, slug: true, parentId: true } },
  _count: {
    select: { variants: { where: { isActive: true, isDefault: false } } },
  },
  // Cover image only — the image with the lowest displayOrder. A listing
  // card never needs more, so a page of cards stays one row per product.
  media: {
    where: { type: "IMAGE" },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { key: true, altText: true },
  },
} satisfies Prisma.StoreProductSelect;

type ListProductRow = Prisma.StoreProductGetPayload<{
  select: typeof listProductSelect;
}>;

function shapeListProduct(row: ListProductRow) {
  const cover = row.media[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    /** Cheapest sellable variant — the "From ₹X" price. */
    price: row.priceMin,
    priceMax: row.priceMax,
    stockQuantity: row.stockTotal,
    /** Real options only; 0 means a simple product (no picker needed). */
    variantCount: row._count.variants,
    category: { name: row.category.name, slug: row.category.slug },
    /** Cover image (first by display order), or null — never a key. */
    image: cover
      ? { url: mediaUrl("media", cover.key), altText: cover.altText }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Marketplace store index — "New Stores" on the platform homepage
// ---------------------------------------------------------------------------

/** How many product thumbnails a marketplace store card previews. */
const STORE_PREVIEW_IMAGES = 4;

/**
 * Published stores, newest publish first. Card-sized payload: branding plus
 * a taste of the catalog — the visible-product count and up to
 * `STORE_PREVIEW_IMAGES` cover thumbnails — so a marketplace card can show
 * real merchandise without shipping catalog data. Both use
 * `PUBLIC_PRODUCT_VISIBILITY`, so the card never previews (or counts)
 * anything the store page would hide.
 */
export async function listPublicStores(query: PublicStoreListQuery) {
  const where: Prisma.StoreWhereInput = { ...PUBLIC_STORE_VISIBILITY };

  const [total, rows] = await Promise.all([
    prisma.store.count({ where }),
    prisma.store.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        logoKey: true,
        publishedAt: true,
        _count: { select: { products: { where: PUBLIC_PRODUCT_VISIBILITY } } },
        // Newest visible products that HAVE a photo — each contributes its
        // cover image to the card's preview strip.
        products: {
          where: {
            ...PUBLIC_PRODUCT_VISIBILITY,
            media: { some: { type: "IMAGE" } },
          },
          orderBy: { createdAt: "desc" },
          take: STORE_PREVIEW_IMAGES,
          select: {
            media: {
              where: { type: "IMAGE" },
              orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
              take: 1,
              select: { key: true },
            },
          },
        },
      },
      // publishedAt is stamped on first publish; nulls sink to the end.
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    total,
    stores: rows.map(({ logoKey, _count, products, ...store }) => ({
      ...store,
      logoUrl: mediaUrl("logo", logoKey),
      productCount: _count.products,
      previewImages: products
        .map((p) => mediaUrl("media", p.media[0]?.key ?? null))
        .filter((url): url is string => url !== null),
    })),
  };
}

// ---------------------------------------------------------------------------
// Store shell — branding + category tree (no products)
// ---------------------------------------------------------------------------

/**
 * Everything the storefront chrome needs on every page: branding, theme and
 * the category tree for the header dropdown. Small and cacheable — products
 * are fetched per page.
 *
 * Categories with nothing shoppable are omitted, so the dropdown never offers
 * a dead end.
 */
export interface PublicCategoryNode {
  id: string;
  name: string;
  slug: string;
  isFeatured: boolean;
  /** Visible products in this shelf and everything beneath it. */
  productCount: number;
  subcategories: PublicCategoryNode[];
}

export async function getPublicStoreShell(slug: string, viewerId?: string) {
  const store = await getVisibleStore(slug, viewerId);

  const idx = shelfIndex(await loadShelves(store.id));

  // One grouped count instead of N queries.
  const grouped = await prisma.storeProduct.groupBy({
    by: ["categoryId"],
    where: visibleProductWhere(store.id),
    _count: { _all: true },
  });
  const countOf = new Map(grouped.map((g) => [g.categoryId, g._count._all]));

  // Any depth. A shelf counts its whole subtree, and branches with nothing
  // shoppable are pruned so the menu never offers a dead end.
  const build = (parentId: string | null): PublicCategoryNode[] =>
    idx
      .childrenOf(parentId)
      .filter((shelf) => shelf.isActive)
      .map((shelf) => {
        const subcategories = build(shelf.id);
        return {
          id: shelf.id,
          name: shelf.name,
          slug: shelf.slug,
          isFeatured: shelf.isFeatured,
          productCount:
            (countOf.get(shelf.id) ?? 0) +
            subcategories.reduce((sum, sub) => sum + sub.productCount, 0),
          subcategories,
        };
      })
      .filter((shelf) => shelf.productCount > 0);
  const tree = build(null);

  // Clients get a derived logo URL, never the storage key. The footer and
  // payments JSON are resolved to their complete shapes so the storefront
  // renders them directly.
  const { logoKey, footer, payments, shipping, checkout, ...shell } = store;
  // The MODE and the store's default RATE are public (the product page and
  // cart advertise them). The default delivery-area rule (which can be
  // thousands of pincodes) never ships with the shell — customers ask about
  // one pincode at a time through the delivery check instead.
  const { mode, rate } = resolveShipping(shipping);
  return {
    ...shell,
    logoUrl: mediaUrl("logo", logoKey),
    footer: resolveFooter(footer),
    payments: resolvePayments(payments),
    shipping: { mode, rate },
    checkout: resolveCheckoutFields(checkout),
    categories: tree,
  };
}

// ---------------------------------------------------------------------------
// Product listing — the scalable query surface
// ---------------------------------------------------------------------------

const SORT_ORDER: Record<
  PublicProductQuery["sort"],
  Prisma.StoreProductOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }],
  alphabetical: [{ name: "asc" }],
  "price-asc": [{ priceMin: "asc" }],
  "price-desc": [{ priceMin: "desc" }],
  // No sales metrics exist yet, so both fall back to the owner's Best Seller
  // flag and then recency. Swap in real numbers when orders land.
  popular: [{ isBestSeller: "desc" }, { createdAt: "desc" }],
  bestselling: [{ isBestSeller: "desc" }, { createdAt: "desc" }],
};

/**
 * Paginated, filtered, sorted product listing — powers the category page and
 * search results. All narrowing happens in SQL.
 */
export async function listPublicProducts(
  slug: string,
  query: PublicProductQuery,
  viewerId?: string,
) {
  const store = await getVisibleStore(slug, viewerId);

  const where: Prisma.StoreProductWhereInput = visibleProductWhere(store.id);
  const and: Prisma.StoreProductWhereInput[] = [];

  if (query.category) {
    const shelves = await loadShelves(store.id);
    const idx = shelfIndex(shelves);
    const category = shelves.find((shelf) => shelf.slug === query.category);
    if (!category || !idx.visible(category.id)) {
      throw HttpError.notFound("Category not found");
    }
    // A category covers everything beneath it.
    and.push({ categoryId: { in: idx.descendantIds(category.id) } });
  }

  // Scope to one homepage merchandising section — the flag IS the section
  // (same rule as the homepage rows: strictly flag-driven, no fallback).
  if (query.section === "featured") and.push({ isFeatured: true });
  if (query.section === "newArrivals") and.push({ isNewArrival: true });
  if (query.section === "bestSellers") and.push({ isBestSeller: true });

  if (query.q) {
    and.push({ hideFromSearch: false });
    and.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  if (query.inStock) and.push({ stockTotal: { gt: 0 } });
  if (query.minPrice !== undefined)
    and.push({ priceMin: { gte: query.minPrice } });
  // Compare the "from" price so a product whose cheapest option is within
  // budget still shows, even if a dearer option exists.
  if (query.maxPrice !== undefined)
    and.push({ priceMin: { lte: query.maxPrice } });

  if (and.length > 0) where.AND = and;

  const [total, rows] = await Promise.all([
    prisma.storeProduct.count({ where }),
    prisma.storeProduct.findMany({
      where,
      select: listProductSelect,
      orderBy: SORT_ORDER[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { total, products: rows.map(shapeListProduct) };
}

// ---------------------------------------------------------------------------
// Homepage sections
// ---------------------------------------------------------------------------

/**
 * One merchandising section: the products whose flag is set, and *only* those.
 *
 * There is deliberately **no fallback**. An earlier version substituted recent
 * products when a section had nothing flagged, which meant flagging a product
 * as "New Arrival" also made it surface under "Featured Products" (that
 * section was empty, so it fell back to everything). A flag must mean exactly
 * one thing, so an unflagged section simply comes back empty and the
 * storefront omits it.
 */
async function section(storeId: string, flag: Prisma.StoreProductWhereInput) {
  const rows = await prisma.storeProduct.findMany({
    where: { ...visibleProductWhere(storeId), ...flag },
    select: listProductSelect,
    orderBy: { createdAt: "desc" },
    take: SECTION_LIMIT,
  });
  return rows.map(shapeListProduct);
}

/**
 * Homepage payload: the category row plus the three product sections. Every
 * section is strictly owner-controlled — a product appears in a section if and
 * only if that flag is set. Empty sections are omitted by the storefront.
 */
export async function getPublicStoreHome(slug: string, viewerId?: string) {
  const shell = await getPublicStoreShell(slug, viewerId);

  // The owner's ordered, per-section switches. A disabled section is never
  // queried — hiding it must not cost a database round-trip.
  const sections = resolveHomepage(shell.homepage);
  const on = (key: HomepageSectionKey) =>
    sections.find((s) => s.key === key)?.enabled ?? false;

  const [featured, newArrivals, bestSellers] = await Promise.all([
    on("featured") ? section(shell.id, { isFeatured: true }) : [],
    on("newArrivals") ? section(shell.id, { isNewArrival: true }) : [],
    on("bestSellers") ? section(shell.id, { isBestSeller: true }) : [],
  ]);

  // Categories are navigation, not merchandising: the row is headed "Shop by
  // Category", so showing every top-level category when the owner has starred
  // none is accurate rather than a claim about them. Starring some narrows it
  // to that curated set.
  const starred = shell.categories.filter((c) => c.isFeatured);

  return {
    // The ordered section list drives BOTH what renders and in what order.
    sections,
    featuredCategories: on("categories")
      ? starred.length > 0
        ? starred
        : shell.categories
      : [],
    featured,
    newArrivals,
    bestSellers,
  };
}

// ---------------------------------------------------------------------------
// Category & product detail
// ---------------------------------------------------------------------------

/** Category header + breadcrumb ancestry for the category page. */
export async function getPublicCategory(
  slug: string,
  categorySlug: string,
  viewerId?: string,
) {
  const store = await getVisibleStore(slug, viewerId);

  const shelves = await loadShelves(store.id);
  const idx = shelfIndex(shelves);
  const category = shelves.find((shelf) => shelf.slug === categorySlug);
  if (!category || !idx.visible(category.id)) {
    throw HttpError.notFound("Category not found");
  }

  const grouped = await prisma.storeProduct.groupBy({
    by: ["categoryId"],
    where: visibleProductWhere(store.id),
    _count: { _all: true },
  });
  const countOf = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  const countBelow = (id: string) =>
    idx.descendantIds(id).reduce((sum, each) => sum + (countOf.get(each) ?? 0), 0);

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    /** Root first — the breadcrumb above this category. */
    ancestors: idx
      .pathOf(category.id)
      .slice(0, -1)
      .map((shelf) => ({ name: shelf.name, slug: shelf.slug })),
    subcategories: idx
      .childrenOf(category.id)
      .filter((child) => child.isActive)
      .map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        productCount: countBelow(child.id),
      }))
      .filter((child) => child.productCount > 0),
  };
}

/**
 * Full product detail — the only place variants are sent, because this is
 * where the customer picks one (the listing shows a count instead).
 */
export async function getPublicProduct(
  slug: string,
  productSlug: string,
  viewerId?: string,
) {
  const store = await getVisibleStore(slug, viewerId);

  const product = await prisma.storeProduct.findFirst({
    where: { ...visibleProductWhere(store.id), slug: productSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      priceMin: true,
      priceMax: true,
      stockTotal: true,
      categoryId: true,
      optionTypes: true,
      specifications: true,
      deliveryRule: true,
      shippingOverride: true,
      codAvailable: true,
      category: { select: { name: true, slug: true } },
      variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          stockQuantity: true,
          optionValues: true,
          isDefault: true,
          sku: true,
          compareAtPrice: true,
          mediaId: true,
        },
      },
      media: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, key: true, altText: true },
      },
    },
  });
  if (!product) throw HttpError.notFound("Product not found");

  // Same category, excluding this product.
  const related = await prisma.storeProduct.findMany({
    where: {
      ...visibleProductWhere(store.id),
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    select: listProductSelect,
    orderBy: { createdAt: "desc" },
    take: RELATED_LIMIT,
  });

  // Only ACTIVE variants are selected, so the picker greys out values that
  // have no sellable variant.
  const optionTypes = resolveOptionTypes(product.optionTypes);
  // The implicit Default is never exposed as a variant; for a simple product
  // its MRP and SKU are the product's own.
  const fallback = product.variants.find((variant) => variant.isDefault) ?? null;
  const variants = product.variants
    .filter((variant) => !variant.isDefault)
    .map((variant) => ({
      ...variant,
      optionValues: resolveOptionValues(variant.optionValues),
    }));

  const idx = shelfIndex(await loadShelves(store.id));
  const storeShipping = resolveShipping(store.shipping);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.priceMin,
    priceMax: product.priceMax,
    /** Strike-through MRP and SKU of a simple product; option products carry them per variant. */
    compareAtPrice: fallback?.compareAtPrice ?? null,
    sku: fallback?.sku ?? null,
    stockQuantity: product.stockTotal,
    category: {
      name: product.category.name,
      slug: product.category.slug,
      /** Root first — the breadcrumb above the product's category. */
      ancestors: idx
        .pathOf(product.categoryId)
        .slice(0, -1)
        .map((shelf) => ({ name: shelf.name, slug: shelf.slug })),
    },
    /** The dimensions the picker renders, in order. Empty for a simple product. */
    optionTypes,
    /** Ordered descriptive rows; empty means "fall back to the description". */
    specifications: resolveSpecifications(product.specifications),
    /**
     * Whether this product's delivery is limited to some pincodes (its own
     * rule, else the store default). The pincodes themselves are never sent
     * — the page asks `checkPublicDelivery` about the customer's pincode.
     */
    delivery: {
      restricted: restrictsDelivery(
        effectiveDeliveryRule(
          resolveProductDeliveryRule(product.deliveryRule),
          storeShipping.deliveryRule,
        ),
      ),
    },
    /**
     * The shipping rate this product advertises — its own override, else the
     * store rate (`source` says which). Informational: the order's actual
     * charge is quoted over the whole cart by the checkout quote endpoint.
     */
    shipping: effectiveProductShipping(
      resolveProductShippingOverride(product.shippingOverride),
      storeShipping.rate,
    ),
    /** Effective COD availability: the store accepts COD AND this product allows it. */
    codAvailable: resolvePayments(store.payments).acceptCod && product.codAvailable,
    /**
     * Sellable combinations in matrix order, each with its option values.
     * Empty for a simple product — the implicit Default is never exposed.
     */
    variants: sortByOptionOrder(optionTypes, variants).map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      sku: variant.sku,
      /** The gallery item that shows this variant; null = the cover. */
      mediaId: variant.mediaId,
      stockQuantity: variant.stockQuantity,
      optionValues: variant.optionValues,
    })),
    /** Gallery, ordered: images by display order (first = cover), video last. */
    media: product.media.map((item) => ({
      id: item.id,
      type: item.type,
      url: mediaUrl("media", item.key),
      altText: item.altText,
    })),
    related: related.map(shapeListProduct),
  };
}

// ---------------------------------------------------------------------------
// Delivery check — "can these products reach this pincode?"
// ---------------------------------------------------------------------------

/**
 * Evaluate the delivery-area rule of each requested product against ONE
 * pincode — the product page asks about the product it shows (using the
 * customer's default address), the checkout asks about the whole cart
 * against the chosen address. Same `effectiveDeliveryRule` the order
 * placement enforces, so the answer here is never contradicted at checkout.
 *
 * Products that are not publicly visible are simply absent from `results`
 * (the cart's own revalidation already reports vanished lines).
 */
export async function checkPublicDelivery(
  slug: string,
  query: PublicDeliveryCheckQuery,
  viewerId?: string,
) {
  const store = await getVisibleStore(slug, viewerId);
  const storeRule = resolveShipping(store.shipping).deliveryRule;

  const products = await prisma.storeProduct.findMany({
    where: { ...visibleProductWhere(store.id), id: { in: query.productIds } },
    select: { id: true, deliveryRule: true },
  });

  return {
    pincode: query.pincode,
    results: products.map((product) => ({
      productId: product.id,
      deliverable: isDeliverable(
        effectiveDeliveryRule(
          resolveProductDeliveryRule(product.deliveryRule),
          storeRule,
        ),
        query.pincode,
      ),
    })),
  };
}
