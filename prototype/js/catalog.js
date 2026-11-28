// Catalog — a store-sized catalog shaped like the real one. Shared by all apps.
//
// Mirrors backend/prisma/schema/core.prisma:
//   StoreCategory  a tree (parentId), every product sits in one category
//   StoreProduct   name, sku, isActive (here `visible`), category
//   StoreProductVariant  the unit of sale: price, mrp (compareAtPrice), stock,
//                  sku, optionValues ({ Size: 'M' }). A product with no options
//                  still has exactly ONE variant, flagged isDefault.
//
// Older screens read p.price / p.stock / p.category; those stay as summaries
// (lowest price, total stock, category name) and Catalog.recompute keeps them
// in step whenever a variant's stock changes.
//
//   buildCatalog(...)   deterministic demo catalog (same every reset): 24
//                       categories, ~1,050 products for Lakshmi Silk Sarees
//   Catalog.*           lookups, stock changes, search, "often billed"

// Leaf: [name, code, the product word, [min, max] price, sizes, how many, colours]
// `colours` > 0 makes Colour × Size products (two option types, like the real
// optionTypes: [{ name: 'Colour', values }, { name: 'Size', values }]).
const SIZES = {
  blouse: ['32', '34', '36', '38', '40'],
  letter: ['S', 'M', 'L', 'XL', 'XXL'],
  kids: ['1–2 Y', '3–4 Y', '5–6 Y', '7–8 Y'],
  shirt: ['38', '40', '42', '44'],
}
const CATALOG_TREE = [
  ['Sarees', [
    ['Kanchipuram silk', 'KS', 'Kanchipuram Silk Saree', [8999, 32999], null, 70],
    ['Soft silk', 'SS', 'Soft Silk Saree', [2999, 7999], null, 60],
    ['Banarasi', 'BN', 'Banarasi Saree', [2499, 14999], null, 55],
    ['Cotton', 'CT', 'Cotton Saree', [899, 2499], null, 70],
    ['Silk cotton', 'SC', 'Silk Cotton Saree', [1799, 4499], null, 55],
    ['Linen', 'LN', 'Linen Saree', [1999, 4999], null, 40],
    ['Organza', 'OR', 'Organza Saree', [2299, 5999], null, 40],
    ['Georgette', 'GE', 'Georgette Saree', [1299, 3499], null, 45],
    ['Chiffon', 'CH', 'Chiffon Saree', [1199, 2999], null, 35],
    ['Kerala kasavu', 'KK', 'Kasavu Saree', [1499, 4999], null, 35],
  ]],
  ['Blouses', [
    ['Ready-made blouses', 'RB', 'Ready-made Blouse', [599, 1999], 'blouse', 60],
    ['Blouse pieces', 'BP', 'Blouse Piece', [299, 999], null, 50],
    ['Designer blouses', 'DB', 'Designer Blouse', [1499, 4999], 'blouse', 35],
  ]],
  ['Dress materials', [
    ['Churidar sets', 'CU', 'Churidar Set', [999, 3499], null, 40],
    ['Kurtis', 'KU', 'Kurti', [699, 2499], 'letter', 60, 3],
    ['Dupattas', 'DU', 'Dupatta', [399, 1999], null, 40],
  ]],
  ['Kids', [
    ['Pattu pavadai', 'PP', 'Pattu Pavadai', [1299, 3999], 'kids', 45],
    ['Frocks', 'FR', 'Silk Frock', [599, 1799], 'kids', 35],
    ['Dhoti sets', 'KD', 'Kids Dhoti Set', [799, 1999], 'kids', 25],
  ]],
  ['Men', [
    ['Silk dhotis', 'SD', 'Silk Dhoti', [1499, 5999], null, 30],
    ['Shirts', 'SH', 'Silk Shirt', [899, 2499], 'shirt', 40, 4],
    ['Veshti sets', 'VS', 'Veshti Set', [999, 3499], null, 25],
  ]],
  ['Home & gifts', [
    ['Return gifts', 'RG', 'Return Gift Pouch', [99, 699], null, 30],
    ['Pooja items', 'PI', 'Pooja Thali', [149, 1499], null, 25],
  ]],
]
const COLOURS = [
  ['Peacock Blue', '#1d4e89'], ['Rani Pink', '#c2185b'], ['Mustard', '#c99700'], ['Maroon', '#800020'],
  ['Bottle Green', '#1b5e20'], ['Mango Yellow', '#e0a800'], ['Wine', '#6d1b3a'], ['Navy', '#1a237e'],
  ['Parrot Green', '#4c9a2a'], ['Lavender', '#8e7cc3'], ['Coral', '#e5735c'], ['Teal', '#00796b'],
  ['Magenta', '#a0195f'], ['Ivory', '#d9cfb4'], ['Black', '#262626'], ['Rust', '#a4441c'],
  ['Mint', '#5fa88a'], ['Onion Pink', '#c98a95'], ['Royal Blue', '#2848a8'], ['Sandal', '#c8a97e'],
]
const MOTIFS = [
  'Temple Border', 'Zari Checks', 'Butta Weave', 'Floral Jaal', 'Plain Body', 'Contrast Pallu',
  'Mango Motif', 'Rudraksha Border', 'Thin Stripes', 'Kalamkari Print', 'Peacock Motif', 'Korvai Border',
]

/** Small seeded random — the demo catalog is identical on every reset. */
function seeded(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every combination of the option values, in type order (productOptions.ts `cartesian`). */
function cartesian(optionTypes) {
  return optionTypes.reduce((acc, t) => acc.flatMap((o) => t.values.map((v) => ({ ...o, [t.name]: v }))), [{}])
}

/**
 * A product's variants: one default, or one per option combination. With two
 * option types some combinations are not sold at all (the seller lists only
 * what they have), so the picker has to grey them out. The name is the values
 * joined in type order ("Maroon / M"), as the real app derives it.
 */
function makeVariants(pid, sku, price, mrp, stock, optionTypes, rnd) {
  if (!optionTypes || optionTypes.length === 0) return [{ id: `${pid}_v`, name: 'Default', options: null, isDefault: true, price, mrp, stock, sku }]
  const combos = cartesian(optionTypes)
  const kept = rnd && optionTypes.length > 1 ? combos.filter((_, i) => i === 0 || rnd() > 0.18) : combos
  return kept.map((options, i) => ({
    id: `${pid}_v${i + 1}`, name: Object.values(options).join(' / '), options, isDefault: false, price, mrp,
    stock: rnd ? Math.floor(rnd() * 9) : Math.max(0, Math.round(stock / kept.length) + (i === 0 ? stock % kept.length : 0)),
    sku: `${sku}-${Object.values(options).map((v) => v.replace(/\W+/g, '').slice(0, 4).toUpperCase()).join('-')}`,
  }))
}
const sizeType = (sizeKey) => (sizeKey ? [{ name: 'Size', values: SIZES[sizeKey] }] : [])

/**
 * The demo catalog. `base` are the hand-written products the demo orders use
 * (p1–p8): they are placed into the tree and get variants too.
 */
function buildCatalog({ storeId, ago, D, base }) {
  const rnd = seeded(20261124)
  const categories = []
  const products = []
  const leafByCode = {}
  CATALOG_TREE.forEach(([parentName, leaves], pi) => {
    const parentId = `cat_p${pi + 1}`
    categories.push({ id: parentId, storeId, parentId: null, name: parentName, isActive: true, order: pi })
    leaves.forEach(([name, code, word, [lo, hi], sizeKey, howMany, colours = 0], li) => {
      const id = `cat_${code}`
      const leaf = { id, storeId, parentId, name, isActive: true, order: li }
      categories.push(leaf)
      leafByCode[code] = { leaf, word, sizeKey }
      for (let n = 1; n <= howMany; n++) {
        const [colour, tone] = COLOURS[Math.floor(rnd() * COLOURS.length)]
        const motif = MOTIFS[(n * 7 + li * 3) % MOTIFS.length]
        const price = Math.round((lo + rnd() * (hi - lo)) / 50) * 50 - 1
        const mrp = Math.round((price * (1.1 + rnd() * 0.25)) / 50) * 50 - 1
        const pid = `p_${code}${n}`
        const sku = `${code}-${String(1000 + n)}`
        const stock = rnd() < 0.05 ? 0 : 6 + Math.floor(rnd() * 22)
        // Colour × Size: the colour is an option, so it leaves the name.
        const colourValues = colours
          ? [...new Set(Array.from({ length: colours + 2 }, () => COLOURS[Math.floor(rnd() * COLOURS.length)][0]))].slice(0, colours)
          : null
        const optionTypes = colourValues ? [{ name: 'Colour', values: colourValues }, ...sizeType(sizeKey)] : sizeType(sizeKey)
        const variants = makeVariants(pid, sku, price, mrp, stock, optionTypes, sizeKey ? rnd : null)
        const firstTone = colourValues ? COLOURS.find((c) => c[0] === colourValues[0])[1] : tone
        products.push(Catalog.recompute({
          id: pid, storeId, categoryId: id, category: name, name: colourValues ? `${word} — ${motif}` : `${word} — ${colour}, ${motif}`, sku,
          tone: firstTone, visible: rnd() > 0.04, createdAt: ago((5 + Math.floor(rnd() * 200)) * D), source: 'CATALOG', optionTypes, variants,
        }))
      }
    })
  })

  // The hand-written products: same ids and prices, now inside the tree.
  const placeBase = { p1: 'KS', p2: 'SS', p3: 'BN', p4: 'CT', p5: 'KK', p6: 'SC', p7: 'RB', p8: 'PP' }
  const placed = base.map((p) => {
    const { leaf, sizeKey } = leafByCode[placeBase[p.id]]
    const sku = `${placeBase[p.id]}-0${p.id.slice(1)}`
    const optionTypes = sizeType(sizeKey)
    const variants = makeVariants(p.id, sku, p.price, p.mrp, p.stock, optionTypes, null)
    return Catalog.recompute({ ...p, categoryId: leaf.id, category: leaf.name, sku, source: 'CATALOG', optionTypes, variants })
  })
  return { categories, products: [...placed, ...products] }
}

// ===========================================================================
// Catalog — lookups and rules
// ===========================================================================

const Catalog = {
  categories: (db, storeId) => (db.categories || []).filter((c) => c.storeId === storeId),
  category: (db, id) => (db.categories || []).find((c) => c.id === id) || null,
  children: (db, id) => (db.categories || []).filter((c) => c.parentId === id).sort((a, b) => a.order - b.order),
  /** "Sarees › Soft silk" */
  path(db, id) {
    const c = Catalog.category(db, id)
    if (!c) return ''
    const parent = c.parentId && Catalog.category(db, c.parentId)
    return parent ? `${parent.name} › ${c.name}` : c.name
  },
  product: (db, id) => db.products.find((p) => p.id === id) || null,
  variant(db, productId, variantId) {
    const p = Catalog.product(db, productId)
    return p ? p.variants.find((v) => v.id === variantId) || null : null
  },
  /** One default variant = no choices to make. */
  isSimple: (p) => p.variants.length === 1 && p.variants[0].isDefault,
  /** "Size M" for one option, "Maroon / M" for several (the real derived name), '' for the default variant. */
  variantLabel(v) {
    if (!v || v.isDefault) return ''
    if (!v.options) return v.name
    const entries = Object.entries(v.options)
    return entries.length === 1 ? `${entries[0][0]} ${entries[0][1]}` : entries.map(([, val]) => val).join(' / ')
  },
  /** The product's option types, in order ([] for a product without options). */
  optionTypes: (p) => p.optionTypes || [],
  /** "3 colours · 5 sizes" */
  optionSummary: (p) => Catalog.optionTypes(p).map((t) => plural(t.values.length, t.name.toLowerCase())).join(' · '),

  /** Keep the product's summary (lowest price, total stock) in step with its variants. */
  recompute(p) {
    p.stock = p.variants.reduce((s, v) => s + v.stock, 0)
    const cheapest = p.variants.reduce((a, v) => (v.price < a.price ? v : a), p.variants[0])
    p.price = cheapest.price
    p.mrp = cheapest.mrp
    return p
  },

  /** Take stock from one variant (qty < 0 puts it back). Guarded like the real decrement. */
  take(db, productId, variantId, qty) {
    const p = Catalog.product(db, productId)
    const v = p && (p.variants.find((x) => x.id === variantId) || p.variants[0])
    if (!v) throw new Error('A product on this order no longer exists.')
    if (qty > 0 && v.stock < qty) throw new Error(`“${p.name}${v.isDefault ? '' : ` (${Catalog.variantLabel(v)})`}” just sold out.`)
    v.stock -= qty
    Catalog.recompute(p)
    return v
  },

  /** The first variant that can be sold (for simulated orders). */
  firstInStock: (p) => p.variants.find((v) => v.stock > 0) || null,

  /** The category and everything below it. */
  withChildren(db, catId) {
    const ids = new Set([catId])
    for (const c of db.categories || []) if (c.parentId === catId) ids.add(c.id)
    return ids
  },
  count(db, storeId, catId) {
    const ids = Catalog.withChildren(db, catId)
    return db.products.filter((p) => p.storeId === storeId && ids.has(p.categoryId)).length
  },

  /**
   * Seller-side search: every word must match the name, SKU (product or size)
   * or category. Names that START with the words rank first, then in-stock.
   */
  search(db, storeId, { q = '', catId = '' } = {}) {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const cats = catId ? Catalog.withChildren(db, catId) : null
    const out = []
    for (const p of db.products) {
      if (p.storeId !== storeId) continue
      if (cats && !cats.has(p.categoryId)) continue
      if (words.length) {
        const options = Catalog.optionTypes(p).map((t) => t.values.join(' ')).join(' ')
        const hay = `${p.name} ${p.sku || ''} ${p.variants.map((v) => v.sku || '').join(' ')} ${options} ${Catalog.path(db, p.categoryId)}`.toLowerCase()
        if (!words.every((w) => hay.includes(w))) continue
      }
      const name = p.name.toLowerCase()
      const rank = (words.length && name.startsWith(words[0]) ? 0 : 1) * 2 + (p.stock > 0 ? 0 : 1)
      out.push({ p, rank })
    }
    return out.sort((a, b) => a.rank - b.rank || b.p.createdAt.localeCompare(a.p.createdAt)).map((x) => x.p)
  },

  /**
   * What this store bills most: lines from its bills and orders, newest
   * first, one entry per variant. Most bills reuse a handful of items, so
   * this is the shortest way to them.
   */
  often(db, storeId, limit = 6) {
    const lines = [
      ...(db.bills || []).filter((b) => b.storeId === storeId).map((b) => ({ at: b.createdAt, items: b.items })),
      ...db.orders.filter((o) => o.storeId === storeId).map((o) => ({ at: o.placedAt, items: o.items })),
    ].sort((a, b) => b.at.localeCompare(a.at))
    const seen = new Map()
    for (const { items } of lines) {
      for (const i of items) {
        const p = Catalog.product(db, i.productId)
        if (!p || p.source === 'BILL_ITEM') continue
        const key = i.variantId || p.variants[0].id
        if (!seen.has(key)) seen.set(key, { p, v: p.variants.find((v) => v.id === key) || p.variants[0], times: 0 })
        seen.get(key).times += 1
      }
    }
    return [...seen.values()].slice(0, limit)
  },
}
