import { useEffect, useState } from 'react'
import { publicStoreApi } from '../stores/storesApi'

/**
 * Checkout-side delivery check: once the customer has chosen a delivery
 * address, ask the store whether every line reaches that pincode. The
 * result gates Place Order — the server refuses such an order anyway (400),
 * but a refusal after the customer has filled in everything is a worse
 * experience than a line-level warning while they can still fix it.
 *
 * `pincode` null (pickup order, or no address yet) = nothing to check.
 * A failed request leaves `undeliverable` empty and sets `error`; the
 * server remains the authority and will still refuse if it must.
 */
export function useDeliveryCheck(
  storeSlug: string,
  pincode: string | null,
  productIds: string[],
): {
  checking: boolean
  /** Product ids that cannot be delivered to `pincode`. */
  undeliverable: Set<string>
  error: string | null
} {
  const [state, setState] = useState<{
    checking: boolean
    undeliverable: Set<string>
    error: string | null
  }>({ checking: false, undeliverable: new Set(), error: null })

  // A stable key so re-renders with the same lines don't refetch.
  const idsKey = productIds.join(',')

  useEffect(() => {
    if (!pincode || idsKey === '') {
      setState({ checking: false, undeliverable: new Set(), error: null })
      return
    }
    let cancelled = false
    setState({ checking: true, undeliverable: new Set(), error: null })
    publicStoreApi
      .checkDelivery(storeSlug, pincode, idsKey.split(','))
      .then((check) => {
        if (cancelled) return
        setState({
          checking: false,
          undeliverable: new Set(
            check.results.filter((r) => !r.deliverable).map((r) => r.productId),
          ),
          error: null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({
          checking: false,
          undeliverable: new Set(),
          error: 'Could not check delivery availability for this address.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [storeSlug, pincode, idsKey])

  return state
}
