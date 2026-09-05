import { useEffect, useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { publicOrderApi } from '../stores/storesApi'
import type { OrderItemInput, OrderQuote } from '../stores/storesApi'

/**
 * The checkout's price summary, from the server. Every rupee on the page —
 * subtotal, shipping, tax, discount, total — and which payment methods the
 * cart may use come from `POST …/orders/quote`; the client never adds
 * numbers up itself, so what the customer sees is what placement charges.
 *
 * Re-quotes whenever the lines or the fulfilment change (shipping depends on
 * both). `quote` is null while the first answer is pending or after a
 * failure; `stale` is true while a newer answer is in flight, so the summary
 * can dim instead of flashing empty.
 */
export function useCheckoutQuote(
  storeSlug: string,
  fulfilment: 'DELIVERY' | 'PICKUP',
  items: OrderItemInput[],
): {
  quote: OrderQuote | null
  loading: boolean
  error: string | null
} {
  const [state, setState] = useState<{
    quote: OrderQuote | null
    loading: boolean
    error: string | null
  }>({ quote: null, loading: items.length > 0, error: null })

  // Stable key so re-renders with the same lines do not refetch.
  const itemsKey = items
    .map((i) => `${i.productId}:${i.variantId ?? ''}:${i.quantity}`)
    .join(',')

  useEffect(() => {
    if (itemsKey === '') {
      setState({ quote: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    const parsed: OrderItemInput[] = itemsKey.split(',').map((part) => {
      const [productId, variantId, quantity] = part.split(':')
      return {
        productId: productId ?? '',
        variantId: variantId ? variantId : null,
        quantity: Number(quantity),
      }
    })
    publicOrderApi
      .quote(storeSlug, { fulfilment, items: parsed })
      .then((quote) => {
        if (!cancelled) setState({ quote, loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState((s) => ({
          quote: s.quote,
          loading: false,
          error: toApiError(err).message,
        }))
      })
    return () => {
      cancelled = true
    }
  }, [storeSlug, fulfilment, itemsKey])

  return state
}
