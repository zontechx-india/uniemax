import { prisma } from "../../config/prisma.js";
import { storage } from "../../package/storage/index.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
} from "../stores/publicStore.service.js";
import {
  MAX_ADDITIONAL_IMAGES,
  renderProductFeed,
  toFeedItem,
  type FeedItem,
} from "./productFeed.js";

/**
 * The query behind `/feeds/products.xml`. What goes into an item, and why,
 * is documented in `productFeed.ts`.
 */

/** Hourly, like the sitemaps — Merchant Center fetches the file once a day. */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** A generous ceiling on one file; the platform is far below it. */
const MAX_ITEMS = 100_000;

let cache: { key: string; xml: string; expiresAt: number } | null = null;


export async function buildProductFeed(origin: string): Promise<string> {
  if (cache && cache.key === origin && cache.expiresAt > Date.now()) return cache.xml;

  const products = await prisma.storeProduct.findMany({
    where: {
      ...PUBLIC_PRODUCT_VISIBILITY,
      hideFromSearch: false,
      store: PUBLIC_STORE_VISIBILITY,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      optionTypes: true,
      shippingOverride: true,
      category: { select: { name: true } },
      globalCategory: { select: { name: true } },
      store: { select: { name: true, slug: true, shipping: true } },
      // Same order as the product page's own query.
      variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          price: true,
          compareAtPrice: true,
          stockQuantity: true,
          optionValues: true,
          isDefault: true,
        },
      },
      media: {
        where: { type: "IMAGE" },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { key: true },
        take: MAX_ADDITIONAL_IMAGES + 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_ITEMS,
  });

  const items = products
    .map((product) =>
      toFeedItem(
        {
          ...product,
          images: product.media.map((item) => storage.publicUrl("media", item.key)),
        },
        origin,
      ),
    )
    .filter((item): item is FeedItem => item !== null);

  const xml = renderProductFeed(items, origin);
  cache = { key: origin, xml, expiresAt: Date.now() + CACHE_TTL_MS };
  return xml;
}
