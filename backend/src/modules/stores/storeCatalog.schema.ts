import { z } from "zod";
import { parseRows } from "./stores.schema.js";
import { deliveryRuleSchema } from "./deliveryRules.js";
import { productShippingOverrideSchema } from "./shippingRates.js";
import {
  OPTION_LIMITS,
  cartesianSize,
  validateOptionMatrix,
} from "./productOptions.js";
import type {
  OptionValues,
  ProductOptionType,
  ProductSpec,
} from "./productOptions.js";

/**
 * Catalog inside a customer-owned store: Store → Categories (a tree
 * mirroring the global taxonomy) → Product → Variants. Products require a
 * category, so the create schemas encode the setup sequence: category
 * first, then products.
 */

/**
 * A seller CHOOSES a shelf from the global taxonomy; they never type one.
 * Both the shelf's name and its place in the hierarchy come from the chosen
 * node, so a shop cannot invent its own vocabulary and every shelf created
 * from here is classified by construction.
 *
 * Shelves that predate this rule keep their free-text names (brands like
 * "KTM", tiers like "Pro Edition"). Re-pointing one of those at the taxonomy
 * is an ADMIN action — see `adminCategoryMapping.service.ts` — which is why
 * neither schema here accepts a name or a taxonomy id on update.
 */
export const storeCategoryCreateSchema = z.object({
  /** The taxonomy node this shelf represents. Its ancestors are created
   *  alongside it, so picking "Electronics › Mobiles" yields the whole chain. */
  categoryId: z.string().min(1, "Choose a category"),
  /** Optional shelf artwork — a URL the seller pastes; `null` clears it. */
  imageUrl: z.string().trim().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/**
 * Partial update of a shelf — presentation and visibility only.
 *
 * The name and the taxonomy link are both absent on purpose: the name is
 * derived from the chosen category, and re-pointing a shelf at a different
 * category is an admin action. Re-parenting is likewise unsupported: a
 * shelf's place is its category's.
 */
export const storeCategoryUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    /** Surfaces the category in the storefront homepage's Featured row. */
    isFeatured: z.boolean().optional(),
    imageUrl: z.string().trim().url().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    {
      message:
        "Provide isActive, isFeatured, imageUrl or sortOrder to update",
    },
  );


// ---------------------------------------------------------------------------
// Product options & specifications — the StoreProduct / Variant JSON columns
// ---------------------------------------------------------------------------

const optionText = z.string().trim().min(1).max(OPTION_LIMITS.nameLength);

/**
 * One option type. The BASE shape allows zero values so the same schema can
 * one day validate a category template (a suggested type the seller has not
 * filled in yet); the product-write shape below requires at least one.
 */
export const optionTypeBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Option name is required")
    .max(OPTION_LIMITS.nameLength),
  values: z.array(optionText).max(OPTION_LIMITS.valuesPerType),
});

export const optionTypeSchema = optionTypeBaseSchema.extend({
  values: optionTypeBaseSchema.shape.values.min(1, "Add at least one value"),
});

const uniqueCaseInsensitive = (values: string[]) =>
  new Set(values.map((value) => value.toLowerCase())).size === values.length;

/** A product's option types: ≤ 3, unique names, unique values, ≤ 100 combos. */
export const optionTypesSchema = z
  .array(optionTypeSchema)
  .max(OPTION_LIMITS.types, `At most ${OPTION_LIMITS.types} option types`)
  .refine((types) => uniqueCaseInsensitive(types.map((type) => type.name)), {
    message: "Option names must be unique",
  })
  .refine((types) => types.every((type) => uniqueCaseInsensitive(type.values)), {
    message: "Values must be unique within an option",
  })
  .refine((types) => cartesianSize(types) <= OPTION_LIMITS.variants, {
    message: `Too many combinations (max ${OPTION_LIMITS.variants})`,
  });

/**
 * One value per option type, keyed by type name. Shape only — that the keys
 * are exactly the product's types and each value belongs to its type is the
 * matrix validator's job (`refineOptionMatrix`), which sees both together.
 */
export const optionValuesSchema = z.record(optionText, optionText);

export const specificationSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(OPTION_LIMITS.specLabelLength),
  value: z
    .string()
    .trim()
    .min(1, "Value is required")
    .max(OPTION_LIMITS.specValueLength),
});

export const specificationsSchema = z
  .array(specificationSchema)
  .max(OPTION_LIMITS.specs);

/**
 * Zod `superRefine` body that attaches every matrix problem to its path.
 * Shared by product create (with options) and the options PUT, so both
 * enforce the identical invariant: the variants are a valid subset of the
 * cartesian product.
 */
export function refineOptionMatrix(
  input: {
    optionTypes: ProductOptionType[];
    variants: { id?: string | undefined; optionValues: OptionValues }[];
  },
  ctx: z.RefinementCtx,
): void {
  for (const issue of validateOptionMatrix(input)) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
}

// ---- Resolvers: stored JSON → complete shape (the resolveFooter pattern) ---

/**
 * Option types as stored. Malformed rows are dropped one by one, duplicate
 * names and values removed (first wins), types left with no values dropped,
 * and the result capped — so a hand-edited or pre-rule row costs at most the
 * offending entry, never the product's whole option model.
 */
export function resolveOptionTypes(raw: unknown): ProductOptionType[] {
  const seenNames = new Set<string>();
  const types: ProductOptionType[] = [];
  for (const type of parseRows(optionTypeBaseSchema, raw)) {
    const foldedName = type.name.toLowerCase();
    if (seenNames.has(foldedName)) continue;

    const seenValues = new Set<string>();
    const values = type.values.filter((value) => {
      const folded = value.toLowerCase();
      if (seenValues.has(folded)) return false;
      seenValues.add(folded);
      return true;
    });
    if (values.length === 0) continue;

    seenNames.add(foldedName);
    types.push({ name: type.name, values });
    if (types.length === OPTION_LIMITS.types) break;
  }
  return types;
}

/** A variant's option values as stored; any entry that isn't a clean string pair is dropped. */
export function resolveOptionValues(raw: unknown): OptionValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const values: OptionValues = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsedKey = optionText.safeParse(key);
    const parsedValue = optionText.safeParse(value);
    if (parsedKey.success && parsedValue.success) {
      values[parsedKey.data] = parsedValue.data;
    }
  }
  return values;
}

export function resolveSpecifications(raw: unknown): ProductSpec[] {
  return parseRows(specificationSchema, raw).slice(0, OPTION_LIMITS.specs);
}

// ---------------------------------------------------------------------------
// Products & variants
// ---------------------------------------------------------------------------

/**
 * One combination of the product's option values — the unit of sale, so it
 * always carries its own price. Its `name` is derived on the server from
 * `optionValues` and is never sent. `id` is set on the options PUT to update
 * an existing combination in place (keeping its cart and order links); it is
 * absent on create and for newly generated combinations.
 */
const skuSchema = z.string().trim().min(1).max(64);
const compareAtSchema = z.number().min(0).max(99_999_999.99);

const variantInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    optionValues: optionValuesSchema,
    price: z.number().min(0).max(99_999_999.99),
    stockQuantity: z.number().int().min(0),
    isActive: z.boolean().default(true),
    /** Stock-keeping code, unique within the store. `null` clears it. */
    sku: skuSchema.nullable().optional(),
    /** Strike-through MRP; must be above `price`. `null` clears it. */
    compareAtPrice: compareAtSchema.nullable().optional(),
    /** One of the product's own images that shows this variant; `null` = cover. */
    mediaId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    path: ["compareAtPrice"],
    message: "MRP must be higher than the price",
  });

/**
 * Creating a product makes a DRAFT. A name and a category are all it takes:
 * the product exists (disabled, `publishedAt` null) from that moment and the
 * seller fills in the rest step by step — photos upload against the id,
 * options arrive through `PUT …/options`, everything else through `PATCH`.
 * A simple product may bring its price along; otherwise the implicit Default
 * variant starts at ₹0 / 0 stock, which the publish guard refuses.
 */
export const storeProductCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required").max(120),
    categoryId: z.string().min(1, "Category is required"),
    description: z.string().trim().max(2000).optional(),
    /** The single variant's price, stock, SKU and MRP — all optional on a draft. */
    price: z.number().min(0).max(99_999_999.99).optional(),
    stockQuantity: z.number().int().min(0).optional(),
    sku: skuSchema.nullable().optional(),
    compareAtPrice: compareAtSchema.nullable().optional(),
  })
  .refine(
    (input) =>
      input.compareAtPrice == null ||
      input.price === undefined ||
      input.compareAtPrice > input.price,
    { path: ["compareAtPrice"], message: "MRP must be higher than the price" },
  );
/**
 * `PUT …/products/:productId/options` — the FULL target state: every option
 * type and every combination sold. The server reconciles the stored variants to
 * it in one transaction (update by `id`, create the rest, delete the
 * remainder), so option types and variants can never disagree — a guarantee
 * N separate POST/DELETE calls could not make. `optionTypes: []` with
 * `variants: []` turns the product back into a simple one.
 */
export const storeProductOptionsSchema = z
  .object({
    optionTypes: optionTypesSchema,
    variants: z.array(variantInputSchema).max(OPTION_LIMITS.variants),
  })
  .superRefine(refineOptionMatrix);

/** Price / MRP / stock / SKU / photo / on-off for one combination. `name` is derived, never edited. */
export const storeVariantUpdateSchema = z.object({
  /** A variant always has a price — it can be changed but never cleared. */
  price: z.number().min(0).max(99_999_999.99).optional(),
  stockQuantity: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sku: skuSchema.nullable().optional(),
  compareAtPrice: compareAtSchema.nullable().optional(),
  mediaId: z.string().min(1).nullable().optional(),
});

/**
 * Partial update of a product. Covers the editable details (name,
 * description, category), the storefront visibility switch, and the
 * merchandising flags. Each flag maps to exactly one homepage section, so
 * merchants curate the shop without code changes and without one flag ever
 * affecting another section. The slug is deliberately NOT editable — it is
 * the product's public URL identity and stays stable across renames.
 */
export const storeProductUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Product name is required")
      .max(120)
      .optional(),
    /** `null` clears the description. */
    description: z.string().trim().max(2000).nullable().optional(),
    /** Move the product to another category (root or sub) of the same store. */
    categoryId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    hideFromSearch: z.boolean().optional(),
    /** Ordered spec rows; `null` or `[]` clears them. */
    specifications: specificationsSchema.nullable().optional(),
    /**
     * Delivery-area override; `null` removes it so the product follows the
     * store's default rule again.
     */
    deliveryRule: deliveryRuleSchema.nullable().optional(),
    /**
     * Shipping-charge override; `null` removes it so the product follows the
     * store's default rate again.
     */
    shippingOverride: productShippingOverrideSchema.nullable().optional(),
    codAvailable: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });

/**
 * Media metadata update — alt text only (the binary is replaced via the
 * dedicated /file endpoint; order via /order). `null` clears the alt text.
 */
export const storeMediaUpdateSchema = z.object({
  altText: z.string().trim().max(200).nullable(),
});

/**
 * Full ordered list of the product's IMAGE media ids. The first id becomes
 * the cover image. The video (if any) is not part of the ordering.
 */
export const storeMediaOrderSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(8),
});

/** Nested route params: /stores/:id/... (`:id` = store id or slug). */
export const storeCategoryParamSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
});

export const storeProductParamSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
});

export const storeVariantParamSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
});

export const storeMediaParamSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  mediaId: z.string().min(1),
});

export type StoreMediaUpdateInput = z.infer<typeof storeMediaUpdateSchema>;
export type StoreMediaOrderInput = z.infer<typeof storeMediaOrderSchema>;
export type StoreCategoryCreateInput = z.infer<typeof storeCategoryCreateSchema>;
export type StoreCategoryUpdateInput = z.infer<typeof storeCategoryUpdateSchema>;
export type StoreProductCreateInput = z.infer<typeof storeProductCreateSchema>;
export type StoreProductUpdateInput = z.infer<typeof storeProductUpdateSchema>;
export type StoreProductOptionsInput = z.infer<typeof storeProductOptionsSchema>;
export type StoreVariantUpdateInput = z.infer<typeof storeVariantUpdateSchema>;
