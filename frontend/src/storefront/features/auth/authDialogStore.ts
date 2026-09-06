import { useSyncExternalStore } from 'react'
import type { Customer } from '../../../shared/auth/authApi'
import type { StoreThemeVars } from '../publicStore/storeTheme'
import type { PublicStore } from '../stores/storesApi'
import type { AuthView } from './CustomerAuthPanel'

/**
 * The auth dialog's "open request" — a module-level store, like the cart.
 *
 * Why not context: the dialog is opened from BOTH router trees (marketplace
 * and the anonymous shopping surface), from headers, drawers, checkout and
 * the store Help page. A store any module can call is simpler than threading
 * an opener through every one of them, and `useSyncExternalStore` keeps the
 * single host (`AuthDialog`, mounted once in `StorefrontApp`) in sync.
 *
 * The snapshot is REPLACED on every change, never mutated, so the getter
 * returns a stable reference between changes (the rule `useSyncExternalStore`
 * needs — same discipline as `cart.ts`).
 */

export type AuthDialogBrand =
  | { kind: 'market' }
  | { kind: 'store'; name: string; logoUrl: string | null }

export interface AuthDialogOptions {
  /** Store palette: applied on the dialog's portal root via `storeVars`. */
  theme?: StoreThemeVars
  /** What the brand panel shows. Default: the UnieMax hero. */
  brand?: AuthDialogBrand
  /**
   * Follow-up once the customer is signed in (the session is already flipped
   * and the dialog closed by then). The host sits OUTSIDE the router, so any
   * navigation has to come from the caller, which is inside one.
   */
  onSignedIn?: (customer: Customer) => void
  initialView?: AuthView
}

export interface AuthDialogRequest extends AuthDialogOptions {
  /** Increments per open — keys the panel so two opens never share state. */
  id: number
  /** The element that had focus when the dialog opened, to hand focus back. */
  opener: HTMLElement | null
}

let current: AuthDialogRequest | null = null
let seq = 0
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function openAuthDialog(options: AuthDialogOptions = {}) {
  const active = document.activeElement
  current = {
    ...options,
    id: ++seq,
    opener: active instanceof HTMLElement ? active : null,
  }
  notify()
}

export function closeAuthDialog() {
  if (!current) return
  current = null
  notify()
}

/** The open request, or `null` while closed. */
export function useAuthDialog(): AuthDialogRequest | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

/**
 * Options for opening the dialog INSIDE a store: its palette and identity,
 * so the dialog reads as part of the shop rather than an app interruption.
 */
export function storeAuthRequest(
  store: Pick<PublicStore, 'name' | 'logoUrl' | 'theme'>,
  extra: Omit<AuthDialogOptions, 'theme' | 'brand'> = {},
): AuthDialogOptions {
  return {
    theme: store.theme,
    brand: { kind: 'store', name: store.name, logoUrl: store.logoUrl },
    ...extra,
  }
}
