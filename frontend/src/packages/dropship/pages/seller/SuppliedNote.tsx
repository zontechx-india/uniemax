import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Badge } from '../../../../shared/ui/Badge'
import { Button } from '../../../../shared/ui/Button'
import { showToast } from '../../../../storefront/pages/stores/ui'
import { suppliedApi } from '../../api'
import type { Supplied } from '../../api'
import { money } from '../../ui'

/**
 * Under a product row in the seller's product list: "Supplied by {supplier}",
 * and when the copy is paused, why — with the one-tap fix where there is one
 * (docs/dropshipping/supplier-products → Looking after them).
 */
export function SuppliedNote({
  storeId,
  supplied,
  onChanged,
}: {
  storeId: string
  supplied: Supplied
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const fix = supplied.variants.find((v) => v.fixPrice != null)
  const paused = supplied.state === 'PAUSED'

  const applyFix = async () => {
    setBusy(true)
    try {
      await suppliedApi.fixPrice(storeId, supplied.id)
      showToast('Price updated — it can be sold again')
      onChanged()
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Badge tone="brand" dot={false}>
        Supplied by {supplied.supplier.name}
      </Badge>
      {paused && supplied.pauseText && (
        <div className="rounded-md bg-pending-soft px-3 py-2">
          <p className="text-sm font-semibold text-pending">Paused: {supplied.pauseText}</p>
          {supplied.pauseReason === 'COST_ABOVE_PRICE' && fix && fix.cost != null && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-xs text-fg sm:flex-1">
                Supplier {money(fix.cost)} · yours {money(fix.price)}. At {money(fix.fixPrice)} you keep earning{' '}
                {money(fix.fixPrice! - fix.cost)}.
              </p>
              <Button size="sm" loading={busy} onClick={applyFix}>
                Set price to {money(fix.fixPrice)}
              </Button>
            </div>
          )}
          {supplied.pauseReason === 'LINK_INACTIVE' && (
            <Link to="../suppliers" className="mt-1 inline-block text-xs font-semibold text-brand underline">
              See your suppliers
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** The empty product list's second way in (C-…, Flows → Entry points). */
export function SupplierProductsEntry() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 text-center">
      <p className="text-sm text-fg">
        No products yet? Sell your suppliers' products. No stock needed — they ship for you.
      </p>
      <Link to="../supplier-products" className="mt-2 inline-block text-sm font-semibold text-brand underline">
        See supplier products
      </Link>
    </div>
  )
}
