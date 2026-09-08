import { useEffect } from 'react'
import { cart, subscribeToCart } from './cart'
import type { CartItem } from './cart'
import { cartApi, toCartLinePayload } from './cartApi'

/**
 * Keeps the local cart and the signed-in customer's server cart in step.
 *
 * The contract, in one line: **the browser owns the cart; the server keeps
 * it.** localStorage stays the hot path — instant taps, guests, offline —
 * and this module mirrors it to `/api/v1/cart` so the basket survives a new
 * device, a cleared browser or a reinstalled app.
 *
 * Lifecycle, driven entirely by who is signed in:
 *
 *  1. **Sign-in / page load with a session.** One reconciliation:
 *     a non-empty local cart is MERGED into the account's (quantity-wise
 *     union, server-side), an empty one simply reads. Either way the result
 *     is applied locally, so both halves agree from that moment on.
 *  2. **While signed in.** Every local change is pushed as a whole-cart
 *     replace, debounced so a burst of stepper taps costs one request, and
 *     flushed when the tab is hidden so closing it never loses the last one.
 *  3. **Sign-out.** Pushing stops *before* the local clear, so emptying this
 *     browser never empties the account's cart.
 *
 * Nothing here blocks the UI and nothing here can fail loudly: a cart that
 * cannot reach the server is still a working cart, which is the whole reason
 * localStorage remains the source of truth rather than a cache.
 */

/** Coalescing window for pushes — long enough to swallow stepper bursts. */
const PUSH_DEBOUNCE_MS = 800

let syncingCustomerId: string | null = null
let unsubscribe: (() => void) | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
/**
 * Guards against applying a response that belongs to a session that has
 * since ended (sign-out, or a switch of account, while a request was in
 * flight). Every async step re-checks the generation it started in.
 */
let generation = 0
/** True once local and server are known to agree — pushing before this
 *  could overwrite another device's cart with a cart we never reconciled. */
let hydrated = false
/** What the server was last told, so an echo of our own write is not
 *  pushed straight back. */
let lastPushed: string | null = null

/**
 * A stable fingerprint of everything the server actually stores. Order- and
 * snapshot-independent: re-sorting the list, or a revalidation refreshing a
 * price or thumbnail, is not a change the server needs to hear about.
 */
function signature(items: CartItem[]): string {
  return JSON.stringify(
    items
      .map(toCartLinePayload)
      .map((line) => ({ ...line, key: `${line.productId}:${line.variantId ?? ''}` }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  )
}

function cancelPendingPush() {
  if (pushTimer !== undefined) {
    clearTimeout(pushTimer)
    pushTimer = undefined
  }
}

/**
 * Reconcile once, then start mirroring. A failure here leaves the sync
 * un-hydrated on purpose: the next local change retries instead of pushing,
 * so a cart we never reconciled can never overwrite the stored one.
 */
async function hydrate(customerId: string) {
  const mine = generation
  const local = cart.items()
  try {
    // A guest cart must not be thrown away, and an account cart must not be
    // thrown away either — so the only safe operation on a non-empty local
    // cart is the union. With nothing local there is nothing to reconcile.
    const server = local.length > 0 ? await cartApi.merge(local) : await cartApi.get()
    if (generation !== mine || syncingCustomerId !== customerId) return
    cart.replaceAll(server)
    lastPushed = signature(server)
    hydrated = true
  } catch {
    // Offline, or the session died between the probe and here. The local
    // cart is untouched and still fully usable; the next change retries.
    hydrated = false
  }
}

async function push(customerId: string) {
  const mine = generation
  const items = cart.items()
  const next = signature(items)
  if (next === lastPushed) return
  try {
    await cartApi.replace(items)
    if (generation !== mine || syncingCustomerId !== customerId) return
    // Record what we sent, NOT what came back: the response is re-priced and
    // may have dropped lines whose product vanished, and adopting it here
    // would clobber edits made during the round trip. The local cart learns
    // about vanished items from its own revalidation instead.
    lastPushed = next
  } catch {
    // Leave `lastPushed` alone so the next change retries this content.
  }
}

function schedulePush(customerId: string) {
  cancelPendingPush()
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    void push(customerId)
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Send anything pending right now — used when the tab is being hidden, which
 * is the last moment a closing browser reliably gives us.
 */
function flush() {
  if (syncingCustomerId === null || !hydrated || pushTimer === undefined) return
  cancelPendingPush()
  void push(syncingCustomerId)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flush()
}

/** Begin mirroring this customer's cart. Idempotent for the same customer. */
export function startCartSync(customerId: string) {
  if (syncingCustomerId === customerId) return
  stopCartSync()
  generation += 1
  syncingCustomerId = customerId
  hydrated = false
  lastPushed = null

  void hydrate(customerId)

  unsubscribe = subscribeToCart(() => {
    if (syncingCustomerId !== customerId) return
    // Not reconciled yet (first load still in flight, or it failed): retry
    // the reconciliation rather than pushing a cart we cannot trust.
    if (!hydrated) {
      void hydrate(customerId)
      return
    }
    schedulePush(customerId)
  })
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/**
 * Stop mirroring, immediately and without a final push. The stored cart is
 * left exactly as it is — this is "stop talking to the server", never "throw
 * my cart away".
 *
 * **Call this before clearing the local cart on sign-out.** Clearing first
 * would queue an empty cart as the next push and wipe the account's basket
 * on every device.
 */
export function stopCartSync() {
  generation += 1
  syncingCustomerId = null
  hydrated = false
  lastPushed = null
  cancelPendingPush()
  unsubscribe?.()
  unsubscribe = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

/**
 * Mount-level wiring: pass the signed-in customer's id, or null for a guest.
 * Mounted once, beside the router (`StorefrontApp`), so both storefront
 * surfaces share one sync and a route change never restarts it.
 */
export function useCartSync(customerId: string | null) {
  useEffect(() => {
    if (customerId === null) {
      stopCartSync()
      return
    }
    startCartSync(customerId)
    // No cleanup on unmount: the sync is a singleton owned by the app shell,
    // and React's StrictMode double-invoke would otherwise tear down a sync
    // that has just been set up. Sign-out (customerId → null) is what stops
    // it, which is also the only moment it should stop.
  }, [customerId])
}
