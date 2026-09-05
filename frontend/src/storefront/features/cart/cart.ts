import { useSyncExternalStore } from 'react'
import { trackAddToCart } from '../../../shared/analytics/metaPixel'

/**
 * Shopping cart — client-side, localStorage-backed. Public store pages are
 * anonymous (no session), so the cart lives entirely in the browser and
 * survives reloads. One cart spans every store the visitor shops from;
 * items are grouped by store for display (and, later, per-store checkout).
 *
 * Each item snapshots the product fields it needs to render (name, price,
 * store name…), so cart pages work without refetching every store.
 */

export interface CartItem {
  /** Composite identity: a product (+ chosen variant) inside one store. */
  productId: string
  /** Chosen variant id — null for products without variants. */
  variantId: string | null
  storeSlug: string
  /** Snapshots for rendering the cart without refetching stores. */
  storeName: string
  name: string
  /**
   * Product URL slug — links the line back to its product page and lets the
   * cart revalidate price/stock. Always present: lines saved by builds that
   * predate it are dropped on load, because without a slug a line can never
   * navigate, revalidate, or show a thumbnail again.
   */
  productSlug: string
  /** Variant label ("Red / 128 GB") — null for products without variants. */
  variantName: string | null
  /** Cover-image URL snapshot — null when the product has no photo. */
  imageUrl: string | null
  /** Decimal string as served by the API (variant price when applicable). */
  price: string
  /** Stock at the time of adding — caps the quantity stepper. */
  stockQuantity: number
  qty: number
}

export interface CartStoreGroup {
  storeSlug: string
  storeName: string
  items: CartItem[]
  itemCount: number
  subtotal: number
}

const STORAGE_KEY = 'uniemax.cart.v1'

// ---------------------------------------------------------------------------
// Tiny external store: localStorage is the source of truth; React components
// subscribe via useCart(). The `storage` event keeps other tabs in sync.
// ---------------------------------------------------------------------------

let items: CartItem[] = load()
const listeners = new Set<() => void>()

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CartItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as CartItem).productId === 'string' &&
          typeof (item as CartItem).storeSlug === 'string' &&
          // Slug-less lines (saved by pre-slug builds) are dead rows: they
          // can't link to their product or be revalidated — drop them.
          typeof (item as CartItem).productSlug === 'string' &&
          typeof (item as CartItem).qty === 'number' &&
          (item as CartItem).qty > 0,
      )
      // Items saved before variants/images existed lack those fields.
      .map((item) => ({
        ...item,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        imageUrl: item.imageUrl ?? null,
      }))
  } catch {
    return []
  }
}

function commit(next: CartItem[]) {
  items = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked — the in-memory cart still works for this visit.
  }
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      items = load()
      listeners.forEach((notify) => notify())
    }
  })
}

const keyOf = (
  storeSlug: string,
  productId: string,
  variantId: string | null,
) => `${storeSlug} ${productId} ${variantId ?? ''}`

const itemKey = (i: CartItem) => keyOf(i.storeSlug, i.productId, i.variantId)

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const cart = {
  /** Current items (non-reactive) — for one-shot reads like revalidation. */
  items(): CartItem[] {
    return items
  },

  /**
   * Add `qty` units (or create the line) — capped at the snapshotted stock.
   * The product page's quantity selector adds several at once; every other
   * caller adds one.
   */
  add(item: Omit<CartItem, 'qty'>, qty = 1) {
    // Meta AddToCart lives here rather than on the button, so no present or
    // future caller can put something in the cart without being counted.
    trackAddToCart(
      {
        id: item.productSlug,
        price: Number(item.price),
        quantity: Math.max(1, Math.min(qty, item.stockQuantity)),
      },
      item.name,
    )
    const key = keyOf(item.storeSlug, item.productId, item.variantId)
    const existing = items.find((i) => itemKey(i) === key)
    if (existing) {
      cart.setQty(
        item.storeSlug,
        item.productId,
        item.variantId,
        existing.qty + qty,
      )
      return
    }
    const clamped = Math.max(1, Math.min(qty, item.stockQuantity))
    commit([...items, { ...item, qty: clamped }])
  },

  /** Set a line's quantity; 0 removes it. Clamped to [0, stock]. */
  setQty(
    storeSlug: string,
    productId: string,
    variantId: string | null,
    qty: number,
  ) {
    const key = keyOf(storeSlug, productId, variantId)
    const next = items
      .map((i) => {
        if (itemKey(i) !== key) return i
        const clamped = Math.max(0, Math.min(qty, i.stockQuantity))
        return { ...i, qty: clamped }
      })
      .filter((i) => i.qty > 0)
    commit(next)
  },

  remove(storeSlug: string, productId: string, variantId: string | null) {
    const key = keyOf(storeSlug, productId, variantId)
    commit(items.filter((i) => itemKey(i) !== key))
  },

  /** Remove every item belonging to one store. */
  clearStore(storeSlug: string) {
    commit(items.filter((i) => i.storeSlug !== storeSlug))
  },

  /**
   * Empty the whole cart across every store.
   *
   * Called on **explicit logout** (`StorefrontApp`): the cart is device-local,
   * so without this the next person to use the browser inherits the previous
   * customer's basket. Deliberately NOT called when a session merely expires
   * — a 401 mid-checkout bounces to `/login` and the shopper must get their
   * cart back after signing in again.
   */
  clear() {
    if (items.length === 0) return // don't notify subscribers for a no-op
    commit([])
  },

  /**
   * Apply fresh price/stock (from the API) to matching lines — the cart-open
   * revalidation. Quantities are clamped down to the new stock (an
   * out-of-stock line keeps its qty so it stays visible with a warning rather
   * than vanishing silently). Returns how many lines actually changed.
   */
  sync(
    updates: {
      storeSlug: string
      productId: string
      variantId: string | null
      price: string
      stockQuantity: number
      /** Fresh cover-image URL; omitted = keep the snapshot. */
      imageUrl?: string | null
      /** Fresh variant label (a seller renamed a value); omitted = keep. */
      variantName?: string | null
    }[],
  ): number {
    const byKey = new Map(
      updates.map((u) => [keyOf(u.storeSlug, u.productId, u.variantId), u]),
    )
    let changed = 0
    let dirty = false
    const next = items.map((item) => {
      const update = byKey.get(itemKey(item))
      if (!update) return item
      const qty =
        update.stockQuantity > 0
          ? Math.min(item.qty, update.stockQuantity)
          : item.qty
      const imageUrl =
        update.imageUrl === undefined ? item.imageUrl : update.imageUrl
      const variantName =
        update.variantName === undefined ? item.variantName : update.variantName
      const priceOrStockChanged =
        update.price !== item.price ||
        update.stockQuantity !== item.stockQuantity ||
        qty !== item.qty
      if (
        !priceOrStockChanged &&
        imageUrl === item.imageUrl &&
        variantName === item.variantName
      ) {
        return item
      }
      // A refreshed thumbnail or label is persisted but not *reported* — the
      // changed count feeds the "prices or stock changed" note, which would
      // mislead.
      if (priceOrStockChanged) changed += 1
      dirty = true
      return {
        ...item,
        price: update.price,
        stockQuantity: update.stockQuantity,
        qty,
        imageUrl,
        variantName,
      }
    })
    if (dirty) commit(next)
    return changed
  },
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function lineTotal(item: CartItem): number {
  const price = Number(item.price)
  return Number.isNaN(price) ? 0 : price * item.qty
}

/**
 * Group items by store, preserving the order stores were first added in.
 * Lines revalidated to stock 0 stay listed (so the customer sees them) but
 * are excluded from counts and subtotals — they can't be bought.
 */
export function groupByStore(all: CartItem[]): CartStoreGroup[] {
  const groups = new Map<string, CartStoreGroup>()
  for (const item of all) {
    let group = groups.get(item.storeSlug)
    if (!group) {
      group = {
        storeSlug: item.storeSlug,
        storeName: item.storeName,
        items: [],
        itemCount: 0,
        subtotal: 0,
      }
      groups.set(item.storeSlug, group)
    }
    group.items.push(item)
    if (item.stockQuantity > 0) {
      group.itemCount += item.qty
      group.subtotal += lineTotal(item)
    }
  }
  return [...groups.values()]
}

/** Reactive cart contents — re-renders on any cart change (any tab). */
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

/** Reactive line for one product/variant in one store (0 qty when absent). */
export function useCartQty(
  storeSlug: string,
  productId: string,
  variantId: string | null,
): number {
  const all = useCart()
  return (
    all.find(
      (i) =>
        i.storeSlug === storeSlug &&
        i.productId === productId &&
        i.variantId === variantId,
    )?.qty ?? 0
  )
}
