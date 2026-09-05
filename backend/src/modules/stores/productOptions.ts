/**
 * Product options — the pure logic behind structured variants.
 *
 * A product declares ordered OPTION TYPES ("Size" → S/M/L, "Colour" →
 * Red/Blue). Its variants are exactly the cartesian product of those values,
 * every combination present, each carrying its own price and stock; the
 * seller switches off the combinations they don't sell. A variant's `name` is
 * DERIVED — the values joined in type order ("M / Red") — so the existing
 * `@@unique([productId, name])` constraint, `OrderItem.variantName` snapshot,
 * the cart, and every place that renders a variant label keep working as they
 * always have.
 *
 * Everything here is pure and free of Prisma and Zod so it can be exercised
 * without a database, and so the frontend can carry a line-for-line mirror
 * (`features/stores/productOptions.ts`) that never disagrees with the server.
 *
 * Values are strings and only strings. "500 ml", "42 inch" and "XL" are all
 * just values — deliberately no unit system.
 */

export interface ProductOptionType {
  name: string;
  values: string[];
}

/** One value per option type, keyed by the type's name. */
export type OptionValues = Record<string, string>;

/** A descriptive, non-purchasable attribute row shown in the spec table. */
export interface ProductSpec {
  label: string;
  value: string;
}

export const OPTION_LIMITS = {
  /** Option types per product. Size × Colour × Material covers every catalog we know of. */
  types: 3,
  /** Values per option type — a chip-input sanity cap, not a matrix cap. */
  valuesPerType: 30,
  /** Total combinations. 8 sizes × 6 colours = 48 already broke the old 50. */
  variants: 100,
  /** Option names, option values. */
  nameLength: 40,
  /** Spec rows per product. */
  specs: 30,
  specLabelLength: 40,
  specValueLength: 120,
} as const;

/** Separator between values in a derived variant name. */
export const LABEL_SEPARATOR = " / ";

/**
 * The option type synthesised for products that predate structured options.
 * Their variants were free text ("Red / 128 GB"), so the whole label becomes
 * the single value of one type. The seller renames it ("Size") from the
 * editor; nothing else changes.
 */
export const LEGACY_OPTION_NAME = "Option";

/** The derived variant name: values in option-type order, joined. */
export function variantLabel(
  optionTypes: ProductOptionType[],
  optionValues: OptionValues,
): string {
  return optionTypes
    .map((type) => optionValues[type.name] ?? "")
    .join(LABEL_SEPARATOR);
}

/** Number of combinations the option types produce; 0 when there are none. */
export function cartesianSize(optionTypes: ProductOptionType[]): number {
  if (optionTypes.length === 0) return 0;
  return optionTypes.reduce((size, type) => size * type.values.length, 1);
}

/**
 * Every combination, in order: the FIRST option type is the outermost loop,
 * so Size × Colour yields S/Red, S/Blue, M/Red, M/Blue… — the order the seller
 * reads the matrix in and the order the storefront lists pickers in.
 */
export function cartesian(optionTypes: ProductOptionType[]): OptionValues[] {
  if (optionTypes.length === 0) return [];
  return optionTypes.reduce<OptionValues[]>(
    (combos, type) =>
      combos.flatMap((combo) =>
        type.values.map((value) => ({ ...combo, [type.name]: value })),
      ),
    [{}],
  );
}

/**
 * Position of a combination in `cartesian()` order, or -1 if any value is not
 * one of its type's values. Lets variants be sorted into matrix order without
 * materialising the whole cartesian product.
 */
export function cartesianIndex(
  optionTypes: ProductOptionType[],
  optionValues: OptionValues,
): number {
  let index = 0;
  for (const type of optionTypes) {
    const position = type.values.indexOf(optionValues[type.name] ?? "");
    if (position === -1) return -1;
    index = index * type.values.length + position;
  }
  return index;
}

/** Variants in matrix order; any that don't fit the option types go last. */
export function sortByOptionOrder<V extends { optionValues: OptionValues }>(
  optionTypes: ProductOptionType[],
  variants: V[],
): V[] {
  const rank = (variant: V) => {
    const index = cartesianIndex(optionTypes, variant.optionValues);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...variants].sort((a, b) => rank(a) - rank(b));
}

export interface MatrixIssue {
  path: (string | number)[];
  message: string;
}

interface MatrixVariant {
  id?: string | undefined;
  optionValues: OptionValues;
}

/**
 * Check that a set of variants is exactly the cartesian product of the option
 * types — no combination missing, none duplicated, none invented, and every
 * derived label unique. Returns issues rather than throwing so the Zod schema
 * can attach each to its path; an empty array means the matrix is valid.
 *
 * Label uniqueness is checked separately from combination uniqueness because
 * values may contain the separator: {A: "X / Y", B: "Z"} and {A: "X", B: "Y /
 * Z"} are different combinations that would collide on `name`.
 */
export function validateOptionMatrix(input: {
  optionTypes: ProductOptionType[];
  variants: MatrixVariant[];
}): MatrixIssue[] {
  const { optionTypes, variants } = input;
  const issues: MatrixIssue[] = [];

  if (optionTypes.length === 0) {
    if (variants.length > 0) {
      issues.push({
        path: ["variants"],
        message: "A product without option types has no combinations",
      });
    }
    return issues;
  }

  const expected = cartesianSize(optionTypes);
  if (variants.length !== expected) {
    issues.push({
      path: ["variants"],
      message: `Expected ${expected} combinations, received ${variants.length}`,
    });
  }

  const typeNames = optionTypes.map((type) => type.name);
  const seenCombos = new Set<string>();
  const seenLabels = new Map<string, string>();
  const seenIds = new Set<string>();

  variants.forEach((variant, i) => {
    const keys = Object.keys(variant.optionValues);
    const sameKeys =
      keys.length === typeNames.length &&
      typeNames.every((name) => name in variant.optionValues);
    if (!sameKeys) {
      issues.push({
        path: ["variants", i, "optionValues"],
        message: "Every combination must have exactly one value per option",
      });
      return;
    }

    for (const type of optionTypes) {
      const value = variant.optionValues[type.name]!;
      if (!type.values.includes(value)) {
        issues.push({
          path: ["variants", i, "optionValues", type.name],
          message: `"${value}" is not a value of "${type.name}"`,
        });
        return;
      }
    }

    const label = variantLabel(optionTypes, variant.optionValues);
    const comboKey = JSON.stringify(typeNames.map((n) => variant.optionValues[n]));
    if (seenCombos.has(comboKey)) {
      issues.push({
        path: ["variants", i],
        message: `Duplicate combination "${label}"`,
      });
      return;
    }
    seenCombos.add(comboKey);

    const folded = label.toLowerCase();
    if (seenLabels.has(folded)) {
      issues.push({
        path: ["variants", i],
        message: `Two combinations produce the same label "${label}"`,
      });
      return;
    }
    seenLabels.set(folded, label);

    if (variant.id !== undefined) {
      if (seenIds.has(variant.id)) {
        issues.push({
          path: ["variants", i, "id"],
          message: `Duplicate variant id "${variant.id}"`,
        });
        return;
      }
      seenIds.add(variant.id);
    }
  });

  return issues;
}

interface DerivableVariant {
  name: string;
  isDefault: boolean;
  optionValues: OptionValues;
}

/**
 * Present every product through the structured model, including those that
 * predate it.
 *
 * A product created before option types existed has free-text variants and no
 * `optionTypes`. Rather than teach every consumer a second, legacy shape, this
 * synthesises the one option type such a product implicitly has — one value
 * per variant, the old label — so the storefront picker, the seller's matrix
 * and the public API see exactly one kind of product. The backfill script
 * persists the same synthesis; this is the read-time safety net for any row it
 * has not reached. Nothing is written here.
 *
 * Products that already carry option types, and simple products (only the
 * implicit Default), pass through untouched.
 */
export function deriveProductOptions<V extends DerivableVariant>(
  optionTypes: ProductOptionType[],
  variants: V[],
): { optionTypes: ProductOptionType[]; variants: V[] } {
  if (optionTypes.length > 0) return { optionTypes, variants };

  const real = variants.filter((variant) => !variant.isDefault);
  if (real.length === 0) return { optionTypes, variants };

  return {
    optionTypes: [
      { name: LEGACY_OPTION_NAME, values: real.map((variant) => variant.name) },
    ],
    variants: variants.map((variant) =>
      variant.isDefault
        ? variant
        : { ...variant, optionValues: { [LEGACY_OPTION_NAME]: variant.name } },
    ),
  };
}
