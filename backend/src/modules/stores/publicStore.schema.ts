import { z } from "zod";
import { boolQuery, paginationQuery } from "../../utils/zodHelpers.js";

/**
 * Query/param validation for the anonymous storefront surface
 * (`/api/v1/public/stores/...`).
 */

export const PUBLIC_SORTS = [
  "newest",
  "popular",
  "bestselling",
  "price-asc",
  "price-desc",
  "alphabetical",
] as const;

/**
 * Homepage merchandising sections a listing can be scoped to — each maps to
 * exactly one owner-controlled product flag. Powers the homepage "View all"
 * links, so viewing all of *Best Sellers* shows the best-sellers set, not the
 * whole catalog.
 */
export const PUBLIC_SECTIONS = [
  "featured",
  "newArrivals",
  "bestSellers",
] as const;

/**
 * Product listing query. Everything narrows server-side so a store with
 * thousands of products only ever ships one page over the wire.
 *
 * `category` is a category SLUG: a root category includes its subcategories'
 * products, a subcategory returns only its own.
 */
export const publicProductQuerySchema = paginationQuery.extend({
  category: z.string().trim().min(1).optional(),
  q: z.string().trim().max(120).optional(),
  section: z.enum(PUBLIC_SECTIONS).optional(),
  sort: z.enum(PUBLIC_SORTS).default("newest"),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: boolQuery.optional(),
});

/**
 * Marketplace store index (`GET /public/stores`) — newest published first.
 * Deliberately minimal: pagination only. Discovery search lives at
 * /public/search; this endpoint just feeds "New Stores" style rails.
 */
export const publicStoreListQuerySchema = paginationQuery;

export const publicCategoryParamSchema = z.object({
  slug: z.string().min(1),
  categorySlug: z.string().min(1),
});

export const publicProductParamSchema = z.object({
  slug: z.string().min(1),
  productSlug: z.string().min(1),
});

export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;
export type PublicStoreListQuery = z.infer<typeof publicStoreListQuerySchema>;

/**
 * `GET /public/stores/:slug/delivery-check?pincode=…&productIds=a,b` — one
 * pincode against up to 100 products (the cart cap). `productIds` is a
 * comma-separated list so the check stays a cacheable GET.
 */
export const publicDeliveryCheckQuerySchema = z.object({
  pincode: z.string().trim().min(3).max(10),
  productIds: z
    .string()
    .transform((raw) =>
      [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))],
    )
    .pipe(z.array(z.string().min(1)).min(1).max(100)),
});

export type PublicDeliveryCheckQuery = z.infer<
  typeof publicDeliveryCheckQuerySchema
>;
