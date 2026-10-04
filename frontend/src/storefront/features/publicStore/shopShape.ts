import {
  formatPrice,
  type PublicCategory,
  type PublicProduct,
  type PublicStore,
} from '../stores/storesApi'

/**
 * What KIND of shop this is, read from what it actually has — so every
 * storefront page can look right for a one-product seller and a
 * thousand-product one without either of them configuring anything.
 *
 * Most UnieMax sellers list a handful of products under one category. A
 * homepage built for a big catalogue (a category picker, a shelf per
 * category, then "All products") shows such a shop's few products two or
 * three times and offers choices with only one answer. These helpers are the
 * single place the storefront asks "how big is this shop?".
 */

/**
 * The homepage payload's product sections hold up to this many products
 * (`SECTION_LIMIT` in `publicStore.service.ts`). A shop at or under it is
 * fully contained in the "All products" section, so its homepage can simply
 * show everything once.
 */
export const SMALL_SHOP_MAX = 12

export type ShopSize = 'one' | 'small' | 'full'

/** Visible products across the whole shop (a category counts its subtree). */
export function shopProductCount(store: PublicStore): number {
  return store.categories.reduce((sum, category) => sum + category.productCount, 0)
}

export function shopSize(store: PublicStore): ShopSize {
  const count = shopProductCount(store)
  if (count <= 1) return 'one'
  if (count <= SMALL_SHOP_MAX) return 'small'
  return 'full'
}

/**
 * The categories worth offering as a CHOICE. A chain with only one branch —
 * "Office & Business › Printing", where everything sits in Printing — is
 * walked down to where the shop really splits, so a customer never taps
 * through a level that has one option. Fewer than two results means there is
 * nothing to choose between, and callers hide their category picker.
 */
export function browsableCategories(categories: PublicCategory[]): PublicCategory[] {
  let level = categories
  while (level.length === 1 && level[0]!.subcategories.length > 0) {
    level = level[0]!.subcategories
  }
  return level
}

/** A category anywhere in the tree, by id. */
export function findCategory(
  categories: PublicCategory[],
  id: string,
): PublicCategory | null {
  for (const category of categories) {
    if (category.id === id) return category
    const nested = findCategory(category.subcategories, id)
    if (nested) return nested
  }
  return null
}

/** The slugs of a category and everything beneath it. */
function subtreeSlugs(category: PublicCategory): Set<string> {
  const slugs = new Set<string>([category.slug])
  for (const sub of category.subcategories) {
    for (const slug of subtreeSlugs(sub)) slugs.add(slug)
  }
  return slugs
}

/**
 * The picture for a category tile: the shelf's own artwork, else the cover
 * of one of its products the page already has — a real photo of what is on
 * that shelf, never a stock image. Null when neither exists.
 */
export function categoryPicture(
  category: PublicCategory,
  products: PublicProduct[],
): string | null {
  if (category.imageUrl) return category.imageUrl
  const slugs = subtreeSlugs(category)
  return (
    products.find((product) => product.image?.url && slugs.has(product.category.slug))
      ?.image?.url ?? null
  )
}

/**
 * Abbreviations that contain a vowel and so cannot be told from a word by
 * shape. Everything here stays in capitals; so does any word with no vowel
 * at all (TV, XL, XXL, PVC, CCTV, GST, 250ML's "ML").
 */
const ACRONYMS = new Set([
  'LED', 'OLED', 'AMOLED', 'USB', 'HDMI', 'AC', 'SIM', 'UPS', 'ABS', 'EVA', 'PU',
  'PET', 'OTG', 'UV', 'ID', 'OEM', 'AI', 'IOT', 'SUV', 'AUX', 'IPS', 'UHD', 'PDF',
  'USA', 'UK', 'EU', 'BIS', 'ISI', 'ISO', 'MRP', 'COD', 'DIY', 'NEO',
])

/** Joining words, lower-case inside a title ("Set of 2", "Box for Gifts"). */
const CONNECTORS = new Set(['AN', 'AND', 'THE', 'FOR', 'OF', 'WITH', 'IN', 'ON', 'TO', 'BY', 'OR'])

/**
 * A product name as a customer should read it. Many sellers type names in
 * capitals ("GLEN FOOD CONTAINER"), which reads as shouting and is harder to
 * scan; a name with NO lowercase letter at all is shown in Title Case
 * ("Glen Food Container"), keeping abbreviations ("LED TV 32 INCH" → "LED TV
 * 32 Inch"). Any name with a lowercase letter is the seller's deliberate
 * styling and is shown exactly as typed. Display only — the stored name, URLs
 * and search are untouched.
 */
export function displayName(name: string): string {
  if (/[a-z]/.test(name) || !/[A-Z]{2}/.test(name)) return name
  return name.replace(/[A-Z][A-Z'’]*/g, (word, offset: number) => {
    if (ACRONYMS.has(word) || !/[AEIOUY]/.test(word)) return word
    if (offset > 0 && CONNECTORS.has(word)) return word.toLowerCase()
    return word.charAt(0) + word.slice(1).toLowerCase()
  })
}

export interface TrustFact {
  key: 'cod' | 'delivery' | 'pickup' | 'online'
  label: string
}

/**
 * Reassurance a customer needs before buying from a shop they do not know —
 * each one read from a real setting of THIS store, never a generic claim.
 */
export function trustFacts(store: PublicStore): TrustFact[] {
  const facts: TrustFact[] = []
  const { mode, rate } = store.shipping
  if (mode !== 'PICKUP') {
    facts.push({
      key: 'delivery',
      label:
        rate.type === 'FREE'
          ? 'Free delivery'
          : rate.freeAbove !== null
            ? `Free delivery above ${formatPrice(rate.freeAbove)}`
            : `Delivery ${formatPrice(rate.amount)}`,
    })
  }
  if (store.payments.acceptCod) facts.push({ key: 'cod', label: 'Cash on delivery' })
  if (store.payments.acceptOnlinePayment) facts.push({ key: 'online', label: 'Pay by UPI or card' })
  if (mode !== 'DELIVERY') facts.push({ key: 'pickup', label: 'Pick up from the shop' })
  return facts
}
