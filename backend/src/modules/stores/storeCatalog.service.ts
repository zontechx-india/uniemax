import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { getCategoryPath } from "../category/categoryTree.js";
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
  GroupCandidatesQuery,
  StoreCategoryCreateInput,
  StoreCategoryUpdateInput,
  StoreMediaOrderInput,
  StoreMediaUpdateInput,
  StoreProductCopyInput,
  StoreProductCreateInput,
  StoreProductGroupsInput,
  StoreProductOptionsInput,
  StoreProductUpdateInput,
  StoreVariantUpdateInput,
} from "./storeCatalog.schema.js";
import {
  OPTION_LIMITS,
  sortByOptionOrder,
  variantLabel,
} from "./productOptions.js";

/**
 * Catalog of a customer-owned store: Store → Categories (a tree mirroring
 * the global taxonomy, any depth) → Product → Variants.
 * Every call resolves the store through `getMyStore` first, so ownership is
 * enforced identically to the store routes (foreign store → 404). Products
 * require a category of the same store — "category first, then products"
 * is a hard rule here, not just UI.
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
  publishedAt: true,
  category: { select: { id: true, name: true, slug: true, parentId: true } },
  globalCategoryId: true,
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
      sku: true,
      compareAtPrice: true,
      mediaId: true,
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
  // The families this product is in, each with every member — the owner UI
  // shows the same list from whichever member's wizard is open.
  groupMemberships: {
    orderBy: { group: { createdAt: "asc" } },
    select: {
      value: true,
      position: true,
      group: {
        select: {
          id: true,
          optionName: true,
          members: {
            orderBy: { position: "asc" },
            select: {
              productId: true,
              value: true,
              position: true,
              product: {
                select: {
                  name: true,
                  slug: true,
                  priceMin: true,
                  publishedAt: true,
                  media: {
                    where: { type: "IMAGE" },
                    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
                    take: 1,
                    select: { key: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  createdAt: true,
} satisfies Prisma.StoreProductSelect;

type ProductRow = Prisma.StoreProductGetPayload<{ select: typeof productSelect }>;

/** One family as the owner UI sees it: the axis, this product's value, everyone in it. */
function shapeGroup(membership: ProductRow["groupMemberships"][number]) {
  return {
    id: membership.group.id,
    optionName: membership.group.optionName,
    value: membership.value,
    members: membership.group.members.map((member) => ({
      productId: member.productId,
      name: member.product.name,
      slug: member.product.slug,
      imageUrl: member.product.media[0]
        ? mediaUrl("media", member.product.media[0].key)
        : null,
      price: member.product.priceMin,
      isDraft: member.product.publishedAt === null,
      value: member.value,
      position: member.position,
    })),
  };
}

/**
 * The variant is the unit of sale, so a product has no price column of its
 * own — everything money- or stock-related is derived from its variants:
 *
 *   - `optionTypes` — the ordered dimensions ("Size", "Colour") whose
 *                     cartesian product the variants are.
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
/**
 * Decorates shaped products with their resolved taxonomy path. Separate from
 * shapeProduct because resolving a path is async (it reads the cached
 * taxonomy); shapeProduct itself stays a pure transform.
 */
async function withProductTaxonomy<T extends { globalCategoryId: string | null }>(
  rows: T[],
) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      globalCategory: row.globalCategoryId
        ? await taxonomyRef(row.globalCategoryId)
        : null,
    })),
  );
}

/**
 * How finished a product is, for the seller's list — the four things a
 * customer notices, weighted by how much each one sells. `missing` names
 * what to do next; photo and price are also what publishing requires.
 */
function completeness(input: {
  hasPhoto: boolean;
  hasPrice: boolean;
  description: string | null;
  specs: number;
}) {
  const checks = [
    { key: "photo" as const, weight: 35, done: input.hasPhoto },
    { key: "price" as const, weight: 35, done: input.hasPrice },
    { key: "description" as const, weight: 20, done: !!input.description?.trim() },
    { key: "specifications" as const, weight: 10, done: input.specs > 0 },
  ];
  return {
    percent: checks.reduce((sum, check) => sum + (check.done ? check.weight : 0), 0),
    missing: checks.filter((check) => !check.done).map((check) => check.key),
  };
}

function shapeProduct(row: ProductRow) {  const {
    variants: storedVariants,
    media,
    optionTypes: storedTypes,
    specifications,
    deliveryRule,
    shippingOverride,
    groupMemberships,
    ...rest
  } = row;

  const optionTypes = resolveOptionTypes(storedTypes);
  const variants = storedVariants.map((variant) => ({
    ...variant,
    optionValues: resolveOptionValues(variant.optionValues),
  }));

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
    /** The families this product belongs to ("Colour": Maroon / Blue / Tan). */
    groups: groupMemberships.map(shapeGroup),
    /** Never published yet — created step by step and not finished. */
    isDraft: rest.publishedAt === null,
    completeness: completeness({
      hasPhoto: media.some((item) => item.type === "IMAGE"),
      hasPrice: pricing.some((variant) => variant.isActive && Number(variant.price) > 0),
      description: rest.description,
      specs: resolveSpecifications(specifications).length,
    }),
    price: pricing.length > 0 ? pricing[prices.indexOf(Math.min(...prices))]!.price : null,
    priceMax: pricing.length > 0 ? pricing[prices.indexOf(Math.max(...prices))]!.price : null,
    stockQuantity: variants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
    defaultVariant: fallback
      ? {
          id: fallback.id,
          price: fallback.price,
          stockQuantity: fallback.stockQuantity,
          sku: fallback.sku,
          compareAtPrice: fallback.compareAtPrice,
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
  sortOrder: true,
  imageUrl: true,
  categoryId: true,
  createdAt: true,
  _count: { select: { products: true, children: true } },
} satisfies Prisma.StoreCategorySelect;

type CategoryRow = Prisma.StoreCategoryGetPayload<{
  select: typeof categorySelect;
}>;

function shapeCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    imageUrl: row.imageUrl,
    /** The platform category this shelf is; null only for shelves typed before the taxonomy. */
    categoryId: row.categoryId,
    productCount: row._count.products,
    subcategoryCount: row._count.children,
    createdAt: row.createdAt,
  };
}

/**
 * Resolves a taxonomy id to its node + ancestor path so the client can render
 * "Automotive > Motorcycle Parts" without fetching the whole tree first. This
 * reads the cached taxonomy, so decorating a full catalog costs no extra
 * queries.
 */
async function withTaxonomy<T extends { categoryId: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      taxonomy: row.categoryId ? await taxonomyRef(row.categoryId) : null,
    })),
  );
}

async function taxonomyRef(id: string) {
  // activeOnly: false — a shelf tagged before an admin disabled that node must
  // still show what it points at, rather than silently reading as untagged.
  const node = await getCategoryPath(id, false);
  return node
    ? {
        id: node.id,
        name: node.name,
        slug: node.slug,
        pathLabel: node.pathLabel,
        // What the product form suggests for things filed here.
        optionTemplates: node.optionTemplates,
        specTemplates: node.specTemplates,
      }
    : null;
}

// ---------------------------------------------------------------------------
// Categories (a tree mirroring the global taxonomy)
// ---------------------------------------------------------------------------

export async function listCategories(ownerId: string, storeRef: string) {
  const store = await getMyStore(ownerId, storeRef);
  const rows = await prisma.storeCategory.findMany({
    where: { storeId: store.id },
    // Seller-set order first; ties keep the historical creation order, so a
    // catalog nobody has reordered looks exactly as it did before.
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: categorySelect,
  });
  return withTaxonomy(rows.map(shapeCategory));
}

/**
 * Find or create the shelf standing for one taxonomy node.
 *
 * A shelf already tagged with the node is reused outright. Failing that, an
 * UNTAGGED shelf of the same name in the same position is adopted rather than
 * duplicated — that is how an "Electronics" a seller typed before the taxonomy
 * existed becomes the classified one instead of gaining a confusing twin.
 */
async function ensureShelf(
  storeId: string,
  node: { id: string; name: string },
  parentId: string | null,
  extras: { imageUrl?: string | null | undefined; sortOrder?: number | undefined },
): Promise<string> {
  const tagged = await prisma.storeCategory.findFirst({
    where: { storeId, categoryId: node.id },
    select: { id: true },
  });
  if (tagged) return tagged.id;

  const adoptable = await prisma.storeCategory.findFirst({
    where: {
      storeId,
      parentId,
      categoryId: null,
      name: { equals: node.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (adoptable) {
    await prisma.storeCategory.update({
      where: { id: adoptable.id },
      data: { categoryId: node.id },
    });
    return adoptable.id;
  }

  // Names are unique among siblings; a typed shelf already holding this one
  // in the same place has no sane automatic answer.
  const clash = await prisma.storeCategory.findFirst({
    where: { storeId, parentId, name: { equals: node.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) {
    throw HttpError.conflict(
      `You already have a category called "${node.name}".`,
    );
  }

  const row = await prisma.storeCategory.create({
    data: {
      storeId,
      name: node.name,
      // Generated once, here — the slug deliberately never changes again, so
      // any link already shared to this category keeps resolving.
      slug: await uniqueCategorySlug(storeId, node.name),
      parentId,
      categoryId: node.id,
      imageUrl: extras.imageUrl ?? null,
      sortOrder: extras.sortOrder ?? 0,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Add a shelf by CHOOSING a node from the global taxonomy.
 *
 * The seller supplies an id, never a name: the shelf is named after the node
 * and placed where the node sits, so picking "Electronics › Mobiles" yields
 * the whole chain in one go and every shelf created here is classified by
 * construction. Sellers cannot invent categories; that is the whole point.
 */
export async function createCategory(
  ownerId: string,
  storeRef: string,
  input: StoreCategoryCreateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  // activeOnly — a seller must not be able to file their catalog under a
  // category an admin has retired.
  const node = await getCategoryPath(input.categoryId, true);
  if (!node) throw HttpError.badRequest("Selected category was not found");

  const already = await prisma.storeCategory.findFirst({
    where: { storeId: store.id, categoryId: node.id },
    select: { id: true },
  });
  if (already) {
    throw HttpError.conflict(
      `"${node.pathLabel}" is already in your categories.`,
    );
  }

  // Every ancestor shelf first, root downwards, so a shelf never lands without
  // the chain above it. They inherit nothing from the form: the artwork and
  // position the seller chose are meant for the shelf they actually picked.
  let parentShelfId: string | null = null;
  for (const crumb of node.path.slice(0, -1)) {
    parentShelfId = await ensureShelf(store.id, crumb, parentShelfId, {});
  }

  const id = await ensureShelf(store.id, node, parentShelfId, {
    imageUrl: input.imageUrl,
    sortOrder: input.sortOrder,
  });

  const row = await prisma.storeCategory.findUniqueOrThrow({
    where: { id },
    select: categorySelect,
  });
  const [shaped] = await withTaxonomy([shapeCategory(row)]);
  return shaped!;
}

/**
 * Partial update of a shelf — presentation and visibility only.
 *
 * `isActive` controls visibility on the public storefront (products keep their
 * own flags — a hidden category hides everything inside it, subcategories
 * included). The name and the taxonomy link are not editable here: the name is
 * the chosen category's, and re-pointing a legacy shelf at the taxonomy is an
 * admin action.
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

  const row = await prisma.storeCategory.update({
    where: { id: categoryId },
    data: {
      // `name` and `slug` are intentionally absent — neither changes again.
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isFeatured !== undefined ? { isFeatured: patch.isFeatured } : {}),
      // null clears the artwork; undefined leaves it untouched.
      ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
    select: categorySelect,
  });
  const [shaped] = await withTaxonomy([shapeCategory(row)]);
  return shaped!;
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
  return withProductTaxonomy(rows.map(shapeProduct));
}

/** SKUs are unique within a store — a packing slip must never be ambiguous. */
async function assertSkusFree(
  storeId: string,
  entries: { sku: string | null | undefined; variantId?: string | undefined }[],
) {
  const wanted = new Map<string, string>();
  for (const { sku } of entries) {
    if (!sku) continue;
    const folded = sku.toLowerCase();
    if (wanted.has(folded)) throw HttpError.badRequest(`SKU "${sku}" is used twice`);
    wanted.set(folded, sku);
  }
  if (wanted.size === 0) return;
  const own = entries.flatMap((entry) => (entry.variantId ? [entry.variantId] : []));
  const clash = await prisma.storeProductVariant.findFirst({
    where: {
      product: { storeId },
      sku: { in: [...wanted.values()], mode: "insensitive" },
      ...(own.length > 0 ? { id: { notIn: own } } : {}),
    },
    select: { sku: true, product: { select: { name: true } } },
  });
  if (clash) {
    throw HttpError.conflict(`SKU "${clash.sku}" is already used by "${clash.product.name}".`);
  }
}

/** A variant's photo must be one of its own product's images. */
async function assertOwnImages(productId: string, mediaIds: (string | null | undefined)[]) {
  const ids = [...new Set(mediaIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const owned = await prisma.storeProductMedia.count({
    where: { id: { in: ids }, productId, type: "IMAGE" },
  });
  if (owned !== ids.length) {
    throw HttpError.badRequest("Choose one of this product's own photos");
  }
}

export async function createProduct(  ownerId: string,
  storeRef: string,
  input: StoreProductCreateInput,
) {
  const store = await getMyStore(ownerId, storeRef);

  // The category (root or subcategory) must belong to this store — also
  // what makes a category a prerequisite for adding products.
  const category = await prisma.storeCategory.findFirst({
    where: { id: input.categoryId, storeId: store.id },
    select: { id: true, categoryId: true },
  });
  if (!category) {
    throw HttpError.badRequest("Category not found in this store");
  }

  // Classification follows the shelf, always. The seller picked a real
  // category when they created that shelf, so there is nothing left to ask
  // here — and a legacy brand shelf ("KTM") stays unclassified until an admin
  // maps it, which reclassifies everything on it in the same move.
  const globalCategoryId = category.categoryId;

  await assertSkusFree(store.id, [{ sku: input.sku }]);

  // A DRAFT: disabled, unpublished, and always with its one implicit Default
  // variant so there is exactly one place a price lives. Photos, options and
  // everything else follow step by step against the id.
  const created = await prisma.storeProduct.create({
    data: {
      storeId: store.id,
      categoryId: input.categoryId,
      globalCategoryId,
      name: input.name,
      slug: await uniqueProductSlug(store.id, input.name),
      description: input.description ?? null,
      isActive: false,
      variants: {
        create: {
          name: DEFAULT_VARIANT_NAME,
          price: input.price ?? 0,
          stockQuantity: input.stockQuantity ?? 0,
          isDefault: true,
          sku: input.sku ?? null,
          compareAtPrice: input.compareAtPrice ?? null,
        },
      },
    },
    select: { id: true },
  });

  // Seed the denormalised price/stock columns the storefront sorts on.
  await recomputeProductAggregates(created.id);

  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id: created.id },
    select: productSelect,
  });
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
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
    select: { id: true, publishedAt: true },
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
    // A draft starts at ₹0; nothing sells for nothing.
    const priced = await prisma.storeProductVariant.count({
      where: { productId, isActive: true, price: { gt: 0 } },
    });
    if (priced === 0) {
      throw HttpError.badRequest("Set a price before publishing this product");
    }
  }

  const data: Prisma.StoreProductUncheckedUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) {
    // An emptied-out description means "no description", not an empty string.
    data.description = patch.description || null;
  }
  if (patch.categoryId !== undefined) {
    data.categoryId = patch.categoryId;
    // Moving a product to another shelf re-files it under that shelf's
    // category, so the classification can never contradict where it sits.
    const target = await prisma.storeCategory.findFirst({
      where: { id: patch.categoryId, storeId: store.id },
      select: { categoryId: true },
    });
    data.globalCategoryId = target?.categoryId ?? null;
  }
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  // The first time it goes live the draft is over — for good.
  if (patch.isActive === true && product.publishedAt === null) data.publishedAt = new Date();
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
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
}

export async function deleteProduct(
  ownerId: string,
  storeRef: string,
  productId: string,
) {
  const store = await getMyStore(ownerId, storeRef);

  const product = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: {
      id: true,
      media: { select: { key: true } },
      groupMemberships: {
        select: {
          groupId: true,
          group: { select: { _count: { select: { members: true } } } },
        },
      },
    },
  });
  if (!product) throw HttpError.notFound("Product not found");

  await prisma.$transaction(async (tx) => {
    // Membership rows cascade with the product; a family it leaves with a
    // single member is dissolved — a family of one is just a product.
    await tx.storeProduct.delete({ where: { id: productId } });
    for (const membership of product.groupMemberships) {
      if (membership.group._count.members <= 2) {
        await tx.productGroup.delete({ where: { id: membership.groupId } });
      }
    }
  });

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
  const { productId: id, storeId } = await getMyProductRef(ownerId, storeRef, productId);

  // An axis is EITHER typed values (here) or other products (a group) — never
  // both under one name — and groups count towards the option cap.
  const memberships = await prisma.productGroupMember.findMany({
    where: { productId: id },
    select: { optionKey: true, group: { select: { optionName: true } } },
  });
  for (const type of input.optionTypes) {
    const taken = memberships.find((m) => m.optionKey === optionKeyOf(type.name));
    if (taken) {
      throw HttpError.badRequest(
        `"${taken.group.optionName}" is already an "Other products" option of this product`,
      );
    }
  }
  if (input.optionTypes.length + memberships.length > OPTION_LIMITS.types) {
    throw HttpError.badRequest(
      `At most ${OPTION_LIMITS.types} options per product, counting product groups`,
    );
  }

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
  await assertSkusFree(
    storeId,
    input.variants.map((variant) => ({ sku: variant.sku, variantId: variant.id })),
  );
  await assertOwnImages(id, input.variants.map((variant) => variant.mediaId));

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
            sku: variant.sku ?? null,
            compareAtPrice: variant.compareAtPrice ?? null,
            mediaId: variant.mediaId ?? null,
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
            sku: variant.sku ?? null,
            compareAtPrice: variant.compareAtPrice ?? null,
            mediaId: variant.mediaId ?? null,
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
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
}

// ---------------------------------------------------------------------------
// Product groups — the "Other products" option mode. A family is separate
// products (each with its own photos, price, stock, variants and URL) that
// are the same item on one axis. The group is the only thing that ties them;
// nothing about a member changes when it joins or leaves — every member is
// listed like any other product, and its page shows the family as swatches.
// ---------------------------------------------------------------------------

/** The identity of an axis: "Colour", "colour" and " Colour " are one axis. */
const optionKeyOf = (name: string) => name.trim().toLowerCase();

/** A member may not ALSO carry the axis as typed values. */
function assertNoTypedOption(
  rows: { name: string; optionTypes: ProductRow["optionTypes"] }[],
  optionName: string,
) {
  const key = optionKeyOf(optionName);
  for (const row of rows) {
    const clash = resolveOptionTypes(row.optionTypes).some(
      (type) => optionKeyOf(type.name) === key,
    );
    if (clash) {
      throw HttpError.badRequest(
        `"${row.name}" already has "${optionName}" as typed values — remove that option first`,
      );
    }
  }
}

const shapedProduct = async (id: string) => {
  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id },
    select: productSelect,
  });
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
};

/**
 * Replace every family this product is in — set semantics, like
 * `replaceProductOptions`: a group in the body is written member-for-member
 * (an existing family with that axis keeps its id; a new axis makes a new
 * family), a family missing from the body is dissolved, and `groups: []`
 * takes the product out of all of them. One transaction, so a family can
 * never be half-applied.
 *
 * Invariants checked before writing: every member is a product of this
 * store; the caller is in every group; no member carries the axis as typed
 * values; no member is already in a DIFFERENT family on the same axis
 * (`@@unique([productId, optionKey])` backs this up); nobody ends up with
 * more than `OPTION_LIMITS.types` options counting typed ones and groups.
 * Values are unique per family case-insensitively (the DB rule is
 * case-sensitive; the schema refine covers the rest).
 */
export async function replaceProductGroups(
  ownerId: string,
  storeRef: string,
  productId: string,
  input: StoreProductGroupsInput,
) {
  const { productId: id, storeId } = await getMyProductRef(ownerId, storeRef, productId);

  for (const group of input.groups) {
    if (!group.members.some((member) => member.productId === id)) {
      throw HttpError.badRequest(
        `This product must be one of the "${group.optionName}" products`,
      );
    }
  }

  const ids = new Set<string>([id]);
  for (const group of input.groups) {
    for (const member of group.members) ids.add(member.productId);
  }
  const rows = await prisma.storeProduct.findMany({
    where: { id: { in: [...ids] }, storeId },
    select: {
      id: true,
      name: true,
      optionTypes: true,
      groupMemberships: { select: { groupId: true, optionKey: true } },
    },
  });
  if (rows.length !== ids.size) {
    throw HttpError.badRequest("Choose products of this store");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));

  // The caller's families today — the set being replaced.
  const current = await prisma.productGroup.findMany({
    where: { members: { some: { productId: id } } },
    select: { id: true, optionKey: true },
  });
  const currentByKey = new Map(current.map((group) => [group.optionKey, group]));
  const replacedGroupIds = new Set(current.map((group) => group.id));

  const incomingKeys = new Set<string>();
  for (const group of input.groups) {
    const key = optionKeyOf(group.optionName);
    incomingKeys.add(key);
    const target = currentByKey.get(key);
    const members = group.members.map((member) => byId.get(member.productId)!);
    assertNoTypedOption(members, group.optionName);
    for (const row of members) {
      const elsewhere = row.groupMemberships.find(
        (membership) => membership.optionKey === key && membership.groupId !== target?.id,
      );
      if (elsewhere) {
        throw HttpError.conflict(
          `"${row.name}" is already in another "${group.optionName}" group`,
        );
      }
    }
  }
  for (const row of rows) {
    const typed = resolveOptionTypes(row.optionTypes).length;
    const kept = row.groupMemberships.filter(
      (membership) => !replacedGroupIds.has(membership.groupId),
    ).length;
    const joining = input.groups.filter((group) =>
      group.members.some((member) => member.productId === row.id),
    ).length;
    if (typed + kept + joining > OPTION_LIMITS.types) {
      throw HttpError.badRequest(
        `"${row.name}" would have more than ${OPTION_LIMITS.types} options`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const dissolved = current
      .filter((group) => !incomingKeys.has(group.optionKey))
      .map((group) => group.id);
    if (dissolved.length > 0) {
      await tx.productGroup.deleteMany({ where: { id: { in: dissolved } } });
    }

    for (const group of input.groups) {
      const key = optionKeyOf(group.optionName);
      const members = group.members.map((member, position) => ({
        productId: member.productId,
        optionKey: key,
        value: member.value,
        position,
      }));
      const target = currentByKey.get(key);
      if (target) {
        // Delete-all + recreate: nothing references a member row, and it
        // sidesteps `[groupId, value]` when two members swap values. The
        // display name follows the seller's latest casing.
        await tx.productGroup.update({
          where: { id: target.id },
          data: { optionName: group.optionName },
        });
        await tx.productGroupMember.deleteMany({ where: { groupId: target.id } });
        await tx.productGroupMember.createMany({
          data: members.map((member) => ({ ...member, groupId: target.id })),
        });
      } else {
        await tx.productGroup.create({
          data: {
            storeId,
            optionName: group.optionName,
            optionKey: key,
            members: { create: members },
          },
        });
      }
    }
  });

  return shapedProduct(id);
}

/**
 * The store's products as candidates for one axis of this product's family,
 * each with why it can or cannot be picked. Same shelf first — that is where
 * the other colours usually live.
 */
export async function listGroupCandidates(
  ownerId: string,
  storeRef: string,
  productId: string,
  query: GroupCandidatesQuery,
) {
  const { productId: id, storeId } = await getMyProductRef(ownerId, storeRef, productId);
  const key = optionKeyOf(query.optionName);

  const caller = await prisma.storeProduct.findUniqueOrThrow({
    where: { id },
    select: {
      categoryId: true,
      groupMemberships: { where: { optionKey: key }, select: { groupId: true } },
    },
  });
  const callerGroupId = caller.groupMemberships[0]?.groupId ?? null;

  const rows = await prisma.storeProduct.findMany({
    where: {
      storeId,
      id: { not: id },
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      priceMin: true,
      publishedAt: true,
      categoryId: true,
      optionTypes: true,
      category: { select: { id: true, name: true } },
      media: {
        where: { type: "IMAGE" },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { key: true },
      },
      groupMemberships: {
        select: {
          groupId: true,
          optionKey: true,
          group: {
            select: {
              optionName: true,
              // The first two members are enough to name one OTHER product
              // of the family the row is already in.
              members: {
                orderBy: { position: "asc" },
                take: 2,
                select: { productId: true, product: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const candidates = rows.map((row) => {
    const sameAxis = row.groupMemberships.find((m) => m.optionKey === key);
    const typed = resolveOptionTypes(row.optionTypes);
    let eligibility:
      | "eligible"
      | "in-this-group"
      | "in-other-group"
      | "has-typed-option"
      | "too-many-options" = "eligible";
    let conflictGroup: { optionName: string; otherName: string | null } | null = null;
    if (sameAxis && sameAxis.groupId === callerGroupId) {
      eligibility = "in-this-group";
    } else if (sameAxis) {
      eligibility = "in-other-group";
      conflictGroup = {
        optionName: sameAxis.group.optionName,
        otherName:
          sameAxis.group.members.find((member) => member.productId !== row.id)?.product
            .name ?? null,
      };
    } else if (typed.some((type) => optionKeyOf(type.name) === key)) {
      eligibility = "has-typed-option";
    } else if (typed.length + row.groupMemberships.length >= OPTION_LIMITS.types) {
      eligibility = "too-many-options";
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.media[0] ? mediaUrl("media", row.media[0].key) : null,
      price: row.priceMin,
      isDraft: row.publishedAt === null,
      category: row.category,
      sameShelf: row.categoryId === caller.categoryId,
      eligibility,
      conflictGroup,
    };
  });
  candidates.sort(
    (a, b) => Number(b.sameShelf) - Number(a.sameShelf) || a.name.localeCompare(b.name),
  );
  return candidates;
}

/**
 * A new DRAFT that starts as this product's twin — everything a family shares
 * (name, shelf, description, specifications, delivery rule, shipping override,
 * COD) copied once, so a seller adding "the same polo in Blue" only has to
 * add Blue's photos and price. Photos, variants, option types, merchandising
 * flags and group memberships are NOT copied: those are what makes the copy
 * a different product. The copy is independent from here on — later edits to
 * either do not propagate.
 */
export async function copyProduct(
  ownerId: string,
  storeRef: string,
  productId: string,
  input: StoreProductCopyInput,
) {
  const store = await getMyStore(ownerId, storeRef);
  const source = await prisma.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: {
      name: true,
      categoryId: true,
      globalCategoryId: true,
      description: true,
      specifications: true,
      deliveryRule: true,
      shippingOverride: true,
      codAvailable: true,
    },
  });
  if (!source) throw HttpError.notFound("Product not found");

  const json = (value: Prisma.JsonValue | null) =>
    value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  const name = input.name ?? source.name;
  const created = await prisma.storeProduct.create({
    data: {
      storeId: store.id,
      categoryId: source.categoryId,
      globalCategoryId: source.globalCategoryId,
      name,
      slug: await uniqueProductSlug(store.id, name),
      description: source.description,
      specifications: json(source.specifications),
      deliveryRule: json(source.deliveryRule),
      shippingOverride: json(source.shippingOverride),
      codAvailable: source.codAvailable,
      isActive: false,
      variants: {
        create: { name: DEFAULT_VARIANT_NAME, price: 0, stockQuantity: 0, isDefault: true },
      },
    },
    select: { id: true },
  });
  await recomputeProductAggregates(created.id);
  return shapedProduct(created.id);
}

export async function updateVariant(
  ownerId: string,
  storeRef: string,
  productId: string,
  variantId: string,
  patch: StoreVariantUpdateInput,
) {
  const { productId: id, storeId } = await getMyProductRef(ownerId, storeRef, productId);

  const variant = await prisma.storeProductVariant.findFirst({
    where: { id: variantId, productId: id },
    select: { id: true, price: true, compareAtPrice: true },
  });
  if (!variant) throw HttpError.notFound("Variant not found");

  // `name` is derived from the option values and is not patchable here;
  // changing what a variant IS goes through `replaceProductOptions`.
  const data: Prisma.StoreProductVariantUncheckedUpdateInput = {};
  if (patch.price !== undefined) data.price = patch.price;
  if (patch.stockQuantity !== undefined) data.stockQuantity = patch.stockQuantity;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.sku !== undefined) data.sku = patch.sku;
  if (patch.compareAtPrice !== undefined) data.compareAtPrice = patch.compareAtPrice;
  if (patch.mediaId !== undefined) data.mediaId = patch.mediaId;

  // The MRP rule holds for the resulting state, whichever half was patched.
  const price = patch.price ?? Number(variant.price);
  const compareAt =
    patch.compareAtPrice === undefined
      ? variant.compareAtPrice === null ? null : Number(variant.compareAtPrice)
      : patch.compareAtPrice;
  if (compareAt !== null && compareAt <= price) {
    throw HttpError.badRequest("MRP must be higher than the price");
  }
  if (patch.sku) await assertSkusFree(storeId, [{ sku: patch.sku, variantId }]);
  if (patch.mediaId) await assertOwnImages(id, [patch.mediaId]);

  await prisma.storeProductVariant.update({ where: { id: variantId }, data });
  // Price / stock / isActive all move the aggregates.
  await recomputeProductAggregates(id);
  const row = await prisma.storeProduct.findUniqueOrThrow({
    where: { id },
    select: productSelect,
  });
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
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
  const [shaped] = await withProductTaxonomy([shapeProduct(row)]);
  return shaped!;
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
