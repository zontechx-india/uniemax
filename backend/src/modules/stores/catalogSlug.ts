import { prisma } from "../../config/prisma.js";
import { slugify } from "../../utils/slug.js";

/**
 * Slug + aggregate maintenance for the store catalog.
 *
 * Categories and products are addressed by slug on the storefront
 * (`/store/{storeSlug}/category/{slug}`), so each slug must be unique **within
 * its store** and stable across renames — the same contract `Store.slug`
 * already has.
 */

/** Anything Prisma-client-shaped: the singleton or a transaction client. */
type Db = Pick<typeof prisma, "storeCategory" | "storeProduct" | "storeProductVariant">;

/**
 * A store-unique slug, appending -2, -3, … on collision. `ignoreId` lets a row
 * keep its own slug when a rename re-checks.
 */
async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "item";
  let candidate = root;
  let n = 1;
  for (;;) {
    if (!(await exists(candidate))) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function uniqueCategorySlug(
  storeId: string,
  name: string,
  db: Db = prisma,
  ignoreId?: string,
): Promise<string> {
  return uniqueSlug(name, async (slug) => {
    const row = await db.storeCategory.findFirst({
      where: { storeId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  });
}

export async function uniqueProductSlug(
  storeId: string,
  name: string,
  db: Db = prisma,
  ignoreId?: string,
): Promise<string> {
  return uniqueSlug(name, async (slug) => {
    const row = await db.storeProduct.findFirst({
      where: { storeId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  });
}

/**
 * Recompute a product's denormalised price/stock columns from its **sellable**
 * variants (active only) — the same set the storefront can actually buy.
 *
 * These columns exist so the public listing can sort and filter by price
 * directly in SQL; without them every product would have to be loaded into
 * memory to find its cheapest variant, which defeats pagination entirely.
 *
 * A product with no active variants gets `priceMin = null`, which is precisely
 * the condition the storefront treats as "nothing to sell — hide it".
 *
 * Pass the transaction client when calling from inside `$transaction` so the
 * aggregates commit atomically with the variant change that caused them.
 */
export async function recomputeProductAggregates(
  productId: string,
  db: Db = prisma,
): Promise<void> {
  const variants = await db.storeProductVariant.findMany({
    where: { productId, isActive: true },
    select: { price: true, stockQuantity: true },
  });

  if (variants.length === 0) {
    await db.storeProduct.update({
      where: { id: productId },
      data: { priceMin: null, priceMax: null, stockTotal: 0 },
    });
    return;
  }

  const prices = variants.map((variant) => Number(variant.price));
  await db.storeProduct.update({
    where: { id: productId },
    data: {
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      stockTotal: variants.reduce((sum, v) => sum + v.stockQuantity, 0),
    },
  });
}
