import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ErrorNote } from '../../../../../shared/ui/form'
import {
  deliveryRuleProblem,
  describeDeliveryRule,
  sameDeliveryRule,
} from '../../../../features/stores/deliveryRules'
import {
  describeShippingRate,
  sameShippingOverride,
  shippingOverrideProblem,
} from '../../../../features/stores/shippingRates'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  DeliveryRule,
  ProductShippingOverride,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { useManagedStore } from '../../../../features/stores/useManagedStore'
import { ProductDeliveryField } from '../../DeliveryRuleEditor'
import { ProductShippingField } from '../../ShippingRateEditor'
import { Hint, StepButtons, StepShell } from './shared'

/**
 * Step 5 — delivery & payment, which almost every product inherits from the
 * store. So the step is one sentence saying what those settings are and a
 * single "change for this product" switch; the detailed editors only appear
 * for the rare product that needs its own rule.
 */
export function DeliveryStep({
  storeId,
  product,
  onSaved,
  onBack,
  onNext,
}: {
  storeId: string
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onNext: () => void
}) {
  const { store } = useManagedStore()
  const [custom, setCustom] = useState(
    product.deliveryRule !== null ||
      product.shippingOverride !== null ||
      !product.codAvailable,
  )
  const [deliveryRule, setDeliveryRule] = useState<DeliveryRule | null>(
    product.deliveryRule,
  )
  const [shippingOverride, setShippingOverride] =
    useState<ProductShippingOverride | null>(product.shippingOverride)
  const [codAvailable, setCodAvailable] = useState(product.codAvailable)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // "Same as the store" means exactly that: switching custom off clears
  // every override so the product follows the store settings again.
  const useStoreSettings = () => {
    setCustom(false)
    setDeliveryRule(null)
    setShippingOverride(null)
    setCodAvailable(true)
    setError(null)
  }

  const next = async () => {
    const deliveryChanged = !sameDeliveryRule(deliveryRule, product.deliveryRule)
    const shippingChanged = !sameShippingOverride(shippingOverride, product.shippingOverride)
    const codChanged = codAvailable !== product.codAvailable
    if (!deliveryChanged && !shippingChanged && !codChanged) return onNext()

    const deliveryProblem = deliveryRule && deliveryRuleProblem(deliveryRule)
    if (deliveryProblem) return setError(deliveryProblem)
    const shippingProblem = shippingOverride && shippingOverrideProblem(shippingOverride)
    if (shippingProblem) return setError(shippingProblem)

    setError(null)
    setBusy(true)
    try {
      onSaved(
        await storeCatalogApi.updateProduct(storeId, product.id, {
          ...(deliveryChanged ? { deliveryRule } : {}),
          ...(shippingChanged ? { shippingOverride } : {}),
          ...(codChanged ? { codAvailable } : {}),
        }),
      )
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell
      title="Delivery & payment"
      lead="Most products simply follow your store settings. Change them here only if this product is different."
    >
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium text-fg">Your store settings</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>
            Delivers to:{' '}
            <span className="text-fg">{describeDeliveryRule(store.shipping.deliveryRule)}</span>
          </li>
          <li>
            Shipping charge:{' '}
            <span className="text-fg">{describeShippingRate(store.shipping.rate)}</span>
          </li>
          <li>
            Cash on delivery:{' '}
            <span className="text-fg">{store.payments.acceptCod ? 'accepted' : 'switched off'}</span>
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={useStoreSettings}
            aria-pressed={!custom}
            className={`h-9 rounded-md border px-3.5 text-sm font-semibold transition ${
              !custom
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-line bg-surface text-fg hover:border-brand/60'
            }`}
          >
            Same as the store
          </button>
          <button
            type="button"
            onClick={() => setCustom(true)}
            aria-pressed={custom}
            className={`h-9 rounded-md border px-3.5 text-sm font-semibold transition ${
              custom
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-line bg-surface text-fg hover:border-brand/60'
            }`}
          >
            Different for this product
          </button>
        </div>
        {!custom && (
          <Hint>Change the store settings any time under Shipping and Payments.</Hint>
        )}
      </div>

      {custom && (
        <div className="space-y-5">
          <ProductDeliveryField
            storeRule={store.shipping.deliveryRule}
            value={deliveryRule}
            onChange={(next) => {
              setDeliveryRule(next)
              setError(null)
            }}
            disabled={busy}
          />
          <ProductShippingField
            storeRate={store.shipping.rate}
            value={shippingOverride}
            onChange={(next) => {
              setShippingOverride(next)
              setError(null)
            }}
            disabled={busy}
          />
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={codAvailable}
              onChange={(e) => setCodAvailable(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
            />
            <span className="text-sm">
              <span className="font-medium text-fg">Cash on delivery for this product</span>
              <span className="mt-0.5 block text-xs text-muted">
                {store.payments.acceptCod
                  ? 'Untick for items you only sell prepaid.'
                  : 'Your store has cash on delivery switched off; this applies once you turn it on.'}
              </span>
            </span>
          </label>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <StepButtons onBack={onBack} onNext={() => void next()} busy={busy} skip={onNext} />
    </StepShell>
  )
}
