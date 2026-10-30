import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import {
  marketProductSelect,
  shapeMarketProduct,
} from "../discovery/discovery.service.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
} from "../stores/publicStore.service.js";

/**
 * The customer's wishlist ("Saved") — products they hearted, newest first.
 *
 * Visibility is the **store page's** rule (`PUBLIC_PRODUCT_VISIBILITY` on a
 * published store), not discovery's: "Hide from Search" keeps a product out
 * of search, but a shopper who saved it from the store page may still see it
 * here. A product that stops being visible (hidden, store unpublished) keeps
 * its row and simply drops out of the list until it is visible again.
 */

/** Generous: a wishlist is a shortlist, and the cap stops a runaway client. */
const WISHLIST_MAX = 500;

const visibleProduct = {
  ...PUBLIC_PRODUCT_VISIBILITY,
  store: PUBLIC_STORE_VISIBILITY,
} satisfies Prisma.StoreProductWhereInput;

/** Saved products as marketplace cards, plus when each was saved. */
export async function listWishlist(customerId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId, product: visibleProduct },
    orderBy: { createdAt: "desc" },
    take: WISHLIST_MAX,
    select: { createdAt: true, product: { select: marketProductSelect } },
  });
  return rows.map((row) => ({
    ...shapeMarketProduct(row.product),
    savedAt: row.createdAt,
  }));
}

/**
 * Every saved product id — what the hearts on product cards read. Includes
 * products that are currently hidden, so a heart never flips off on its own.
 */
export async function listWishlistIds(customerId: string): Promise<string[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return rows.map((row) => row.productId);
}

/**
 * Save a product. Idempotent — saving twice is one row. Only a product the
 * shopper could see can be saved (404 otherwise, never a hint that it exists).
 */
export async function addToWishlist(customerId: string, productId: string) {
  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, ...visibleProduct },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound("Product not found");

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId, productId } },
    select: { id: true },
  });
  if (existing) return { productId, saved: true };

  const count = await prisma.wishlistItem.count({ where: { customerId } });
  if (count >= WISHLIST_MAX) {
    throw HttpError.conflict(
      `Your Saved list is full (${WISHLIST_MAX} products). Remove a few to save more.`,
    );
  }

  // `upsert`, not `create`: two taps racing past the check above still end
  // as one row instead of a unique-constraint error.
  await prisma.wishlistItem.upsert({
    where: { customerId_productId: { customerId, productId } },
    create: { customerId, productId },
    update: {},
  });
  return { productId, saved: true };
}

/** Un-save a product. Idempotent — removing what is not there is fine. */
export async function removeFromWishlist(customerId: string, productId: string) {
  await prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
  return { productId, saved: false };
}
