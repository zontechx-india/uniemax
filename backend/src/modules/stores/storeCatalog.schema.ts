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
 * Catalog inside a customer-owned store, following the hierarchy
 * Store → Category → Subcategory (optional) → Product → Variants.
 * Products require a category (root or subcategory), so the create schemas
 * encode the setup sequence: category first, then products.
 */

export const storeCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(60),
  /** Parent category id → creates a subcategory (one level only). */
  parentId: z.string().min(1).optional(),
});

/**
 * Partial update of a category. Covers both renaming and the
 * enable/disable toggle, so one PATCH serves the whole row.
 * Re-parenting is deliberately not supported yet (it would have to revalidate
 * the one-level nesting rule for every descendant).
 */
export const storeCategoryUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required")
      .max(60)
      .optional(),
    isActive: z.boolean().optional(),
    /** Surfaces the category in the storefront homepage's Featured row. */
    isFeatured: z.boolean().optional(),
  })
  .refine(
    (patch) =>
      patch.name !== undefined ||
      patch.isActive !== undefined ||
      patch.isFeatured !== undefined,
    { message: "Provide a name, isActive or isFeatured to update" },
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
 * enforce the identical invariant: the variants ARE the cartesian product.
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
const variantInputSchema = z.object({
  id: z.string().min(1).optional(),
  optionValues: optionValuesSchema,
  price: z.number().min(0).max(99_999_999.99),
  stockQuantity: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

/**
 * Creating a product. `hasVariants` is the explicit discriminator between the
 * two product shapes, so a payload is never ambiguous:
 *
 *   false → `price` + `stockQuantity` required; no option types or variants.
 *           The product gets one implicit `Default` variant carrying them.
 *   true  → `optionTypes` (≥ 1) plus `variants` — EVERY combination of those
 *           values, each with its own price and stock; `price`/`stockQuantity`
 *           are not accepted. The matrix is validated as a whole.
 *
 * Either way exactly one price source exists — never two competing fields.
 */
export const storeProductCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required").max(120),
    categoryId: z.string().min(1, "Category is required"),
    description: z.string().trim().max(2000).optional(),
    specifications: specificationsSchema.optional(),
    /**
     * Delivery-area override for this product. Absent / null = follow the
     * store's default rule (`Store.shipping.deliveryRule`).
     */
    deliveryRule: deliveryRuleSchema.nullable().optional(),
    /**
     * Shipping-charge override for this product. Absent / null = follow the
     * store's default rate (`Store.shipping.rate`).
     */
    shippingOverride: productShippingOverrideSchema.nullable().optional(),
    /** Cash on delivery allowed for this product (default true). */
    codAvailable: z.boolean().default(true),
    hasVariants: z.boolean().default(false),
    /** Simple products only. */
    price: z.number().min(0).max(99_999_999.99).optional(),
    stockQuantity: z.number().int().min(0).optional(),
    /** Variant products only. */
    optionTypes: optionTypesSchema.optional(),
    variants: z.array(variantInputSchema).max(OPTION_LIMITS.variants).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.hasVariants) {
      if (!input.optionTypes || input.optionTypes.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["optionTypes"],
          message: "Add at least one option type",
        });
        return;
      }
      refineOptionMatrix(
        { optionTypes: input.optionTypes, variants: input.variants ?? [] },
        ctx,
      );
      return;
    }

    if (input.price === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Price is required",
      });
    }
    if (input.stockQuantity === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "Stock quantity is required",
      });
    }
    if (
      (input.optionTypes && input.optionTypes.length > 0) ||
      (input.variants && input.variants.length > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Enable hasVariants to submit options",
      });
    }
  });

/**
 * `PUT …/products/:productId/options` — the FULL target state: every option
 * type and every combination. The server reconciles the stored variants to
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

/** Price / stock / on-off for one combination. `name` is derived, never edited. */
export const storeVariantUpdateSchema = z.object({
  /** A variant always has a price — it can be changed but never cleared. */
  price: z.number().min(0).max(99_999_999.99).optional(),
  stockQuantity: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
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
