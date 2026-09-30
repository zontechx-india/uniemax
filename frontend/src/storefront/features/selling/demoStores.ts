import type { StoreThemeVars } from '../publicStore/storeTheme'

/**
 * Illustrative stores for the /sell page's phone mockups.
 *
 * Invented businesses with invented prices. They show what a storefront looks
 * like — across very different kinds of business, since the platform is
 * white-label — and never who sells on UnieMax: nothing on the page presents
 * them as real sellers, quotes them, or attaches a number to them.
 *
 * Product "photos" are emoji on a tile tinted from the store's own color:
 * zero bytes on a page most visitors open on mobile data, and they render in
 * every browser's emoji font.
 */

export interface DemoProduct {
  name: string
  emoji: string
  /** Selling price, rupees. */
  price: number
  /** MRP, when the product is on offer — shown struck through. */
  mrp?: number
}

export interface DemoStore {
  key: string
  /** The kind of business — the theme picker's label. */
  kind: string
  name: string
  /** The two Appearance colors, fed through the real `storeVars()`. */
  theme: StoreThemeVars
  banner: { eyebrow: string; title: string; subtitle: string }
  shelves: readonly [string, string, string]
  products: readonly [DemoProduct, DemoProduct, DemoProduct, DemoProduct]
}

export const DEMO_STORES: readonly DemoStore[] = [
  {
    key: 'fashion',
    kind: 'Fashion',
    name: 'Ananya Ethnic',
    theme: { backgroundColor: '#fdf8f6', primaryColor: '#9f1239' },
    banner: { eyebrow: 'New this week', title: 'The Festive Edit', subtitle: 'Kurtas, sarees & more' },
    shelves: ['Kurtas', 'Sarees', 'Jewellery'],
    products: [
      { name: 'Cotton kurta', emoji: '👗', price: 1299, mrp: 1799 },
      { name: 'Silk saree', emoji: '🥻', price: 3499, mrp: 4299 },
      { name: 'Embroidered potli', emoji: '👛', price: 599 },
      { name: 'Gold-plated ring', emoji: '💍', price: 449, mrp: 699 },
    ],
  },
  {
    key: 'sports',
    kind: 'Sports',
    name: 'Stride Sports',
    theme: { backgroundColor: '#f7f8fa', primaryColor: '#c2410c' },
    banner: { eyebrow: 'Season sale', title: 'Game-day ready', subtitle: 'Bats, shoes and kit' },
    shelves: ['Cricket', 'Running', 'Fitness'],
    products: [
      { name: 'English willow bat', emoji: '🏏', price: 6499, mrp: 7999 },
      { name: 'Running shoes', emoji: '👟', price: 2199, mrp: 2999 },
      { name: 'Training cap', emoji: '🧢', price: 399 },
      { name: 'Kit bag', emoji: '🎒', price: 1499, mrp: 1899 },
    ],
  },
  {
    key: 'bakery',
    kind: 'Bakery',
    name: 'Crumb Bakery',
    theme: { backgroundColor: '#fffaf3', primaryColor: '#92400e' },
    banner: { eyebrow: 'Baked today', title: 'Fresh from the oven', subtitle: 'Order cakes a day ahead' },
    shelves: ['Cakes', 'Cookies', 'Breads'],
    products: [
      { name: 'Chocolate truffle cake', emoji: '🎂', price: 899 },
      { name: 'Cupcakes, box of 6', emoji: '🧁', price: 480, mrp: 540 },
      { name: 'Butter cookies', emoji: '🍪', price: 260 },
      { name: 'Butter croissant', emoji: '🥐', price: 120 },
    ],
  },
  {
    key: 'electronics',
    kind: 'Electronics',
    name: 'Volt Gadgets',
    theme: { backgroundColor: '#f6f8fc', primaryColor: '#1d4ed8' },
    banner: { eyebrow: 'Top deals', title: 'Sound, sorted', subtitle: 'Headphones, watches & more' },
    shelves: ['Audio', 'Wearables', 'Chargers'],
    products: [
      { name: 'Wireless headphones', emoji: '🎧', price: 2999, mrp: 4499 },
      { name: 'Smartwatch', emoji: '⌚', price: 3499, mrp: 4999 },
      { name: 'Phone case', emoji: '📱', price: 349 },
      { name: 'Fast charger', emoji: '🔌', price: 799, mrp: 999 },
    ],
  },
  {
    key: 'groceries',
    kind: 'Groceries',
    name: 'Green Basket',
    theme: { backgroundColor: '#f5fbf6', primaryColor: '#15803d' },
    banner: { eyebrow: 'Farm fresh', title: 'From farm to door', subtitle: 'Fruits, greens & staples' },
    shelves: ['Fruits', 'Vegetables', 'Staples'],
    products: [
      { name: 'Alphonso mangoes, 1 kg', emoji: '🥭', price: 399, mrp: 499 },
      { name: 'Fresh spinach', emoji: '🥬', price: 40 },
      { name: 'Wild honey', emoji: '🍯', price: 349 },
      { name: 'Tender coconut', emoji: '🥥', price: 60 },
    ],
  },
]

/** `₹1,299` — Indian digit grouping, whole rupees (every demo price is). */
export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}
