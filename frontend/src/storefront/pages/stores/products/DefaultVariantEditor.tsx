import { useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { storeCatalogApi } from '../../../features/stores/storesApi'
import type { StoreProduct } from '../../../features/stores/storesApi'

/**
 * Price + stock editor for a product that has no options. Those values live on
 * the product's implicit `Default` variant, so this simply patches that
 * variant — there is no product-level price to edit.
 */
export function DefaultVariantEditor({
  storeId,
  productId,
  variant,
  onProductChange,
  onError,
}: {
  storeId: string
  productId: string
  variant: NonNullable<StoreProduct['defaultVariant']>
  onProductChange: (product: StoreProduct) => void
  onError: (message: string | null) => void
}) {
  const [price, setPrice] = useState(variant.price)
  const [stock, setStock] = useState(String(variant.stockQuantity))
  const [busy, setBusy] = useState(false)

  // Re-sync when the server sends back a new value (e.g. after saving).
  const [lastId, setLastId] = useState(variant.id)
  if (variant.id !== lastId) {
    setLastId(variant.id)
    setPrice(variant.price)
    setStock(String(variant.stockQuantity))
  }

  const dirty =
    price !== variant.price || stock !== String(variant.stockQuantity)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const priceValue = Number(price)
    if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return onError('Please enter a valid price.')
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return onError('Stock must be a whole number.')
    }

    onError(null)
    setBusy(true)
    try {
      onProductChange(
        await storeCatalogApi.updateVariant(storeId, productId, variant.id, {
          price: priceValue,
          stockQuantity: stockValue,
        }),
      )
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
    >
      <label className="block sm:w-40 sm:shrink-0">
        <span className="mb-1 block text-xs font-medium text-muted">
          Price (₹)
        </span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </label>
      <label className="block sm:w-28 sm:shrink-0">
        <span className="mb-1 block text-xs font-medium text-muted">Stock</span>
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          inputMode="numeric"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !dirty}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
