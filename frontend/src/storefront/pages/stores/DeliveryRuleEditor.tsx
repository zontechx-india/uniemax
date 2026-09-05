import { useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import {
  DELIVERY_RULE_LABELS,
  DELIVERY_RULE_LIMITS,
  describeDeliveryRule,
  parsePincodes,
} from '../../features/stores/deliveryRules'
import type {
  DeliveryRule,
  DeliveryRuleType,
} from '../../features/stores/storesApi'
import { CheckIcon } from '../../layout/icons'

/**
 * Editor for one delivery-area rule: the rule TYPE (all / only selected /
 * all except selected) plus, for the two selective types, the pincode list.
 * Controlled — the parent owns the value and decides when to save, so the
 * same editor serves the store default (Shipping page, saved on its own
 * button) and a product override (saved with the rest of the product form).
 */

const RULE_TYPES: {
  type: DeliveryRuleType
  description: string
}[] = [
  {
    type: 'ALL',
    description: 'Orders can be delivered anywhere.',
  },
  {
    type: 'INCLUDE',
    description: 'Deliver only to the pincodes you list — everywhere else is refused.',
  },
  {
    type: 'EXCLUDE',
    description: 'Deliver everywhere except the pincodes you list.',
  },
]

export function DeliveryRuleEditor({
  value,
  onChange,
  disabled = false,
  /** Compact rows for use inside a product form. */
  dense = false,
}: {
  value: DeliveryRule
  onChange: (next: DeliveryRule) => void
  disabled?: boolean
  dense?: boolean
}) {
  const setType = (type: DeliveryRuleType) => {
    if (type === value.type) return
    // The list is kept when switching between the two selective types (the
    // seller typed it once) and dropped only when going back to ALL.
    onChange({ type, pincodes: type === 'ALL' ? [] : value.pincodes })
  }

  return (
    <div className="space-y-3">
      <ul
        className={dense ? 'space-y-1.5' : 'space-y-2'}
        role="radiogroup"
        aria-label="Delivery area"
      >
        {RULE_TYPES.map(({ type, description }) => {
          const selected = type === value.type
          return (
            <li key={type}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setType(type)}
                className={`flex w-full items-center gap-3 rounded-md border text-left transition disabled:cursor-not-allowed ${
                  dense ? 'px-3 py-2' : 'p-3.5'
                } ${
                  selected
                    ? 'border-brand bg-brand/5'
                    : 'border-line bg-surface hover:bg-surface-alt'
                }`}
              >
                <span
                  className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line'
                  }`}
                >
                  {selected && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">
                    {DELIVERY_RULE_LABELS[type]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {description}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {value.type !== 'ALL' && (
        <PincodeListInput
          label={
            value.type === 'INCLUDE'
              ? 'Deliver to these pincodes'
              : 'Do not deliver to these pincodes'
          }
          pincodes={value.pincodes}
          onChange={(pincodes) => onChange({ ...value, pincodes })}
          disabled={disabled}
        />
      )}
    </div>
  )
}

/**
 * The pincode list as chips. Type one and press Enter / comma / space, or
 * PASTE a whole list — "629154, 629001 629002" — and every valid pincode
 * becomes a chip at once (a seller covering a district has dozens; typing
 * them one by one would be a chore). Invalid tokens are reported, never
 * silently dropped.
 */
function PincodeListInput({
  label,
  pincodes,
  onChange,
  disabled,
}: {
  label: string
  pincodes: string[]
  onChange: (next: string[]) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  const full = pincodes.length >= DELIVERY_RULE_LIMITS.pincodes

  const addFrom = (text: string) => {
    const { valid, invalid } = parsePincodes(text)
    const fresh = valid.filter((pincode) => !pincodes.includes(pincode))
    const room = DELIVERY_RULE_LIMITS.pincodes - pincodes.length
    const accepted = fresh.slice(0, Math.max(0, room))
    if (accepted.length > 0) onChange([...pincodes, ...accepted])

    const notes: string[] = []
    if (invalid.length > 0) {
      notes.push(
        invalid.length === 1
          ? `"${invalid[0]}" is not a valid 6-digit pincode.`
          : `${invalid.length} entries were not valid 6-digit pincodes.`,
      )
    }
    if (valid.length > fresh.length && accepted.length === 0 && invalid.length === 0) {
      notes.push('Already in the list.')
    }
    if (fresh.length > accepted.length) {
      notes.push(`Up to ${DELIVERY_RULE_LIMITS.pincodes} pincodes per rule.`)
    }
    setHint(notes.length > 0 ? notes.join(' ') : null)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (draft.trim()) addFrom(draft)
    } else if (e.key === 'Backspace' && draft === '' && pincodes.length > 0) {
      e.preventDefault()
      onChange(pincodes.slice(0, -1))
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/[\s,;]/.test(text.trim())) return // single value — let it type
    e.preventDefault()
    addFrom(`${draft} ${text}`)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="text-xs text-muted">
          {pincodes.length} / {DELIVERY_RULE_LIMITS.pincodes}
          {pincodes.length > 0 && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={disabled}
                className="font-semibold text-danger hover:underline disabled:opacity-50"
              >
                Clear all
              </button>
            </>
          )}
        </span>
      </div>
      <div
        className={`flex max-h-48 w-full flex-wrap items-center gap-1.5 overflow-y-auto rounded-md border border-line bg-input px-2 py-1.5 text-sm transition-colors focus-within:border-accent ${
          disabled ? 'opacity-60' : 'hover:border-fg/30'
        }`}
      >
        {pincodes.map((pincode) => (
          <span
            key={pincode}
            className="inline-flex h-7 items-center gap-1 rounded-pill bg-surface-alt pl-2.5 pr-1 font-mono text-xs font-medium text-fg"
          >
            {pincode}
            <button
              type="button"
              onClick={() => onChange(pincodes.filter((p) => p !== pincode))}
              disabled={disabled}
              aria-label={`Remove ${pincode}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-default"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (hint) setHint(null)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) addFrom(draft)
          }}
          placeholder={
            pincodes.length === 0
              ? 'Type or paste pincodes — e.g. 629154, 629001'
              : undefined
          }
          inputMode="numeric"
          disabled={disabled || full}
          aria-label={label}
          className="h-8 min-w-40 flex-1 bg-transparent px-1.5 text-sm text-fg outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{hint}</p>
      ) : (
        <p className="mt-1.5 text-xs text-muted">
          Press Enter after each pincode, or paste a comma-separated list.
        </p>
      )}
    </div>
  )
}

/**
 * The product form's delivery field: follow the store default, or set a
 * rule for this product alone. `value` is `null` while following the
 * default — the same representation the API uses, so the form can send it
 * straight through (null = drop the override).
 */
export function ProductDeliveryField({
  storeRule,
  value,
  onChange,
  disabled = false,
}: {
  /** The store's current default, so the "use default" option can say what it is. */
  storeRule: DeliveryRule
  value: DeliveryRule | null
  onChange: (next: DeliveryRule | null) => void
  disabled?: boolean
}) {
  // Kept while the seller flips back to the default, so re-enabling the
  // override restores what they had typed instead of a blank rule.
  const [remembered, setRemembered] = useState<DeliveryRule>(
    value ?? { type: 'INCLUDE', pincodes: [] },
  )
  const custom = value !== null

  const choose = (next: boolean) => {
    if (next === custom) return
    if (next) {
      onChange(remembered)
    } else {
      if (value) setRemembered(value)
      onChange(null)
    }
  }

  const options = [
    {
      custom: false,
      title: 'Use store default',
      detail: describeDeliveryRule(storeRule),
    },
    {
      custom: true,
      title: 'Custom for this product',
      detail: 'Set where this product can be delivered.',
    },
  ]

  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-muted">
        Delivery areas
      </span>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Delivery areas">
        {options.map((option) => {
          const selected = option.custom === custom
          return (
            <button
              key={String(option.custom)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => choose(option.custom)}
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                selected
                  ? 'border-brand bg-brand/5'
                  : 'border-line bg-surface hover:bg-surface-alt'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? 'border-brand bg-brand text-brand-contrast'
                    : 'border-line'
                }`}
              >
                {selected && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {option.detail}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {value && (
        <div className="mt-3 rounded-md border border-line bg-surface p-3">
          <DeliveryRuleEditor
            value={value}
            onChange={(next) => {
              setRemembered(next)
              onChange(next)
            }}
            disabled={disabled}
            dense
          />
        </div>
      )}
    </div>
  )
}
