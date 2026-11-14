import { OPTION_LIMITS } from '../../../features/stores/productOptions'
import type { ProductSpec } from '../../../features/stores/storesApi'
import { PlusIcon, TrashIcon } from '../../../layout/icons'

/**
 * Ordered "Label: value" rows shown as the storefront's specification table
 * ("Material: Memory foam", "Thickness: 8 inch"). Descriptive only — anything
 * a customer chooses BETWEEN belongs in option types, not here.
 *
 * Controlled: the parent form owns the rows and saves them with its other
 * fields. Order matters (it is the display order), hence the up/down moves.
 */
export function SpecificationsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: ProductSpec[]
  onChange: (next: ProductSpec[]) => void
  disabled?: boolean
}) {
  const set = (index: number, patch: Partial<ProductSpec>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  const inputClass =
    'h-tap rounded-md border border-line bg-input px-3 text-base text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

  return (
    // The heading is the wizard Section's ("Product facts") — not repeated here.
    <div>
      {value.length > 0 && (
        // One line per fact, like a key–value table: what | answer | move |
        // delete. No box around each row. A phone keeps only "move up" (any
        // order is reachable with it); "move down" joins from `sm`.
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <input
                value={row.label}
                onChange={(e) => set(index, { label: e.target.value })}
                placeholder="Material"
                maxLength={OPTION_LIMITS.specLabelLength}
                disabled={disabled}
                aria-label={`Specification ${index + 1} label`}
                className={`${inputClass} w-[38%] shrink-0 font-semibold sm:w-48`}
              />
              <input
                value={row.value}
                onChange={(e) => set(index, { value: e.target.value })}
                placeholder="e.g. Cotton"
                maxLength={OPTION_LIMITS.specValueLength}
                disabled={disabled}
                aria-label={`Specification ${index + 1} value`}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                aria-label="Move up"
                className="flex h-tap w-8 shrink-0 items-center justify-center rounded-md text-xs text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={disabled || index === value.length - 1}
                aria-label="Move down"
                className="hidden h-tap w-8 shrink-0 items-center justify-center rounded-md text-xs text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30 sm:flex"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label={`Remove specification ${index + 1}`}
                className="flex h-tap w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, { label: '', value: '' }])}
        disabled={disabled || value.length >= OPTION_LIMITS.specs}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-brand/50 px-3 text-sm font-semibold text-brand transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${
          value.length > 0 ? 'mt-2.5' : ''
        }`}
      >
        <PlusIcon className="h-4 w-4" />
        Add a fact
      </button>
      <p className="mt-1.5 text-hint text-muted">
        Like Material: Cotton. Sizes and colours go in step 3, Price & stock.
      </p>
    </div>
  )
}

/** Trim, drop empty rows, cap — what gets sent. */
export function cleanSpecifications(rows: ProductSpec[]): ProductSpec[] {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label && row.value)
    .slice(0, OPTION_LIMITS.specs)
}
