import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
import { notify } from "../notifications/notifications.service.js";
import { resolveOptionTypes, resolveSpecifications } from "../stores/storeCatalog.schema.js";
import { resolveProductDeliveryRule } from "../stores/deliveryRules.js";
import type { ProductListQuery, ProductVisibilityInput } from "./admin.schema.js";

/**
 * Catalog across every store — inventory oversight and content moderation.
 *
 * The admin does not edit a seller's product (name, price and stock are the
 * seller's business); the single write here is the **visibility switch**, the
 * moderation lever for a listing that breaks the rules. It reuses the very
 * same `isActive` flag the seller toggles, so there is one visibility
 * condition in the system rather than two that can contradict each other.
 */

/** Matches the dashboard's low-stock watch list. */
const LOW_STOCK_THRESHOLD = 5;

const listSelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  priceMin: true,
  priceMax: true,
  stockTotal: true,
  isFeatured: true,
  isBestSeller: true,
  isNewArrival: true,
  createdAt: true,
  store: { select: { id: true, name: true, slug: true, isPublished: true } },
  category: { select: { id: true, name: true } },
  media: {
    where: { type: "IMAGE" as const },
    orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: { key: true },
  },
  _count: { select: { variants: true } },
} satisfies Prisma.StoreProductSelect;

type ProductRow = Prisma.StoreProductGetPayload<{ select: typeof listSelect }>;

function shapeProduct({ media, _count, ...product }: ProductRow) {
  return {
    ...product,
    imageUrl: mediaUrl("media", media[0]?.key ?? null),
    variantCount: _count.variants,
  };
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.StoreProductWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { store: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  if (query.storeId) where.storeId = query.storeId;
  if (query.status === "ACTIVE") where.isActive = true;
  if (query.status === "DISABLED") where.isActive = false;
  if (query.status === "OUT_OF_STOCK") where.stockTotal = { lte: 0 };
  if (query.status === "LOW_STOCK") {
    where.stockTotal = { gt: 0, lte: LOW_STOCK_THRESHOLD };
  }

  const [total, rows] = await Promise.all([
    prisma.storeProduct.count({ where }),
    prisma.storeProduct.findMany({
      where,
      // Low stock first when that's what was asked for; newest otherwise.
      orderBy:
        query.status === "LOW_STOCK" || query.status === "OUT_OF_STOCK"
          ? { stockTotal: "asc" }
          : { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
  ]);

  return {
    rows: rows.map(shapeProduct),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/**
 * The full listing, read-only. Everything the seller configured is surfaced
 * — options, specifications, delivery override, merchandising flags — so a
 * moderator can judge a report against what the shopper actually sees
 * without opening the storefront.
 */
export async function getProduct(productId: string) {
  const product = await prisma.storeProduct.findUnique({
    where: { id: productId },
    select: {
      ...listSelect,
      description: true,
      hideFromSearch: true,
      optionTypes: true,
      specifications: true,
      deliveryRule: true,
      updatedAt: true,
      store: {
        select: { id: true, name: true, slug: true, isPublished: true, ownerId: true },
      },
      variants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          stockQuantity: true,
          isActive: true,
          isDefault: true,
          optionValues: true,
        },
      },
      media: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, key: true, altText: true },
      },
    },
  });
  if (!product) throw HttpError.notFound("Product not found");

  const { media, _count, optionTypes, specifications, deliveryRule, ...rest } = product;
  return {
    ...rest,
    variantCount: _count.variants,
    optionTypes: resolveOptionTypes(optionTypes),
    specifications: resolveSpecifications(specifications),
    // Null = no override; the product follows the store's default rule.
    deliveryRule: resolveProductDeliveryRule(deliveryRule),
    media: media.map(({ key, type, ...item }) => ({
      ...item,
      type,
      url: mediaUrl("media", key),
    })),
  };
}

/**
 * Moderation switch. Hiding someone's listing without telling them turns into
 * a support ticket, so the seller is always notified — with the reason when
 * one was given.
 */
export async function setVisibility(
  productId: string,
  input: ProductVisibilityInput,
) {
  const product = await prisma.storeProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      isActive: true,
      store: { select: { id: true, name: true, ownerId: true } },
    },
  });
  if (!product) throw HttpError.notFound("Product not found");
  if (product.isActive === input.isActive) {
    throw HttpError.conflict(
      input.isActive ? "This product is already visible" : "This product is already hidden",
    );
  }

  await prisma.storeProduct.update({
    where: { id: productId },
    data: { isActive: input.isActive },
  });

  notify({
    principalType: "CUSTOMER",
    principalId: product.store.ownerId,
    kind: "STORE",
    title: input.isActive ? "Product restored" : "Product hidden by UnieMax",
    body: input.isActive
      ? `"${product.name}" is visible on your storefront again.`
      : `"${product.name}" was hidden from your storefront. ${input.reason ?? "Contact support for details."}`,
    url: `/stores/${product.store.id}/products`,
  });

  return getProduct(productId);
}
