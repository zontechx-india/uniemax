import { useCallback, useEffect, useState } from 'react'
import { addressesApi } from '../addresses/addressesApi'

/**
 * The pincode the storefront checks delivery against — "where is this
 * customer?" for the product page's availability line.
 *
 * Resolution order:
 *   1. a pincode the customer typed into a delivery check (remembered in
 *      localStorage, so it follows them from product to product and across
 *      visits, signed in or not);
 *   2. otherwise the PRIMARY address of a signed-in customer's address book
 *      (their default delivery address — the one checkout preselects);
 *   3. otherwise nothing — the page asks for one.
 *
 * A typed pincode deliberately outranks the primary address: a customer
 * checking for a friend's address should not be snapped back to their own
 * on the next page. "Change" on the product page is always one tap away.
 */

const STORAGE_KEY = 'uniemax.delivery.pincode'

export type PincodeSource = 'manual' | 'address'

function readStored(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

function writeStored(value: string | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked — the pincode still works for this page.
  }
}

export function useDeliveryPincode(): {
  pincode: string | null
  source: PincodeSource | null
  /** False until the address-book lookup has settled (guests settle instantly). */
  ready: boolean
  /** Remember a customer-typed pincode (null forgets it). */
  setPincode: (pincode: string | null) => void
} {
  const [state, setState] = useState<{
    pincode: string | null
    source: PincodeSource | null
    ready: boolean
  }>(() => {
    const stored = readStored()
    return stored
      ? { pincode: stored, source: 'manual', ready: true }
      : { pincode: null, source: null, ready: false }
  })

  useEffect(() => {
    if (state.ready) return
    let cancelled = false
    addressesApi
      .list()
      .then((rows) => {
        if (cancelled) return
        const primary = rows.find((a) => a.isPrimary) ?? rows[0]
        setState({
          pincode: primary?.pincode ?? null,
          source: primary ? 'address' : null,
          ready: true,
        })
      })
      .catch(() => {
        // 401 (guest) or any failure — nothing to prefill.
        if (!cancelled) setState({ pincode: null, source: null, ready: true })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount
  }, [])

  const setPincode = useCallback((pincode: string | null) => {
    writeStored(pincode)
    setState({
      pincode,
      source: pincode ? 'manual' : null,
      ready: true,
    })
  }, [])

  return { ...state, setPincode }
}
