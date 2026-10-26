import { useCallback, useEffect, useState } from 'react'
import { toApiError } from '../../shared/auth/http'
import { supplierApi } from './api'
import type { SupplyItem } from './api'

/**
 * A supplier account's offers to sellers, for its own product list and the
 * product editor's last step. A supplier account has no shop: a product only
 * reaches sellers once it is offered, with a price for sellers (D-28).
 */

/** Offered = switched on, with at least one option priced for sellers. */
export const isOffered = (item: SupplyItem | null | undefined) =>
  !!item && item.isOpen && item.variants.some((v) => v.isOpen && v.cost != null)

/** Every offer, keyed by product id. `null` until loaded; nothing is fetched when `enabled` is false. */
export function useSupplyOffers(storeId: string, enabled: boolean) {
  const [byProduct, setByProduct] = useState<Map<string, SupplyItem> | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    if (!enabled) {
      setByProduct(null)
      return
    }
    supplierApi
      .supply(storeId)
      .then((items) => {
        if (live) setByProduct(new Map(items.map((i) => [i.productId, i])))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [storeId, enabled, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { byProduct, reload }
}

/** One product's offer, for the editor. `undefined` while loading. */
export function useSupplyItem(storeId: string, productId: string, enabled: boolean) {
  const [item, setItem] = useState<SupplyItem | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (!enabled) return
    supplierApi
      .supply(storeId)
      .then((items) => {
        if (live) setItem(items.find((i) => i.productId === productId) ?? null)
      })
      .catch((err) => {
        if (!live) return
        setItem(null)
        setError(toApiError(err).message)
      })
    return () => {
      live = false
    }
  }, [storeId, productId, enabled])

  return { item, setItem, error }
}

/** Price for sellers per option, as typed; '' = that option isn't offered. */
export type OfferDraft = Record<string, string>

const COST_RE = /^\d+(\.\d{1,2})?$/
const costText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/** The options a seller could get: switched-off options are never offered. */
export const offerableVariants = (item: SupplyItem) => item.variants.filter((v) => v.isActive)

export function offerDraftOf(item: SupplyItem): OfferDraft {
  return Object.fromEntries(
    offerableVariants(item).map((v) => [v.variantId, v.isOpen && v.cost != null ? costText(v.cost) : '']),
  )
}

export function offerProblem(item: SupplyItem, draft: OfferDraft): string | null {
  const typed = offerableVariants(item).map((v) => (draft[v.variantId] ?? '').trim())
  if (typed.every((t) => t === '')) {
    return offerableVariants(item).length > 1
      ? 'Enter your price for sellers for at least one option'
      : 'Enter your price for sellers'
  }
  if (typed.some((t) => t !== '' && !COST_RE.test(t))) return 'Enter prices in numbers only, e.g. 450'
  return null
}

/** Offer the product: each priced option is on, every other option off. */
export function saveOffer(storeId: string, item: SupplyItem, draft: OfferDraft) {
  return supplierApi.updateSupply(storeId, item.productId, {
    isOpen: true,
    variants: item.variants.map((v) => {
      const typed = (draft[v.variantId] ?? '').trim()
      return { variantId: v.variantId, cost: typed === '' ? null : Number(typed), isOpen: typed !== '' }
    }),
  })
}
