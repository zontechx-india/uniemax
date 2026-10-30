import { useEffect, useSyncExternalStore } from 'react'
import { call, http } from '../../../shared/auth/http'
import { openAuthDialog, type AuthDialogOptions } from '../auth/authDialogStore'
import type { MarketProduct } from '../discovery/discoveryApi'

/**
 * The customer's wishlist ("Saved") — products hearted on any card or
 * product page, on either surface (marketplace or store).
 *
 * The server owns the list (`/api/v1/wishlist`); this module keeps the set of
 * saved product ids in memory so every heart on screen reads it without a
 * request of its own. `useWishlistSync` (mounted once, in `StorefrontApp`)
 * loads the ids when a customer signs in and drops them on sign-out.
 *
 * Taps are optimistic: the heart flips at once and flips back if the request
 * fails. A guest's tap opens the sign-in dialog and completes the save after
 * signing in — there is no guest wishlist (see `wishlist.routes.ts`).
 */

const WISHLIST = '/api/v1/wishlist'

/** A saved product — the marketplace card shape plus when it was saved. */
export interface SavedProduct extends MarketProduct {
  savedAt: string
}

export const wishlistApi = {
  list: () => call<SavedProduct[]>(http.get(WISHLIST)),
  ids: () => call<string[]>(http.get(`${WISHLIST}/ids`)),
  add: (productId: string) =>
    call<unknown>(http.put(`${WISHLIST}/${encodeURIComponent(productId)}`)),
  remove: (productId: string) =>
    call<unknown>(http.delete(`${WISHLIST}/${encodeURIComponent(productId)}`)),
}

let customerId: string | null = null
let saved: ReadonlySet<string> = new Set()
/** Bumped on every account change, so a late `ids()` answer for a previous session is dropped. */
let generation = 0
const listeners = new Set<() => void>()

function publish(next: ReadonlySet<string>) {
  saved = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function syncWishlist(id: string | null) {
  if (id === customerId) return
  const previous = customerId
  customerId = id
  const mine = ++generation
  // Signing out, or switching account, empties the hearts. Signing IN keeps
  // what is there: a guest's heart tap saves during sign-in, before this runs.
  if (!id || previous !== null) publish(new Set())
  if (!id) return
  wishlistApi
    .ids()
    .then((ids) => {
      if (generation === mine) publish(new Set([...saved, ...ids]))
    })
    .catch(() => {})
}

/** Mount once at the app root with the signed-in customer's id (or `null`). */
export function useWishlistSync(id: string | null) {
  useEffect(() => {
    syncWishlist(id)
  }, [id])
}

/** Whether `productId` is saved — re-renders only when that answer changes. */
export function useIsSaved(productId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => saved.has(productId),
    () => false,
  )
}

async function setSaved(productId: string, on: boolean) {
  const next = new Set(saved)
  if (on) next.add(productId)
  else next.delete(productId)
  publish(next)
  try {
    if (on) await wishlistApi.add(productId)
    else await wishlistApi.remove(productId)
  } catch {
    // Put back just this heart — other taps may have landed meanwhile.
    const undo = new Set(saved)
    if (on) undo.delete(productId)
    else undo.add(productId)
    publish(undo)
  }
}

/**
 * Heart tap. Signed in: save or un-save. Guest: sign in first (with `auth`
 * — a store passes its own palette and name), then save.
 */
export function toggleSaved(productId: string, auth: AuthDialogOptions = {}) {
  if (!customerId) {
    openAuthDialog({
      ...auth,
      onSignedIn: (customer) => {
        auth.onSignedIn?.(customer)
        void setSaved(productId, true)
      },
    })
    return
  }
  void setSaved(productId, !saved.has(productId))
}
