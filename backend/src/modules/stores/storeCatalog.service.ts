import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import {
  mediaUrl,
  newObjectKey,
  storage,
} from "../../package/storage/index.js";
import type { UploadedFile } from "../../package/storage/index.js";
import { getMyStore } from "./stores.service.js";
import {
  recomputeProductAggregates,
  uniqueCategorySlug,
  uniqueProductSlug,
} from "./catalogSlug.js";
import {
  resolveOptionTypes,
  resolveOptionValues,
  resolveSpecifications,
} from "./storeCatalog.schema.js";
import { resolveProductDeliveryRule } from "./deliveryRules.js";
import { resolveProductShippingOverride } from "./shippingRates.js";
import type {
  StoreCategoryCreateInput,
  StoreCategoryUpdateInput,
  StoreMediaOrderInput,
  StoreMediaUpdateInput,
  StoreProductCreateInput,
  StoreProductOptionsInput,
  StoreProductUpdateInput,
  StoreVariantUpdateInput,
} from "./storeCatalog.schema.js";
import {
  deriveProductOptions,
  sortByOptionOrder,
  variantLabel,
} from "./productOptions.js";

/**
 * Catalog of a customer-owned store, following the hierarchy
 * Store → Category → Subcategory (optional) → Product → Variants.
 * Every call resolves the store through `getMyStore` first, so ownership is
 * enforced identically to the store routes (foreign store → 404). Products
 * require a category (root or subcategory) of the same store — "category
 * first, then products" is a hard rule here, not just UI. Category nesting
 * is one level deep: a subcategory can never be a parent.
 */

/** Name of the implicit variant a product without options sells through. */
export const DEFAULT_VARIANT_NAME = "Default";

/** Media limits per product (service-enforced, mirrored in the owner UI). */
export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_VIDEOS = 1;

/**
 * Videos sit far above any image displayOrder so the image ordering
 * (0..7, first = cover) never collides with the video's slot.
 */
const VIDEO_DISPLAY_ORDER = 1000;

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  isFeatured: true,
  isBestSeller: true,
  isNewArrival: true,
  hideFromSearch: true,
  optionTypes: true,
  specifications: true,
  deliveryRule: true,
  shippingOverride: true,
  codAvailable: true,
  category: { select: { id: true, name: true, slug: true, parentId: true } },
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
      createdAt: true,
    },
  },
  media: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      key: true,
      altText: true,
      displayOrder: true,
    },
  },
  createdAt: true,
} satisfies Prisma.StoreProductSelect;

type ProductRow = Prisma.StoreProductGetPayload<{ select: typeof productSelect }>;

/**
 * The variant is the unit of sale, so a product has no price column of its
 * own — everything money- or stock-related is derived from its variants:
 *
 *   - `optionTypes` — the ordered dimensions ("Size", "Colour") whose
 *                     cartesian product the variants are. Products that
 *                     predate option types get their single implicit one
 *                     synthesised here (`deriveProductOptions`), so every
 *                     consumer sees one shape.
 *   - `specifications` — ordered descriptive rows for the spec table.
 *   - `deliveryRule` — the product's own delivery-area rule, or null when
 *                     it follows the store default (never resolved to the
 *                     default here — the owner UI needs to tell the two apart).
 *   - `shippingOverride` — likewise for the shipping charge: the product's
 *                     own rate, or null when it follows `Store.shipping.rate`.
 *   - `codAvailable` — whether cash on delivery may be chosen for orders
 *                     containing this product (store COD switch permitting).
 *   - `hasVariants` — false when the product only carries its implicit
 *                     `Default` variant (no picker on the storefront).
 *   - `price`       — the cheapest variant price ("from" price in listings).
 *   - `priceMax`    — the dearest, so clients can render a range.
 *   - `stockQuantity` — total across variants.
 *   - `defaultVariant` — the implicit variant (null once real options exist);
 *                     this is what the owner UI edits for a simple product.
 *   - `variants`    — the real options only, each with its `optionValues`,
 *                     in matrix order; the default one is never listed.
 */
function shapeProduct(row: ProductRow) {
  const {
    variants: storedVariants,
    media,
    optionTypes: storedTypes,
    specifications,
    deliveryRule,
    shippingOverride,
    ...rest
  } = row;

  const { optionTypes, variants } = deriveProductOptions(
    resolveOptionTypes(storedTypes),
    storedVariants.map((variant) => ({
      ...variant,
      optionValues: resolveOptionValues(variant.optionValues),
    })),
  );

  const options = sortByOptionOrder(
    optionTypes,
    variants.filter((variant) => !variant.isDefault),
  );
  const fallback = variants.find((variant) => variant.isDefault) ?? null;
  const pricing = options.length > 0 ? options : variants;

  const prices = pricing.map((variant) => Number(variant.price));

  return {
    ...rest,
    // Object keys never leave the server — clients get derived URLs.
    // Ordered: images by displayOrder (first image = cover), video last.
    media: media.map((item) => ({
      id: item.id,
      type: item.type,
      url: mediaUrl("media", item.key),
      altText: item.altText,
      displayOrder: item.displayOrder,
    })),
    optionTypes,
    specifications: resolveSpecifications(specifications),
    deliveryRule: resolveProductDeliveryRule(deliveryRule),
    shippingOverride: resolveProductShippingOverride(shippingOverride),
    hasVariants: optionTypes.length > 0,
    price: pricing.length > 0 ? pricing[prices.indexOf(Math.min(...prices))]!.price : null,
    priceMax: pricing.length > 0 ? pricing[prices.indexOf(Math.max(...prices))]!.price : null,
    stockQuantity: variants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
    defaultVariant: fallback
      ? {
          id: fallback.id,
          price: fallback.price,
          stockQuantity: fallback.stockQuantity,
        }
      : null,
    variants: options,
  };
}

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  isActive: true,
  isFeatured: true,
  createdAt: true,
  _count: { select: { products: true, children: true } },
} satisfies Prisma.StoreCategorySelect;

function shapeCategory(row: {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  _count: { products: number; children: number };
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    productCount: row._count.products,
    subcategoryCount: row._count.children,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Categories (roots + one level of subcategories)
// ---------------------------------------------------------------------------

export async function listCategories(ownerId: string, storeRef: string) {
  const store = await getMyStore(ownerId, storeRef);
  const rows = await prisma.storeCategory.findMany({
    where: { storeId: store.id },
    select: categorySelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(shapeCategory);
}

export async function createCategory(
  ownerId: string,
  storeRef: string,
  input: StoreCategoryCreateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  // A subcategory's parent must be a ROOT category of the same store — one
  // level of nesting only.
  if (input.parentId) {
    const parent = await prisma.storeCategory.findFirst({
      where: { id: input.parentId, storeId: store.id },
      select: { id: true, parentId: true },
    });
    if (!parent) throw HttpError.badRequest("Parent category not found");
    if (parent.parentId) {
      throw HttpError.badRequest(
        "Subcategories cannot have their own subcategories",
      );
    }
  }

  const duplicate = await prisma.storeCategory.findFirst({
    where: { storeId: store.id, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    throw HttpError.conflict("A category with this name already exists");
  }

  const row = await prisma.storeCategory.create({
    data: {
      storeId: store.id,
      name: input.name,
      // Generated once, here — renames deliberately keep the original slug so
      // any link already shared to this category keeps resolving.
      slug: await uniqueCategorySlug(store.id, input.name),
      parentId: input.parentId ?? null,
    },
    select: categorySelect,
  });
  return shapeCategory(row);
}

/**
 * Partial update of a category — rename and/or enable/disable.
 *
 * `isActive` controls visibility on the public storefront (products keep their
 * own flags — a hidden category hides everything inside it, subcategories
 * included). Renaming re-checks the per-store name uniqueness rule, ignoring
 * the row being edited so saving an unchanged name is not a conflict.
 */
export async function updateCategory(
  ownerId: string,
  storeRef: string,
  categoryId: string,
  patch: StoreCategoryUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  const category = await prisma.storeCategory.findFirst({
    where: { id: categoryId, storeId: store.id },
    select: { id: true },
  });
  if (!category) throw HttpError.notFound("Category not found");

  if (patch.name !== undefined) {
    const duplicate = await prisma.storeCategory.findFirst({
      where: {
        storeId: store.id,
        name: { equals: patch.name, mode: "insensitive" },
        id: { not: categoryId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw HttpError.conflict("A category with this name already exists");
    }
  }

  const row = await prisma.storeCategory.update({
    where: { id: categoryId },
    data: {
      // `slug` is intentionally absent — it never changes after creation.
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isFeatured !== undefined ? { isFeatured: patch.isFeatured } : {}),
    },
    select: categorySelect,
  });
  return shapeCategory(row);
}

export async function deleteCategory(
  ownerId: string,
  storeRef: string,
  categoryId: string,
) {
  const store = await getMyStore(ownerId, storeRef);

  const category = await prisma.storeCategory.findFirst({
    where: { id: categoryId, storeId: store.id },
    select: { id: true, _count: { select: { products: true, children: true } } },
  });
  if (!category) throw HttpError.notFound("Category not found");
  if (category._count.products > 0) {
    throw HttpError.conflict(
      "This category still has products — move or delete them first",
    );
  }
  if (category._count.children > 0) {
    throw HttpError.conflict(
      "This category still has subcategories — delete them first",
    );
  }

  await prisma.storeCategory.delete({ where: { id: categoryId } });
  return { id: categoryId };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listProducts(ownerId: string, storeRef: string) {
  const store = await getMyStore(ownerId, storeRef);
  const rows = await prisma.storeProduct.findMany({
    where: { storeId: store.id },
    select: productSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(shapeProduct);
}

export async function createProduct(
  ownerId: string,
  storeRef: string,
  input: StoreProductCreateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  // The category (root or subcategory) must belong to this store — also
  // what makes a category a prerequisite for adding products.
  const category = await prisma.storeCategory.findFirst({
    where: { id: input.categoryId, storeId: store.id },
    select: { id: true },
  });
  if (!category) {
    throw HttpError.badRequest("Category not found in this store");
  }

  // A product always ships with at least one variant. With option types, the
  // variants are the full cartesian product the schema has already validated,
  // each NAMED by its values ("M / Red"); otherwise the implicit `Default`
  // carries the single price/stock — so there is exactly one place a price
  // lives.
  const variants = input.hasVariants
    ? input.variants!.map((variant) => ({
        name: variantLabel(input.optionTypes!, variant.optionValues),
        optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
        price: variant.price,
        stockQuantity: variant.stockQuantity,
        isActive: variant.isActive,
        isDefault: false,
      }))
    : [
        {
          name: DEFAULT_VARIANT_NAME,
          // Both guaranteed by the schema: required when hasVariants is false.
          price: input.price!,
          stockQuantity: input.stockQuantity!,
          isDefault: true,
        },
      ];

  const created = await prisma.storeProduct.create({
    data: {
      storeId: store.id,
      categoryId: input.categoryId,
      name: input.name,
      slug: await uniqueProductSlug(store.id, input.name),
      description: input.description ?? null,
      // Casts: typed object literals without an index signature don't satisfy
      // Prisma's InputJsonValue (same as the store JSON columns). Spread
      // conditionally — under exactOptionalPropertyTypes an explicit
      // `undefined` is not an accepted value for these fields.
      ...(input.hasVariants
        ? { optionTypes: input.optionTypes as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.specifications && input.specifications.length > 0
        ? {
            specifications:
              input.specifications as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.deliveryRule
        ? { deliveryRule: input.deliveryRule as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.shippingOverride
        ? {
            shippingOverride:
              input.shippingOverride as unknown as Prisma.InputJsonValue,
          }
        : {}),
      codAvailable: input.codAvailable,
      variants: { create: variants },
    },
    select: { id: true },
  });

  // Seed the denormalised price/stock columns the storefront sorts on.
  await recomputeProductAggregates(created.id);

  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id: created.id },
    select: productSelect,
  });
  return shapeProduct(row);
}

/**
 * Partial update of a product — editable details (name, description,
 * category, specification rows, delivery-area and shipping-charge
 * overrides, COD availability) plus the storefront visibility switch and
 * the merchandising flags driving the homepage sections. The slug never
 * changes on rename — it is the product's public URL identity, so shared
 * links keep working. Option types and variants are NOT here: they change
 * together through `replaceProductOptions`.
 */
export async function updateProduct(
  ownerId: string,
  storeRef: string,
  productId: string,
  patch: StoreProductUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound("Product not found");

  // A product can only move to a category (root or sub) of the same store —
  // the same rule enforced on create.
  if (patch.categoryId !== undefined) {
    const category = await prisma.storeCategory.findFirst({
      where: { id: patch.categoryId, storeId: store.id },
      select: { id: true },
    });
    if (!category) {
      throw HttpError.badRequest("Category not found in this store");
    }
  }

  // A product needs a photo before customers can see it. The photo cannot be
  // required when the product is CREATED — media uploads address a product by
  // id, so they can only follow it — which makes the moment it becomes
  // visible the place to enforce it. Disabling never needs a photo.
  if (patch.isActive === true) {
    const imageCount = await prisma.storeProductMedia.count({
      where: { productId, type: "IMAGE" },
    });
    if (imageCount === 0) {
      throw HttpError.badRequest(
        "Add at least one photo before enabling this product",
      );
    }
  }

  const data: Prisma.StoreProductUncheckedUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) {
    // An emptied-out description means "no description", not an empty string.
    data.description = patch.description || null;
  }
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.isFeatured !== undefined) data.isFeatured = patch.isFeatured;
  if (patch.isBestSeller !== undefined) data.isBestSeller = patch.isBestSeller;
  if (patch.isNewArrival !== undefined) data.isNewArrival = patch.isNewArrival;
  if (patch.hideFromSearch !== undefined)
    data.hideFromSearch = patch.hideFromSearch;
  if (patch.specifications !== undefined) {
    // `null` and `[]` both mean "no specs": clear the column rather than store
    // an empty list, so the storefront falls back to the description.
    data.specifications =
      patch.specifications === null || patch.specifications.length === 0
        ? Prisma.DbNull
        : (patch.specifications as unknown as Prisma.InputJsonValue);
  }
  if (patch.deliveryRule !== undefined) {
    // `null` = drop the override; the product follows the store default again.
    data.deliveryRule =
      patch.deliveryRule === null
        ? Prisma.DbNull
        : (patch.deliveryRule as unknown as Prisma.InputJsonValue);
  }
  if (patch.shippingOverride !== undefined) {
    // Same contract as deliveryRule: `null` = follow the store rate again.
    data.shippingOverride =
      patch.shippingOverride === null
        ? Prisma.DbNull
        : (patch.shippingOverride as unknown as Prisma.InputJsonValue);
  }
  if (patch.codAvailable !== undefined) data.codAvailable = patch.codAvailable;

  const row = await prisma.storeProduct.update({
    where: { id: productId },
    data,
    select: productSelect,
  });
  return shapeProduct(row);
}

export async function deleteProduct(
  ownerId: string,
  storeRef: string,
  productId: string,
) {
  const store = await getMyStore(ownerId, storeRef);

  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true, media: { select: { key: true } } },
  });
  if (!product) throw HttpError.notFound("Product not found");

  await prisma.storeProduct.delete({ where: { id: productId } });

  // Media rows cascade with the product; the stored objects are cleaned up
  // best-effort afterwards (an orphaned object must never fail the delete).
  for (const item of product.media) {
    await storage.remove("media", item.key).catch(() => {});
  }
  return { id: productId };
}

// ---------------------------------------------------------------------------
// Variants — every mutation returns the full parent product (with its
// variants), so clients can replace one row in place.
// ---------------------------------------------------------------------------

/** Resolves a product inside one of the owner's stores (foreign → 404). */
async function getMyProductId(
  ownerId: string,
  storeRef: string,
  productId: string,
): Promise<string> {
  const store = await getMyStore(ownerId, storeRef);
  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound("Product not found");
  return product.id;
}

/**
 * Replace a product's option types and its ENTIRE variant set in one
 * transaction. The body is the full target state — the schema has already
 * checked it is a valid, complete matrix — and the stored variants are
 * reconciled to it:
 *
 *   - rows sent with an `id` are updated in place (values, label, price,
 *     stock, on/off), so a renamed or re-priced combination keeps its variant
 *     id and every cart line and order pointing at it stays valid;
 *   - rows without an `id` are created;
 *   - stored variants not referenced are deleted — combinations the seller
 *     removed. Orders keep their snapshot (`OrderItem.variantName`, price) and
 *     `variantId` is SetNull, so history survives; a cart line pointing at one
 *     revalidates to "no longer available", which is the truth.
 *
 * `optionTypes: []` turns the product back into a simple one: every variant is
 * replaced by a single `Default` carrying the cheapest price and the summed
 * stock, and both JSON columns are cleared. This is the ONE place the
 * back-to-simple transition lives — it used to be a side effect of deleting
 * the last variant, which left the option data behind.
 *
 * Labels are unique per product (`@@unique([productId, name])`) and Postgres
 * checks that per statement, so two existing rows swapping labels ("S / Red"
 * ↔ "Red / S" after a type reorder) would collide mid-transaction. Updates
 * therefore go in two passes: park every row on a placeholder, then write the
 * real names.
 */
export async function replaceProductOptions(
  ownerId: string,
  storeRef: string,
  productId: string,
  input: StoreProductOptionsInput,
) {
  const id = await getMyProductId(ownerId, storeRef, productId);

  const existing = await prisma.storeProductVariant.findMany({
    where: { productId: id },
    select: { id: true, price: true, stockQuantity: true, isDefault: true },
  });
  const existingReal = new Set(
    existing.filter((variant) => !variant.isDefault).map((variant) => variant.id),
  );

  const referenced = input.variants.flatMap((variant) =>
    variant.id !== undefined ? [variant.id] : [],
  );
  for (const variantId of referenced) {
    if (!existingReal.has(variantId)) {
      throw HttpError.badRequest(
        `Variant "${variantId}" does not belong to this product`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (input.optionTypes.length === 0) {
      // Back to a simple product. Keep the money honest: the cheapest price
      // and all the stock carry over; 0 only when there was nothing to inherit.
      const prices = existing.map((variant) => Number(variant.price));
      await tx.storeProductVariant.deleteMany({ where: { productId: id } });
      await tx.storeProductVariant.create({
        data: {
          productId: id,
          name: DEFAULT_VARIANT_NAME,
          price: prices.length > 0 ? Math.min(...prices) : 0,
          stockQuantity: existing.reduce(
            (sum, variant) => sum + variant.stockQuantity,
            0,
          ),
          isActive: true,
          isDefault: true,
        },
      });
      await tx.storeProduct.update({
        where: { id },
        data: { optionTypes: Prisma.DbNull },
      });
    } else {
      // The implicit Default goes the moment real options exist, and so does
      // every combination the seller dropped.
      const keep = new Set(referenced);
      await tx.storeProductVariant.deleteMany({
        where:
          keep.size > 0
            ? {
                productId: id,
                OR: [{ isDefault: true }, { id: { notIn: [...keep] } }],
              }
            : { productId: id },
      });

      const updates = input.variants.filter((variant) => variant.id !== undefined);
      // Pass 1 — park on placeholders so label swaps cannot collide.
      for (const variant of updates) {
        await tx.storeProductVariant.update({
          where: { id: variant.id! },
          data: { name: `~${variant.id}` },
        });
      }
      // Pass 2 — the real state.
      for (const variant of updates) {
        await tx.storeProductVariant.update({
          where: { id: variant.id! },
          data: {
            name: variantLabel(input.optionTypes, variant.optionValues),
            optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
            price: variant.price,
            stockQuantity: variant.stockQuantity,
            isActive: variant.isActive,
          },
        });
      }

      const creations = input.variants.filter((variant) => variant.id === undefined);
      if (creations.length > 0) {
        await tx.storeProductVariant.createMany({
          data: creations.map((variant) => ({
            productId: id,
            name: variantLabel(input.optionTypes, variant.optionValues),
            optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
            price: variant.price,
            stockQuantity: variant.stockQuantity,
            isActive: variant.isActive,
            isDefault: false,
          })),
        });
      }

      await tx.storeProduct.update({
        where: { id },
        data: {
          optionTypes: input.optionTypes as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Inside the transaction so the aggregates can never disagree with the
    // variant set that was just written.
    await recomputeProductAggregates(id, tx);
  });

  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id },
    select: productSelect,
  });
  return shapeProduct(row);
}

export async function updateVariant(
  ownerId: string,
  storeRef: string,
  productId: string,
  variantId: string,
  patch: StoreVariantUpdateInput,
) {
  const id = await getMyProductId(ownerId, storeRef, productId);

  const variant = await prisma.storeProductVariant.findFirst({
    where: { id: variantId, productId: id },
    select: { id: true },
  });
  if (!variant) throw HttpError.notFound("Variant not found");

  // `name` is derived from the option values and is not patchable here;
  // changing what a variant IS goes through `replaceProductOptions`.
  const data: Prisma.StoreProductVariantUncheckedUpdateInput = {};
  if (patch.price !== undefined) data.price = patch.price;
  if (patch.stockQuantity !== undefined) data.stockQuantity = patch.stockQuantity;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  await prisma.storeProductVariant.update({ where: { id: variantId }, data });
  // Price / stock / isActive all move the aggregates.
  await recomputeProductAggregates(id);
  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id },
    select: productSelect,
  });
  return shapeProduct(row);
}

// ---------------------------------------------------------------------------
// Product media — up to 8 images + 1 video per product. The image with the
// lowest displayOrder IS the cover (no separate flag to fall out of sync).
// Objects live in the "media" bucket; rows store only the object key. Every
// mutation returns the full parent product, like the variant endpoints.
// ---------------------------------------------------------------------------

/** Resolves product + store ids inside one of the owner's stores (404 otherwise). */
async function getMyProductRef(
  ownerId: string,
  storeRef: string,
  productId: string,
): Promise<{ productId: string; storeId: string }> {
  const store = await getMyStore(ownerId, storeRef);
  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound("Product not found");
  return { productId: product.id, storeId: store.id };
}

async function productWithMedia(productId: string) {
  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id: productId },
    select: productSelect,
  });
  return shapeProduct(row);
}

/**
 * Attach a new image or video (the file's own content type decides which —
 * `readUpload` already validated it against the matching size/type rule).
 * New images append after the existing ones; the video sits outside the
 * image ordering entirely.
 */
export async function addProductMedia(
  ownerId: string,
  storeRef: string,
  productRef: string,
  file: UploadedFile,
) {
  const { productId, storeId } = await getMyProductRef(
    ownerId,
    storeRef,
    productRef,
  );

  const existing = await prisma.storeProductMedia.findMany({
    where: { productId },
    select: { type: true, displayOrder: true },
  });
  const images = existing.filter((m) => m.type === "IMAGE");
  const videos = existing.filter((m) => m.type === "VIDEO");

  const isVideo = file.kind === "video";
  if (isVideo && videos.length >= MAX_PRODUCT_VIDEOS) {
    throw HttpError.conflict(
      "This product already has a video — replace or delete it first",
    );
  }
  if (!isVideo && images.length >= MAX_PRODUCT_IMAGES) {
    throw HttpError.conflict(
      `A product can have at most ${MAX_PRODUCT_IMAGES} images`,
    );
  }

  const key = newObjectKey(
    `products/${storeId}/${productId}`,
    file.contentType,
  );
  await storage.put("media", key, file.buffer, file.contentType);

  await prisma.storeProductMedia.create({
    data: {
      productId,
      type: isVideo ? "VIDEO" : "IMAGE",
      key,
      displayOrder: isVideo
        ? VIDEO_DISPLAY_ORDER
        : images.reduce((max, m) => Math.max(max, m.displayOrder), -1) + 1,
    },
  });

  return productWithMedia(productId);
}

/**
 * Swap a media item's file (replace) while keeping its position and alt
 * text. Image rows only accept images, video rows only videos. A fresh key
 * is minted (objects are immutable → cacheable forever); the old object is
 * removed best-effort after the row points at the new one.
 */
export async function replaceProductMediaFile(
  ownerId: string,
  storeRef: string,
  productRef: string,
  mediaId: string,
  file: UploadedFile,
) {
  const { productId, storeId } = await getMyProductRef(
    ownerId,
    storeRef,
    productRef,
  );

  const media = await prisma.storeProductMedia.findFirst({
    where: { id: mediaId, productId },
    select: { id: true, type: true, key: true },
  });
  if (!media) throw HttpError.notFound("Media not found");

  const incoming = file.kind === "video" ? "VIDEO" : "IMAGE";
  if (incoming !== media.type) {
    throw HttpError.badRequest(
      media.type === "IMAGE"
        ? "This slot holds an image — upload an image file to replace it"
        : "This slot holds a video — upload a video file to replace it",
    );
  }

  const key = newObjectKey(
    `products/${storeId}/${productId}`,
    file.contentType,
  );
  await storage.put("media", key, file.buffer, file.contentType);
  await prisma.storeProductMedia.update({
    where: { id: media.id },
    data: { key },
  });
  await storage.remove("media", media.key).catch(() => {});

  return productWithMedia(productId);
}

/** Update media metadata — alt text (accessibility). `null` clears it. */
export async function updateProductMedia(
  ownerId: string,
  storeRef: string,
  productRef: string,
  mediaId: string,
  patch: StoreMediaUpdateInput,
) {
  const { productId } = await getMyProductRef(ownerId, storeRef, productRef);

  const media = await prisma.storeProductMedia.findFirst({
    where: { id: mediaId, productId },
    select: { id: true },
  });
  if (!media) throw HttpError.notFound("Media not found");

  await prisma.storeProductMedia.update({
    where: { id: media.id },
    data: { altText: patch.altText || null },
  });

  return productWithMedia(productId);
}

/**
 * Reorder the product's images. `mediaIds` must be the complete list of the
 * product's IMAGE ids in the desired order — the first becomes the cover.
 * The video (if any) is untouched.
 */
export async function reorderProductMedia(
  ownerId: string,
  storeRef: string,
  productRef: string,
  input: StoreMediaOrderInput,
) {
  const { productId } = await getMyProductRef(ownerId, storeRef, productRef);

  const images = await prisma.storeProductMedia.findMany({
    where: { productId, type: "IMAGE" },
    select: { id: true },
  });
  const currentIds = new Set(images.map((m) => m.id));
  const nextIds = new Set(input.mediaIds);
  if (
    currentIds.size !== nextIds.size ||
    [...currentIds].some((id) => !nextIds.has(id))
  ) {
    throw HttpError.badRequest(
      "mediaIds must contain exactly the product's image ids",
    );
  }

  await prisma.$transaction(
    input.mediaIds.map((id, index) =>
      prisma.storeProductMedia.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );

  return productWithMedia(productId);
}

export async function deleteProductMedia(
  ownerId: string,
  storeRef: string,
  productRef: string,
  mediaId: string,
) {
  const { productId } = await getMyProductRef(ownerId, storeRef, productRef);

  const media = await prisma.storeProductMedia.findFirst({
    where: { id: mediaId, productId },
    select: { id: true, key: true },
  });
  if (!media) throw HttpError.notFound("Media not found");

  await prisma.storeProductMedia.delete({ where: { id: media.id } });
  await storage.remove("media", media.key).catch(() => {});

  return productWithMedia(productId);
}
