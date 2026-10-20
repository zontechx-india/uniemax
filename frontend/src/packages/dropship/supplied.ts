import { useCallback, useEffect, useState } from 'react'
import { suppliedApi } from './api'
import type { Supplied } from './api'
import { useDropshipRole } from './role'

/**
 * The store's supplier products, keyed by the copy's product id — what the
 * product list needs for its "Supplied by" badges and paused notes. Empty
 * (and no request) while the package is off.
 */
export function useSuppliedProducts(storeId: string, storeSlug: string) {
  const role = useDropshipRole(storeSlug)
  const [byProduct, setByProduct] = useState<Map<string, Supplied>>(new Map())
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    if (!role?.hasSuppliers) {
      setByProduct(new Map())
      return
    }
    suppliedApi
      .list(storeId)
      .then((rows) => {
        if (live) setByProduct(new Map(rows.map((r) => [r.productId, r])))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [storeId, role?.hasSuppliers, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { byProduct, reload, hasSuppliers: role?.hasSuppliers ?? false }
}

/** One copy's supplier product, for the editor; `null` = not a supplier product. */
export function useSuppliedFor(storeId: string, productId: string | null | undefined) {
  const [row, setRow] = useState<Supplied | null | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    if (!productId) {
      setRow(null)
      return
    }
    suppliedApi
      .list(storeId, productId)
      .then((rows) => {
        if (live) setRow(rows[0] ?? null)
      })
      // The package is off (404) or unreachable: treat it as an ordinary product.
      .catch(() => {
        if (live) setRow(null)
      })
    return () => {
      live = false
    }
  }, [storeId, productId, nonce])

  return { supplied: row, setSupplied: setRow, reload: () => setNonce((n) => n + 1) }
}
