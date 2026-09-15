import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { ErrorNote } from '../../../../shared/ui/form'
import { ActiveSwitch } from '../../../../storefront/pages/stores/ActiveSwitch'
import { sellerAffiliateApi } from '../../api'
import type { CommissionType, SellerProduct } from '../../api'
import { Empty, Pager, inputClass, money, rateText, useLoad } from '../../ui'
import { useSellerAffiliate } from './AffiliateLayout'

/** Which products partners may promote, and any product-specific rate. */
export function ProductsTab() {
  const { storeId } = useSellerAffiliate()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const products = useLoad(
    () => sellerAffiliateApi.products(storeId, { page, q: q || undefined }),
    [storeId, page, q],
  )
  const [error, setError] = useState<string | null>(null)

  const patch = async (
    product: SellerProduct,
    input: Parameters<typeof sellerAffiliateApi.updateProduct>[2],
  ) => {
    setError(null)
    try {
      await sellerAffiliateApi.updateProduct(storeId, product.id, input)
      products.reload()
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  return (
    <div className="max-w-3xl">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder="Search products"
        className={`${inputClass} max-w-xs`}
      />
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {products.error && <div className="mt-3"><ErrorNote>{products.error}</ErrorNote></div>}
      {products.data && products.data.items.length === 0 && (
        <div className="mt-3"><Empty>No active products{q ? ' match your search' : ''}.</Empty></div>
      )}

      <ul className="mt-3 space-y-2">
        {products.data?.items.map((product) => (
          <ProductRow key={product.id} product={product} onPatch={(input) => patch(product, input)} />
        ))}
      </ul>
      {products.data && <Pager meta={products.data.meta} onPage={setPage} />}
    </div>
  )
}

function ProductRow({
  product,
  onPatch,
}: {
  product: SellerProduct
  onPatch: (input: { enabled?: boolean; commissionType?: CommissionType | null; commissionRate?: number | null }) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState<CommissionType>(product.commissionType ?? 'PERCENTAGE')
  const [rate, setRate] = useState(product.commissionRate == null ? '' : String(product.commissionRate))

  const saveRate = async () => {
    await onPatch({ commissionType: type, commissionRate: Number(rate) })
    setEditing(false)
  }

  return (
    <li className={`rounded-lg border border-line p-3 ${product.enabled ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-3">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md bg-surface-alt" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{product.name}</p>
          <p className="text-xs text-muted">
            {money(product.price)} ·{' '}
            {product.enabled ? (
              <>
                {rateText(product.commissionType, product.commissionRate)}
                {product.hasOverride ? ' (custom)' : ' (default)'}
              </>
            ) : (
              'not open to affiliates'
            )}
          </p>
        </div>
        {product.enabled && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {product.hasOverride ? 'Change rate' : 'Set rate'}
          </button>
        )}
        <ActiveSwitch
          checked={product.enabled}
          label={`Open ${product.name} to affiliates`}
          onChange={(next) => void onPatch({ enabled: next })}
        />
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CommissionType)}
            className="h-9 rounded-md border border-line bg-input px-2 text-sm text-fg"
          >
            <option value="PERCENTAGE">%</option>
            <option value="FIXED">₹ per item</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-28 rounded-md border border-line bg-input px-2 text-sm text-fg"
            placeholder="Rate"
          />
          <button
            type="button"
            disabled={rate === ''}
            onClick={saveRate}
            className="rounded-md bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
          >
            Save
          </button>
          {product.hasOverride && (
            <button
              type="button"
              onClick={() => {
                void onPatch({ commissionType: null, commissionRate: null })
                setEditing(false)
              }}
              className="text-xs text-muted hover:text-fg"
            >
              Use default
            </button>
          )}
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-fg">
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
