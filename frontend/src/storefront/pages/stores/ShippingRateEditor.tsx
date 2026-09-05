import { useState } from 'react'
import {
  describeShippingRate,
  parseAmount,
} from '../../features/stores/shippingRates'
import type {
  ProductShippingOverride,
  ShippingRate,
} from '../../features/stores/storesApi'
import { CheckIcon } from '../../layout/icons'

/**
 * Editors for the shipping CHARGE (how much) — the sibling of
 * `DeliveryRuleEditor` (where). Two components:
 *
 *   `ShippingRateEditor`   — the STORE's default rate: Free / Flat per order,
 *                            with an optional free-above threshold.
 *   `ProductShippingField` — a PRODUCT's override: use the store rate (named),
 *                            free for this product, or a custom flat charge.
 *
 * Both are controlled; validation lives in `features/stores/shippingRates.ts`
 * and the actual charge is only ever computed server-side.
 */

const INPUT =
  'h-11 w-full rounded-md border border-line bg-input pl-8 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60'

/** Rupee input — keeps the raw text so "80." can be typed without snapping. */
function RupeeInput({
  label,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  hint?: string
  value: string
  onChange: (text: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">
        {label}
        {hint && <span className="font-normal"> {hint}</span>}
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted">
          ₹
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder={placeholder ?? '0'}
          disabled={disabled}
          className={INPUT}
        />
      </div>
    </label>
  )
}

/** Radio-card option shared by both editors. */
function ChoiceCard({
  selected,
  title,
  detail,
  disabled,
  onSelect,
}: {
  selected: boolean
  title: string
  detail: string
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
        selected ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface-alt'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-brand bg-brand text-brand-contrast' : 'border-line'
        }`}
      >
        {selected && <CheckIcon className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{detail}</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Store rate
// ---------------------------------------------------------------------------

/**
 * The store's default rate. Amount fields are kept as text while editing
 * (so a half-typed "80." survives a re-render); the parsed rate flows out
 * through `onChange` on every keystroke — an unparsable amount becomes 0,
 * which `shippingRateProblem` then reports at save time.
 */
export function ShippingRateEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: ShippingRate
  onChange: (next: ShippingRate) => void
  disabled?: boolean
}) {
  const [amountText, setAmountText] = useState(
    value.type === 'FLAT' ? String(value.amount) : '',
  )
  const [thresholdText, setThresholdText] = useState(
    value.freeAbove !== null ? String(value.freeAbove) : '',
  )

  const emit = (patch: { amount?: string; freeAbove?: string }) => {
    const amount = patch.amount ?? amountText
    const threshold = patch.freeAbove ?? thresholdText
    onChange({
      type: 'FLAT',
      amount: parseAmount(amount) ?? 0,
      freeAbove: threshold.trim() === '' ? null : (parseAmount(threshold) ?? 0),
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Shipping charge">
        <ChoiceCard
          selected={value.type === 'FREE'}
          title="Free shipping"
          detail="Customers pay nothing for delivery."
          disabled={disabled}
          onSelect={() =>
            onChange({ type: 'FREE', amount: 0, freeAbove: null })
          }
        />
        <ChoiceCard
          selected={value.type === 'FLAT'}
          title="Flat rate per order"
          detail="One charge per order, however many items."
          disabled={disabled}
          onSelect={() => {
            if (value.type !== 'FLAT') emit({})
          }}
        />
      </div>

      {value.type === 'FLAT' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <RupeeInput
            label="Shipping charge"
            hint="(per order)"
            value={amountText}
            placeholder="80"
            disabled={disabled}
            onChange={(text) => {
              setAmountText(text)
              emit({ amount: text })
            }}
          />
          <RupeeInput
            label="Free shipping for orders above"
            hint="(optional)"
            value={thresholdText}
            placeholder="1000"
            disabled={disabled}
            onChange={(text) => {
              setThresholdText(text)
              emit({ freeAbove: text })
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Product override
// ---------------------------------------------------------------------------

/**
 * A product's shipping charge: follow the store rate (named, so the seller
 * knows what they are accepting), ship this product free, or charge a custom
 * flat rate. `null` = no override. The custom amount is remembered while the
 * seller flips between options so a typed value is not lost.
 */
export function ProductShippingField({
  storeRate,
  value,
  onChange,
  disabled = false,
}: {
  /** The store's current default, so "Use store rate" can say what it is. */
  storeRate: ShippingRate
  value: ProductShippingOverride | null
  onChange: (next: ProductShippingOverride | null) => void
  disabled?: boolean
}) {
  const [amountText, setAmountText] = useState(
    value?.type === 'FLAT' ? String(value.amount) : '',
  )
  const choice: 'STORE' | 'FREE' | 'FLAT' = value === null ? 'STORE' : value.type

  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-muted">
        Shipping charge
      </span>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Shipping charge">
        <ChoiceCard
          selected={choice === 'STORE'}
          title="Use store rate"
          detail={describeShippingRate(storeRate)}
          disabled={disabled}
          onSelect={() => onChange(null)}
        />
        <ChoiceCard
          selected={choice === 'FREE'}
          title="Free for this product"
          detail="Never adds a shipping charge."
          disabled={disabled}
          onSelect={() => onChange({ type: 'FREE', amount: 0 })}
        />
        <ChoiceCard
          selected={choice === 'FLAT'}
          title="Custom rate"
          detail="Its own flat charge per order."
          disabled={disabled}
          onSelect={() =>
            onChange({ type: 'FLAT', amount: parseAmount(amountText) ?? 0 })
          }
        />
      </div>
      {choice === 'FLAT' && (
        <div className="mt-3 max-w-xs">
          <RupeeInput
            label="Shipping charge for this product"
            hint="(per order)"
            value={amountText}
            placeholder="200"
            disabled={disabled}
            onChange={(text) => {
              setAmountText(text)
              onChange({ type: 'FLAT', amount: parseAmount(text) ?? 0 })
            }}
          />
          <p className="mt-1.5 text-xs text-muted">
            An order pays the highest rate among its items — this replaces the
            store rate when it is higher, and is not waived by the store&rsquo;s
            free-above threshold.
          </p>
        </div>
      )}
    </div>
  )
}
