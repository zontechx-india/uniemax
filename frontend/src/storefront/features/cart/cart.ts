import { useSyncExternalStore } from 'react'
import { trackAddToCart } from '../../../shared/analytics/metaPixel'

/**
 * Shopping cart — the LOCAL half.
 *
 * localStorage is the hot path: public store pages are anonymous, so a guest
 * must be able to fill a cart with no account, and every +/- tap has to land
 * instantly whatever the network is doing. One cart spans every store the
 * visitor shops from; items are grouped by store for display and checked out
 * one store at a time.
 *
 * Each item snapshots the product fields it needs to render (name, price,
 * store name…), so cart pages work without refetching every store.
 *
 * While a customer is SIGNED IN this cart is mirrored to the server
 * (`cartSync.ts` → `/api/v1/cart`), which is what makes it survive a new
 * device or a cleared browser. This module stays deliberately unaware of
 * that: it owns local state and notifies subscribers, and the sync layer is
 * just another subscriber. Keeping the dependency one-way is what lets the
 * cart work identically for guests, offline, and mid-sign-in.
 */

/**
 * Which basket a line sits in. ACTIVE is what the badge counts and checkout
 * prices; SAVED is the parking lot a "Save for later" / wishlist feature
 * fills. Mirrors `CartLineStatus` in the Prisma schema, so a line survives a
 * server round trip unchanged.
 */
export type CartLineStatus = 'ACTIVE' | 'SAVED'

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
  /** Active basket vs. parked (save-for-later). Defaults to ACTIVE. */
  status: CartLineStatus
  /**
   * What the line cost when it was first added, as the server recorded it —
   * present only for lines that have been through a sync. Never used to
   * charge (checkout always re-prices); it exists so the cart can say "₹200
   * cheaper than when you added this".
   */
  priceAtAdd: string | null
  /**
   * Per-line extras a future product page may attach — gift wrap, engraving
   * text, a subscription interval. Round-trips to `CartLine.metadata`
   * verbatim, so a new option is a field here and nothing else.
   */
  metadata: Record<string, unknown> | null
}

/**
 * What a caller supplies to `cart.add`: the line's identity and render
 * snapshot. The forward-compatible fields are optional — a product page that
 * knows nothing about saved-for-later or gift wrap keeps calling `add` with
 * exactly what it always did.
 */
export type CartItemDraft = Omit<
  CartItem,
  'qty' | 'status' | 'priceAtAdd' | 'metadata'
> &
  Partial<Pick<CartItem, 'status' | 'priceAtAdd' | 'metadata'>>

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
      // Items saved before variants/images/status existed lack those fields.
      .map((item) => ({
        ...item,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        imageUrl: item.imageUrl ?? null,
        status: item.status ?? 'ACTIVE',
        priceAtAdd: item.priceAtAdd ?? null,
        metadata: item.metadata ?? null,
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

/**
 * Subscribe to cart changes outside React — how `cartSync` learns that the
 * cart moved. Same listener set `useCart` uses, so a change from any source
 * (a tap, another tab, a sync) reaches both.
 */
export function subscribeToCart(notify: () => void): () => void {
  return subscribe(notify)
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
  add(item: CartItemDraft, qty = 1) {
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
    commit([
      ...items,
      {
        status: 'ACTIVE',
        priceAtAdd: null,
        metadata: null,
        ...item,
        qty: clamped,
      },
    ])
  },

  /**
   * Swap the entire cart for a known-good set of lines — how `cartSync`
   * applies what the server returned at sign-in or on a fresh device.
   *
   * A plain assignment, NOT a merge: reconciling the two carts already
   * happened server-side (`POST /cart/merge`), and doing it again here would
   * resurrect lines the shopper removed on another device. Callers that mean
   * "combine" must merge before calling.
   */
  replaceAll(next: CartItem[]) {
    commit(next)
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
   * Empty the LOCAL cart across every store. The server copy is untouched —
   * this is a "clear this browser", never a "discard my cart".
   *
   * Called on **explicit logout** (`StorefrontApp`), which stops the sync
   * first: without the clear, the next person to use the browser inherits
   * the previous customer's basket; without stopping the sync first, the
   * clear would be mirrored and destroy the account's cart on every device.
   * Signing back in restores it from the server.
   *
   * Deliberately NOT called when a session merely expires — a 401
   * mid-checkout bounces to `/login` and the shopper must get their cart
   * back after signing in again.
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
    // Parked lines (save-for-later) are not part of the basket being bought,
    // so they never reach a store group — and therefore never a count, a
    // subtotal or a checkout payload.
    if (item.status !== 'ACTIVE') continue
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

/**
 * Reactive line for one product/variant in one store (0 qty when absent).
 * Counts the ACTIVE basket only — a parked line is not "in your cart".
 */
export function useCartQty(
  storeSlug: string,
  productId: string,
  variantId: string | null,
): number {
  const all = useCart()
  return (
    all.find(
      (i) =>
        i.status === 'ACTIVE' &&
        i.storeSlug === storeSlug &&
        i.productId === productId &&
        i.variantId === variantId,
    )?.qty ?? 0
  )
}
