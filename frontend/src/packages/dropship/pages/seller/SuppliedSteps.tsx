import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote, TextField } from '../../../../shared/ui/form'
import { describeDeliveryRule } from '../../../../storefront/features/stores/deliveryRules'
import type { StoreProduct } from '../../../../storefront/features/stores/storesApi'
import { storeCatalogApi } from '../../../../storefront/features/stores/storesApi'
import { StepButtons, StepError, StepShell } from '../../../../storefront/pages/stores/products/wizard/shared'
import { BigSwitch, showToast } from '../../../../storefront/pages/stores/ui'
import { suppliedApi } from '../../api'
import type { Supplied } from '../../api'
import { priceOk } from '../../pricing'
import { money } from '../../ui'

/**
 * The product wizard's "Price & choices" step for a supplier product (D-34):
 * the seller sets only their own price per option; options, stock and MRP are
 * the supplier's. Carries the Supplier block — follow switch, latest photos
 * and description, a new option, and Remove from my store.
 */
export function SuppliedPricingStep({
  storeId,
  product,
  supplied,
  onSupplied,
  onSaved,
  onRemoved,
  onBack,
  onNext,
}: {
  storeId: string
  product: StoreProduct
  supplied: Supplied
  onSupplied: (s: Supplied) => void
  onSaved: (p: StoreProduct) => void
  onRemoved: () => void
  onBack: () => void
  onNext: () => void
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(supplied.variants.map((v) => [v.variantId, String(v.price)])),
  )
  const [newPrice, setNewPrice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const saveAndNext = () =>
    run('save', async () => {
      let latest: StoreProduct | null = null
      for (const v of supplied.variants) {
        const next = Number(prices[v.variantId])
        if (next === v.price) continue
        if (v.cost != null && !priceOk(next, v.cost, v.mrp)) {
          throw new Error(
            `${v.name}: price must be between ${money(v.cost)} and ${v.mrp != null ? money(v.mrp) + ' (MRP)' : 'any amount above it'}.`,
          )
        }
        latest = await storeCatalogApi.updateVariant(storeId, product.id, v.variantId, { price: next })
      }
      if (latest) onSaved(latest)
      onSupplied((await suppliedApi.list(storeId, product.id))[0] ?? supplied)
      onNext()
    })

  return (
    <StepShell
      title="Your price"
      lead={`Supplied by ${supplied.supplier.name}. You set the price; options, stock and MRP come from the supplier.`}
    >
      <ul className="divide-y divide-line rounded-md border border-line">
        {supplied.variants.map((v) => (
          <li key={v.variantId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{v.name === 'Default' ? product.name : v.name}</p>
              <p className="text-xs text-muted">
                Supplier price {money(v.cost)}
                {v.mrp != null ? ` · MRP ${money(v.mrp)}` : ''}
                {v.youEarn != null ? ` · You earn ${money(v.youEarn)}` : ''}
                {!v.isActive ? ' · Paused' : ''}
              </p>
            </div>
            <div className="w-full sm:w-36">
              <TextField
                label="Your price (₹)"
                inputMode="decimal"
                value={prices[v.variantId] ?? ''}
                onChange={(e) => setPrices((p) => ({ ...p, [v.variantId]: e.target.value.replace(/[^\d.]/g, '') }))}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <p className="text-sm text-fg">
          {supplied.followCost
            ? 'If the supplier changes their price, yours changes by the same amount, so you keep earning the same.'
            : 'Your price stays as it is. If the supplier raises theirs above it, the product pauses until you change your price.'}
        </p>
        <BigSwitch
          checked={!supplied.followCost}
          disabled={busy !== null}
          onChange={(fixed) =>
            run('follow', async () => {
              onSupplied(await suppliedApi.setFollow(storeId, supplied.id, !fixed))
            })
          }
          label="Keep my price fixed instead"
          onText="Price fixed"
          offText="Follows the supplier"
        />
      </div>

      {supplied.newOptions.length > 0 && (
        <section className="space-y-2 rounded-md border border-line p-3">
          <p className="text-sm font-semibold text-fg">New option available</p>
          {supplied.newOptions.map((o) => (
            <div key={o.supplyVariantId} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <p className="flex-1 text-sm text-fg">
                {o.name} <span className="text-xs text-muted">· supplier price {money(o.cost)}</span>
              </p>
              <div className="w-full sm:w-32">
                <TextField
                  label="Your price (₹)"
                  inputMode="decimal"
                  value={newPrice[o.supplyVariantId] ?? ''}
                  onChange={(e) =>
                    setNewPrice((p) => ({ ...p, [o.supplyVariantId]: e.target.value.replace(/[^\d.]/g, '') }))
                  }
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === o.supplyVariantId}
                onClick={() =>
                  run(o.supplyVariantId, async () => {
                    const next = await suppliedApi.addOption(storeId, supplied.id, o.supplyVariantId, Number(newPrice[o.supplyVariantId]))
                    onSupplied(next)
                    showToast(`${o.name} added`)
                  })
                }
              >
                Add it
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="sm"
          loading={busy === 'refresh'}
          onClick={() =>
            run('refresh', async () => {
              onSupplied(await suppliedApi.refresh(storeId, supplied.id))
              showToast("Supplier's latest photos and description added")
            })
          }
        >
          Get supplier's latest photos and description
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
          Remove from my store
        </Button>
      </div>

      {error && <StepError>{error}</StepError>}
      <StepButtons onBack={onBack} onNext={saveAndNext} busy={busy === 'save'} />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove from your store?"
        description="It disappears from your shop and stops following the supplier. Orders already placed still complete."
        confirmLabel="Remove"
        busy={busy === 'remove'}
        onConfirm={() =>
          run('remove', async () => {
            await suppliedApi.remove(storeId, supplied.id)
            showToast('Removed from your store')
            onRemoved()
          })
        }
        onCancel={() => setConfirmRemove(false)}
      />
    </StepShell>
  )
}

/** "Delivery & payment" for a supplier product: set by the supplier (C-4, C-12). */
export function SuppliedDeliveryStep({
  product,
  supplied,
  onBack,
  onNext,
}: {
  product: StoreProduct
  supplied: Supplied
  onBack: () => void
  onNext: () => void
}) {
  return (
    <StepShell
      title="Delivery & payment"
      lead={`Set by ${supplied.supplier.name}. They ship it from their place to your customer.`}
    >
      <dl className="divide-y divide-line rounded-md border border-line px-3">
        <div className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-sm text-muted">Delivers to</dt>
          <dd className="text-right text-sm font-medium text-fg">
            {product.deliveryRule ? describeDeliveryRule(product.deliveryRule) : 'Everywhere you deliver'}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-sm text-muted">Cash on delivery</dt>
          <dd className="text-right text-sm font-medium text-fg">
            {product.codAvailable ? 'Allowed' : 'Online payment only'}
          </dd>
        </div>
      </dl>
      <InfoNote>
        Your shop's own delivery charge applies to these orders. Cash on delivery is your choice per supplier, under
        Suppliers.
      </InfoNote>
      {supplied.state === 'PAUSED' && supplied.pauseText && <ErrorNote>Paused: {supplied.pauseText}</ErrorNote>}
      <StepButtons onBack={onBack} onNext={onNext} />
    </StepShell>
  )
}
