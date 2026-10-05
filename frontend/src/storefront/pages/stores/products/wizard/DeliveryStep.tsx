import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
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
import { SlidersIcon, TruckIcon } from '../../../../layout/icons'
import { ChoiceCard, Hint, StepButtons, StepError, StepShell } from './shared'

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
      lead="Most products simply follow your shop's settings. Change them here only if this product is different."
    >
      <div className="rounded-2xl border border-line bg-surface/70 p-4">
        <p className="text-base font-semibold text-fg">Your shop's settings</p>
        <ul className="mt-2 space-y-1.5 text-base text-muted">
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
        <Hint>Change your shop's settings any time under Delivery and Payments.</Hint>
      </div>

      <div
        role="radiogroup"
        aria-label="Delivery for this product"
        className="grid gap-3 sm:grid-cols-2"
      >
        <ChoiceCard
          active={!custom}
          icon={TruckIcon}
          title="Same as my shop"
          body="Nothing to change. Most products."
          onClick={useStoreSettings}
        />
        <ChoiceCard
          active={custom}
          icon={SlidersIcon}
          title="Different for this product"
          body="Its own delivery area or charge, or no cash on delivery."
          onClick={() => setCustom(true)}
        />
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
          <label className="flex min-h-tap cursor-pointer items-start gap-3 rounded-xl py-1">
            <input
              type="checkbox"
              checked={codAvailable}
              onChange={(e) => setCodAvailable(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--brand)]"
            />
            <span className="text-base">
              <span className="font-medium text-fg">Cash on delivery for this product</span>
              <span className="mt-0.5 block text-hint text-muted">
                {store.payments.acceptCod
                  ? 'Untick for items you only sell prepaid.'
                  : 'Your store has cash on delivery switched off; this applies once you turn it on.'}
              </span>
            </span>
          </label>
        </div>
      )}

      {error && <StepError>{error}</StepError>}

      <StepButtons onBack={onBack} onNext={() => void next()} busy={busy} />
    </StepShell>
  )
}
