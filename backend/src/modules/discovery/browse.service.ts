import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { mediaUrl } from "../../package/storage/index.js";
import {
  getCategoryBranch,
  getActiveCategoryNodes,
} from "../category/categoryTree.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
  saleCompareAt,
} from "../stores/publicStore.service.js";
import type { BrowseQuery } from "./discovery.schema.js";

/**
 * **Global category browsing** — `/c/{slug}`, the one surface on the platform
 * that is about a *kind of product* rather than about a shop.
 *
 * ## Why this exists
 *
 * Everything else here is addressed inside a store: a category is
 * `/store/{store}/category/{slug}`, a product is `/store/{store}/product/
 * {slug}`. That is right for shopping and useless for search. Someone
 * googling "men's jackets" is not looking for a shop they have never heard
 * of — so there has to be a page whose subject *is* men's jackets, drawing
 * from every store at once, that can rank and then hand the visitor on to
 * whichever seller actually stocks one. Without it the platform is only
 * findable by the names of its stores, which nobody searches for yet.
 *
 * ## What makes it possible
 *
 * `StoreProduct.globalCategoryId` — the optional tag placing a product on the
 * platform taxonomy independently of which shelf its seller filed it under.
 * A shelf is the seller's own merchandising ("KTM > Duke 200"); the tag is
 * what the thing *is* ("Automotive > Motorcycle Parts"). Only the second can
 * be aggregated across stores, which is why the page is built on it.
 *
 * ## Branch matching
 *
 * A product tagged on a leaf must appear under every node above it, or
 * `/c/fashion` would be empty while `/c/fashion-men-jackets` had everything.
 * So each page matches the node **and all its descendants**, resolved from
 * the in-memory taxonomy cache (`getCategoryBranch`) rather than by a
 * recursive query per view.
 *
 * Visibility is the platform-wide `discoverable` rule — published store,
 * active product and category chain, sellable, and not opted out with
 * "Hide from Search". A browse page can never show what in-store search
 * would hide.
 */

const discoverable = {
  ...PUBLIC_PRODUCT_VISIBILITY,
  hideFromSearch: false,
  store: PUBLIC_STORE_VISIBILITY,
} satisfies Prisma.StoreProductWhereInput;

/** Same card shape the homepage rails and global search already return. */
const browseProductSelect = {
  id: true,
  name: true,
  slug: true,
  priceMin: true,
  stockTotal: true,
  category: { select: { name: true } },
  store: { select: { name: true, slug: true } },
  variants: {
    where: { isActive: true },
    select: { price: true, compareAtPrice: true },
  },
  media: {
    where: { type: "IMAGE" },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { key: true, altText: true },
  },
} satisfies Prisma.StoreProductSelect;

type BrowseProductRow = Prisma.StoreProductGetPayload<{
  select: typeof browseProductSelect;
}>;

function shape(product: BrowseProductRow) {
  const cover = product.media[0] ?? null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.priceMin,
    compareAtPrice: saleCompareAt(product.priceMin, product.variants),
    stockQuantity: product.stockTotal,
    categoryName: product.category.name,
    store: product.store,
    image: cover
      ? { url: mediaUrl("media", cover.key), altText: cover.altText }
      : null,
  };
}

/** `price` sorts on the denormalised `priceMin`, which is what listings show. */
const ORDER_BY: Record<
  BrowseQuery["sort"],
  Prisma.StoreProductOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }],
  priceAsc: [{ priceMin: "asc" }, { createdAt: "desc" }],
  priceDesc: [{ priceMin: "desc" }, { createdAt: "desc" }],
};

export interface BrowseCategoryResult {
  category: {
    id: string;
    name: string;
    slug: string;
    /** Root first, self LAST — the breadcrumb the page renders. */
    path: { name: string; slug: string }[];
  };
  /** Direct children that actually have something, each with its own count. */
  children: { name: string; slug: string; productCount: number }[];
  products: ReturnType<typeof shape>[];
  total: number;
}

/**
 * One browse page. Returns `null` for an unknown or disabled slug so the
 * controller can 404 — rather than an empty page, which would be indexable
 * and worthless.
 */
export async function browseCategory(
  slug: string,
  query: BrowseQuery,
): Promise<BrowseCategoryResult | null> {
  const branch = await getCategoryBranch(slug);
  if (!branch) return null;

  const where: Prisma.StoreProductWhereInput = {
    ...discoverable,
    globalCategoryId: { in: branch.descendantIds },
  };

  const [total, rows] = await Promise.all([
    prisma.storeProduct.count({ where }),
    prisma.storeProduct.findMany({
      where,
      select: browseProductSelect,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    category: {
      id: branch.node.id,
      name: branch.node.name,
      slug: branch.node.slug,
      path: branch.node.path.map((crumb) => ({
        name: crumb.name,
        slug: crumb.slug,
      })),
    },
    children: await childCounts(branch.children),
    products: rows.map(shape),
    total,
  };
}

/**
 * Per-child counts, each over the child's own branch.
 *
 * A child with nothing in it is dropped rather than rendered as a link to an
 * empty page — the same rule the storefront's category dropdown follows, and
 * the reason a crawler following these links never lands on a dead end.
 */
async function childCounts(
  children: { id: string; name: string; slug: string }[],
): Promise<{ name: string; slug: string; productCount: number }[]> {
  if (children.length === 0) return [];

  const branches = await Promise.all(
    children.map((child) => getCategoryBranch(child.slug)),
  );

  const counted = await Promise.all(
    branches.map(async (branch, i) => {
      if (!branch) return null;
      const productCount = await prisma.storeProduct.count({
        where: {
          ...discoverable,
          globalCategoryId: { in: branch.descendantIds },
        },
      });
      const child = children[i]!;
      return productCount > 0
        ? { name: child.name, slug: child.slug, productCount }
        : null;
    }),
  );

  return counted.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

// ---------------------------------------------------------------------------
// The browsable set
// ---------------------------------------------------------------------------

const ROOTS_CACHE_TTL_MS = 5 * 60 * 1000;
let rootsCache: { data: BrowsableCategory[]; expiresAt: number } | null = null;

export interface BrowsableCategory {
  name: string;
  slug: string;
  productCount: number;
}

/**
 * Every taxonomy node that has at least one discoverable product at or below
 * it — the browsable set.
 *
 * Two callers, one answer: the marketplace homepage's category chips (which
 * must link to a page with something on it) and the sitemap (which must not
 * submit an empty URL to Google). Computing it takes one grouped query over
 * tagged products plus an in-memory roll-up through the cached taxonomy, so
 * it is one round trip regardless of how many nodes the taxonomy has.
 */
export async function listBrowsableCategories(): Promise<BrowsableCategory[]> {
  const now = Date.now();
  if (rootsCache && rootsCache.expiresAt > now) return rootsCache.data;

  const [grouped, nodes] = await Promise.all([
    prisma.storeProduct.groupBy({
      by: ["globalCategoryId"],
      where: { ...discoverable, globalCategoryId: { not: null } },
      _count: { _all: true },
    }),
    getActiveCategoryNodes(),
  ]);

  // Direct counts, then rolled UP the tree: a product tagged on a leaf counts
  // towards every ancestor's page, because every ancestor's page shows it.
  const direct = new Map(
    grouped.map((row) => [row.globalCategoryId!, row._count._all]),
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const totals = new Map<string, number>();

  for (const [categoryId, count] of direct) {
    let cursor = byId.get(categoryId);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      totals.set(cursor.id, (totals.get(cursor.id) ?? 0) + count);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }

  const data = nodes
    .filter((node) => (totals.get(node.id) ?? 0) > 0)
    .map((node) => ({
      name: node.name,
      slug: node.slug,
      productCount: totals.get(node.id)!,
    }))
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));

  rootsCache = { data, expiresAt: now + ROOTS_CACHE_TTL_MS };
  return data;
}
