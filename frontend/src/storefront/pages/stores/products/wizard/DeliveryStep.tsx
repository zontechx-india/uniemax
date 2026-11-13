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
import type { ComponentType } from 'react'
import {
  BoxIcon,
  CheckIcon,
  MapPinIcon,
  RupeeIcon,
  SlidersIcon,
  StoreIcon,
  TruckIcon,
} from '../../../../layout/icons'
import { ChoiceCard, Hint, Section, StepButtons, StepError, StepShell } from './shared'

/** One of the shop's settings: a mark, what it is, and its value. */
function SettingLine({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 font-medium text-fg">{value}</span>
    </li>
  )
}

/**
 * Step 5 — delivery & payment, which almost every product inherits from the
 * store. So the step is one sentence saying what those settings are and a
 * single "change for this product" switch; the detailed editors only appear
 * for the rare product that needs its own rule.
 *
 * A supplier account is asked only where it delivers: that area is what its
 * sellers' copies follow. The shipping charge customers pay is each seller's,
 * and cash on delivery is set per seller in their terms (D-28).
 */
export function DeliveryStep({
  storeId,
  product,
  onSaved,
  onBack,
  onNext,
  supplyOnly = false,
}: {
  storeId: string
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onNext: () => void
  supplyOnly?: boolean
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
    <StepShell title={supplyOnly ? 'Where you deliver' : 'Delivery & payment'}>
      {/* The shop's settings as three marked lines — what this product gets
          unless the seller changes it below. */}
      <Section title={supplyOnly ? 'Your delivery settings' : "Your shop's settings"} icon={StoreIcon}>
        <ul className="space-y-2 text-sm">
          <SettingLine icon={MapPinIcon} label="Delivers to" value={describeDeliveryRule(store.shipping.deliveryRule)} />
          {!supplyOnly && (
            <>
              <SettingLine icon={TruckIcon} label="Shipping" value={describeShippingRate(store.shipping.rate)} />
              <SettingLine
                icon={RupeeIcon}
                label="Cash on delivery"
                value={store.payments.acceptCod ? 'Accepted' : 'Off'}
              />
            </>
          )}
        </ul>
        <Hint>
          {supplyOnly
            ? 'Change under Delivery. COD is agreed with each seller.'
            : 'Change under Delivery and Payments.'}
        </Hint>
      </Section>

      <Section title="For this product" icon={BoxIcon}>
        <div role="radiogroup" aria-label="Delivery for this product" className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            active={!custom}
            icon={CheckIcon}
            title={supplyOnly ? 'Same as my settings' : 'Same as my shop'}
            body="Most products"
            onClick={useStoreSettings}
          />
          <ChoiceCard
            active={custom}
            icon={SlidersIcon}
            title="Different"
            body={supplyOnly ? 'Its own delivery area' : 'Own area, charge or COD'}
            onClick={() => setCustom(true)}
          />
        </div>
      </Section>

      {custom && (
        <Section title="This product’s delivery" icon={SlidersIcon}>
          <ProductDeliveryField
            storeRule={store.shipping.deliveryRule}
            value={deliveryRule}
            onChange={(next) => {
              setDeliveryRule(next)
              setError(null)
            }}
            disabled={busy}
          />
          {!supplyOnly && (
            <>
              <ProductShippingField
                storeRate={store.shipping.rate}
                value={shippingOverride}
                onChange={(next) => {
                  setShippingOverride(next)
                  setError(null)
                }}
                disabled={busy}
              />
              <label className="flex min-h-tap cursor-pointer items-start gap-2.5 py-1">
                <input
                  type="checkbox"
                  checked={codAvailable}
                  onChange={(e) => setCodAvailable(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--brand)]"
                />
                <span className="text-sm">
                  <span className="font-semibold text-fg">Cash on delivery</span>
                  <span className="block text-hint text-muted">
                    {store.payments.acceptCod
                      ? 'Untick if prepaid only.'
                      : 'COD is off for your shop — applies once on.'}
                  </span>
                </span>
              </label>
            </>
          )}
        </Section>
      )}

      {error && <StepError>{error}</StepError>}

      <StepButtons onBack={onBack} onNext={() => void next()} busy={busy} />
    </StepShell>
  )
}
