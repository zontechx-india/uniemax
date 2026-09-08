import { call, http } from '../../../shared/auth/http'
import type { CartItem, CartLineStatus } from './cart'

/**
 * The signed-in customer's server cart (`/api/v1/cart`).
 *
 * Every endpoint answers with the WHOLE cart, priced and captioned from the
 * live catalog — so a write and a read cost the same round trip and a client
 * never has to guess what its own push produced.
 *
 * The wire uses the backend's vocabulary (`quantity`); `toCartItem` adapts it
 * to the local store's (`qty`), the same raw→normalize split the store API
 * uses. Prices arrive as decimal strings and stay strings: they are displayed
 * and compared, never used to compute a total the server has not quoted.
 */

const CART = '/api/v1/cart'

/** Why a line cannot be bought — the server's reason, kept for future UI. */
export type CartUnavailableReason =
  | 'STORE_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'OUT_OF_STOCK'

interface RawCartLine {
  id: string
  storeSlug: string
  storeName: string
  productId: string
  productSlug: string
  name: string
  variantId: string | null
  variantName: string | null
  imageUrl: string | null
  price: string
  /** Zero for anything unbuyable, whatever `unavailableReason` says. */
  stockQuantity: number
  quantity: number
  status: CartLineStatus
  priceAtAdd: string
  unavailableReason: CartUnavailableReason | null
  metadata: Record<string, unknown> | null
  addedAt: string
}

interface RawCart {
  lines: RawCartLine[]
  metadata: Record<string, unknown> | null
  updatedAt: string | null
}

/** A line as the server accepts it: a reference, a quantity, an intent. */
interface CartLinePayload {
  productId: string
  variantId: string | null
  quantity: number
  status: CartLineStatus
  metadata: Record<string, unknown> | null
}

/**
 * Server line → local cart line. Everything renderable comes from the server
 * response, so hydrating a fresh device needs no follow-up product fetches.
 */
function toCartItem(line: RawCartLine): CartItem {
  return {
    productId: line.productId,
    variantId: line.variantId,
    storeSlug: line.storeSlug,
    storeName: line.storeName,
    name: line.name,
    productSlug: line.productSlug,
    variantName: line.variantName,
    imageUrl: line.imageUrl,
    price: line.price,
    stockQuantity: line.stockQuantity,
    qty: line.quantity,
    status: line.status,
    priceAtAdd: line.priceAtAdd,
    metadata: line.metadata,
  }
}

/**
 * Local cart line → server line. Deliberately drops every snapshot (name,
 * price, image, store): the server resolves those from the catalog, and a
 * client that could send them could send the wrong ones.
 */
export function toCartLinePayload(item: CartItem): CartLinePayload {
  return {
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.qty,
    status: item.status,
    metadata: item.metadata,
  }
}

export const cartApi = {
  /** The stored cart, re-priced. */
  async get(): Promise<CartItem[]> {
    return (await call<RawCart>(http.get(CART))).lines.map(toCartItem)
  },

  /**
   * Mirror the local cart. A replace, not a patch — one authoritative write
   * means a removal propagates as naturally as an addition.
   */
  async replace(items: CartItem[]): Promise<CartItem[]> {
    const body = { lines: items.map(toCartLinePayload) }
    return (await call<RawCart>(http.put(CART, body))).lines.map(toCartItem)
  },

  /**
   * Union the local (guest) cart into the stored one — the sign-in
   * reconciliation. Quantities are taken pairwise as the larger of the two
   * server-side, so signing in never costs the shopper an item and signing
   * out and back in never doubles one.
   */
  async merge(items: CartItem[]): Promise<CartItem[]> {
    const body = { lines: items.map(toCartLinePayload) }
    return (await call<RawCart>(http.post(`${CART}/merge`, body))).lines.map(
      toCartItem,
    )
  },

  /** Empty the stored cart everywhere. */
  async clear(): Promise<CartItem[]> {
    return (await call<RawCart>(http.delete(CART))).lines.map(toCartItem)
  },

  /** Empty one store's lines, leaving the other stores' baskets alone. */
  async clearStore(storeSlug: string): Promise<CartItem[]> {
    return (
      await call<RawCart>(http.delete(`${CART}/stores/${storeSlug}`))
    ).lines.map(toCartItem)
  },
}
