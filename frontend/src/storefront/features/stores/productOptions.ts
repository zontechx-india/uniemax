import type {
  OptionValues,
  ProductOptionType,
  StoreProduct,
  StoreProductOptionsInput,
  StoreVariantInput,
} from './storesApi'

/**
 * Product options — the client mirror of the server's
 * `backend/src/modules/stores/productOptions.ts`.
 *
 * The pure helpers (label, cartesian order, matching) are line-for-line the
 * server's, so the storefront picker and the seller's matrix can never
 * disagree with what the API will accept or how it names a variant. The
 * DRAFT model below is client-only: it is how the seller's editor holds
 * option types and rows while they are being changed, and it is keyed by
 * stable client ids so that renaming a type or a value keeps every row (and
 * its variant `id`) instead of dropping and recreating it.
 */

export const OPTION_LIMITS = {
  types: 3,
  valuesPerType: 30,
  variants: 100,
  nameLength: 40,
  specs: 30,
  specLabelLength: 40,
  specValueLength: 120,
} as const

export const LABEL_SEPARATOR = ' / '

// ---------------------------------------------------------------------------
// Pure helpers — mirror the server exactly
// ---------------------------------------------------------------------------

/** The derived variant name: values in option-type order, joined. */
export function variantLabel(
  optionTypes: ProductOptionType[],
  optionValues: OptionValues,
): string {
  return optionTypes
    .map((type) => optionValues[type.name] ?? '')
    .join(LABEL_SEPARATOR)
}

export function cartesianSize(optionTypes: ProductOptionType[]): number {
  if (optionTypes.length === 0) return 0
  return optionTypes.reduce((size, type) => size * type.values.length, 1)
}

/** Every combination; the FIRST type is the outermost loop (S/Red, S/Blue, M/Red…). */
export function cartesian(optionTypes: ProductOptionType[]): OptionValues[] {
  if (optionTypes.length === 0) return []
  return optionTypes.reduce<OptionValues[]>(
    (combos, type) =>
      combos.flatMap((combo) =>
        type.values.map((value) => ({ ...combo, [type.name]: value })),
      ),
    [{}],
  )
}

export function cartesianIndex(
  optionTypes: ProductOptionType[],
  optionValues: OptionValues,
): number {
  let index = 0
  for (const type of optionTypes) {
    const position = type.values.indexOf(optionValues[type.name] ?? '')
    if (position === -1) return -1
    index = index * type.values.length + position
  }
  return index
}

export function sortByOptionOrder<V extends { optionValues: OptionValues }>(
  optionTypes: ProductOptionType[],
  variants: V[],
): V[] {
  const rank = (variant: V) => {
    const index = cartesianIndex(optionTypes, variant.optionValues)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  return [...variants].sort((a, b) => rank(a) - rank(b))
}

// ---------------------------------------------------------------------------
// Storefront picker
// ---------------------------------------------------------------------------

interface Pickable {
  optionValues: OptionValues
  stockQuantity: number
}

/** The variant matching a COMPLETE selection (one value per type), or null. */
export function findVariant<V extends { optionValues: OptionValues }>(
  variants: V[],
  optionTypes: ProductOptionType[],
  selection: OptionValues,
): V | null {
  if (optionTypes.some((type) => selection[type.name] === undefined)) return null
  return (
    variants.find((variant) =>
      optionTypes.every(
        (type) => variant.optionValues[type.name] === selection[type.name],
      ),
    ) ?? null
  )
}

/**
 * Whether choosing `value` for `typeName` can still reach an in-stock variant,
 * holding the seller's OTHER current choices fixed. This is what greys a chip:
 * "M" is unavailable while Blue is selected if no in-stock M/Blue exists, and
 * comes back the moment Red is chosen. Variants passed in should already be
 * the sellable ones (the public API never lists inactive variants).
 */
export function isValueAvailable<V extends Pickable>(
  variants: V[],
  optionTypes: ProductOptionType[],
  selection: OptionValues,
  typeName: string,
  value: string,
): boolean {
  return variants.some(
    (variant) =>
      variant.stockQuantity > 0 &&
      variant.optionValues[typeName] === value &&
      optionTypes.every(
        (type) =>
          type.name === typeName ||
          selection[type.name] === undefined ||
          variant.optionValues[type.name] === selection[type.name],
      ),
  )
}

/** The first in-stock variant's values, else the first variant's, else nothing. */
export function firstSellableSelection<V extends Pickable>(
  variants: V[],
): OptionValues {
  const first =
    variants.find((variant) => variant.stockQuantity > 0) ?? variants[0]
  return first ? { ...first.optionValues } : {}
}

// ---------------------------------------------------------------------------
// Seller draft model — client-only, keyed so renames keep rows
// ---------------------------------------------------------------------------

export interface OptionValueDraft {
  key: string
  value: string
}

export interface OptionTypeDraft {
  key: string
  name: string
  values: OptionValueDraft[]
}

/**
 * One matrix row. `valueKeys` names this combination by the KEYS of the
 * values it holds (one per type key), so it survives any rename. `price` and
 * `stock` stay strings while editing — they are what the seller typed.
 */
export interface VariantDraft {
  id?: string
  valueKeys: Record<string, string>
  price: string
  stock: string
  isActive: boolean
}

let counter = 0
/** A stable client-side key; never sent to the server. */
export function newKey(): string {
  counter += 1
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${counter}`
}

/** Start a draft from what the server holds. */
export function toDraft(product: Pick<StoreProduct, 'optionTypes' | 'variants'>): {
  types: OptionTypeDraft[]
  rows: VariantDraft[]
} {
  const types: OptionTypeDraft[] = product.optionTypes.map((type) => ({
    key: newKey(),
    name: type.name,
    values: type.values.map((value) => ({ key: newKey(), value })),
  }))
  const keyOf = (typeName: string, value: string) => {
    const type = types.find((t) => t.name === typeName)
    return type?.values.find((v) => v.value === value)?.key
  }
  const rows: VariantDraft[] = []
  for (const variant of product.variants) {
    const valueKeys: Record<string, string> = {}
    let complete = true
    for (const type of types) {
      const key = keyOf(type.name, variant.optionValues[type.name] ?? '')
      if (!key) {
        complete = false
        break
      }
      valueKeys[type.key] = key
    }
    if (!complete) continue
    rows.push({
      id: variant.id,
      valueKeys,
      price: variant.price,
      stock: String(variant.stockQuantity),
      isActive: variant.isActive,
    })
  }
  return { types, rows }
}

/** Every combination of value keys for the draft types, in matrix order. */
function draftCombos(types: OptionTypeDraft[]): Record<string, string>[] {
  if (types.length === 0) return []
  return types.reduce<Record<string, string>[]>(
    (combos, type) =>
      combos.flatMap((combo) =>
        type.values.map((value) => ({ ...combo, [type.key]: value.key })),
      ),
    [{}],
  )
}

/**
 * Rebuild the rows for a changed set of option types, keeping what the seller
 * already typed wherever a combination survives.
 *
 * A previous row carries into a new combination when they agree on every type
 * they BOTH have. Two refinements make the common edits behave the way a
 * seller expects:
 *   - Adding a type ("Material"): each existing row moves onto the FIRST new
 *     value (Material = Cotton) and keeps its price, stock and variant id; the
 *     other new values get blank rows to fill in.
 *   - Removing a type ("Colour"): the rows for that type's first value
 *     survive (S/Red → S), the rest are reported in `dropped` so the editor
 *     can confirm before they are deleted on save.
 * Renames never touch rows at all — keys, not names, identify a combination.
 */
export function reconcileDraft(
  previous: VariantDraft[],
  types: OptionTypeDraft[],
): { rows: VariantDraft[]; dropped: VariantDraft[] } {
  const firstValueKey = new Map(
    types.map((type) => [type.key, type.values[0]?.key]),
  )
  const used = new Set<VariantDraft>()

  const rows = draftCombos(types).map((target) => {
    const typeKeys = Object.keys(target)
    const source = previous.find(
      (row) =>
        !used.has(row) &&
        typeKeys.every((typeKey) =>
          typeKey in row.valueKeys
            ? row.valueKeys[typeKey] === target[typeKey]
            : target[typeKey] === firstValueKey.get(typeKey),
        ),
    )
    if (source) {
      used.add(source)
      return { ...source, valueKeys: target }
    }
    return { valueKeys: target, price: '', stock: '', isActive: true }
  })

  return { rows, dropped: previous.filter((row) => !used.has(row)) }
}

/** The human label of a draft row, from the current draft names. */
export function draftLabel(types: OptionTypeDraft[], row: VariantDraft): string {
  return types
    .map(
      (type) =>
        type.values.find((v) => v.key === row.valueKeys[type.key])?.value ?? '',
    )
    .join(LABEL_SEPARATOR)
}

/** Draft rows still missing a valid price. */
export function rowsNeedingPrice(rows: VariantDraft[]): number {
  return rows.filter((row) => !isValidPrice(row.price)).length
}

const isValidPrice = (value: string) => {
  const n = Number(value)
  return value.trim() !== '' && !Number.isNaN(n) && n >= 0
}
const isValidStock = (value: string) => {
  if (value.trim() === '') return true
  const n = Number(value)
  return Number.isInteger(n) && n >= 0
}

/**
 * Turn a draft into the PUT body, or say what is wrong with it. Mirrors the
 * server's rules so the seller hears about a problem before the round trip;
 * the server remains the authority.
 */
export function draftToInput(
  types: OptionTypeDraft[],
  rows: VariantDraft[],
): { input: StoreProductOptionsInput } | { error: string } {
  if (types.length > OPTION_LIMITS.types) {
    return { error: `Use at most ${OPTION_LIMITS.types} option types.` }
  }
  const names = types.map((type) => type.name.trim())
  if (names.some((name) => !name)) {
    return { error: 'Every option needs a name (e.g. Size, Colour).' }
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return { error: 'Option names must be unique.' }
  }
  for (const type of types) {
    const values = type.values.map((v) => v.value.trim())
    if (values.length === 0) {
      return { error: `Add at least one value for "${type.name.trim()}".` }
    }
    if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
      return { error: `Values must be unique within "${type.name.trim()}".` }
    }
  }
  const optionTypes: ProductOptionType[] = types.map((type) => ({
    name: type.name.trim(),
    values: type.values.map((v) => v.value.trim()),
  }))
  if (cartesianSize(optionTypes) > OPTION_LIMITS.variants) {
    return {
      error: `That makes ${cartesianSize(optionTypes)} combinations — the limit is ${OPTION_LIMITS.variants}.`,
    }
  }

  const missing = rowsNeedingPrice(rows)
  if (missing > 0) {
    return {
      error: `${missing} combination${missing === 1 ? ' still needs' : 's still need'} a price.`,
    }
  }
  const badStock = rows.find((row) => !isValidStock(row.stock))
  if (badStock) {
    return { error: `Stock for "${draftLabel(types, badStock)}" must be a whole number.` }
  }

  const variants: StoreVariantInput[] = rows.map((row) => {
    const optionValues: OptionValues = {}
    for (const type of types) {
      const value = type.values.find((v) => v.key === row.valueKeys[type.key])
      optionValues[type.name.trim()] = value?.value.trim() ?? ''
    }
    return {
      ...(row.id ? { id: row.id } : {}),
      optionValues,
      price: Number(row.price),
      stockQuantity: row.stock.trim() === '' ? 0 : Number(row.stock),
      isActive: row.isActive,
    }
  })

  return { input: { optionTypes, variants } }
}
