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
    'h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-muted">
        Specifications{' '}
        <span className="font-normal text-muted">(optional)</span>
      </span>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={row.label}
                onChange={(e) => set(index, { label: e.target.value })}
                placeholder="Label — e.g. Material"
                maxLength={OPTION_LIMITS.specLabelLength}
                disabled={disabled}
                aria-label={`Specification ${index + 1} label`}
                className={`${inputClass} sm:w-48 sm:shrink-0`}
              />
              <input
                value={row.value}
                onChange={(e) => set(index, { value: e.target.value })}
                placeholder="Value — e.g. Memory foam"
                maxLength={OPTION_LIMITS.specValueLength}
                disabled={disabled}
                aria-label={`Specification ${index + 1} value`}
                className={inputClass}
              />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  aria-label="Move up"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === value.length - 1}
                  aria-label="Move down"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={`Remove specification ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, { label: '', value: '' }])}
        disabled={disabled || value.length >= OPTION_LIMITS.specs}
        className={`inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${
          value.length > 0 ? 'mt-2' : ''
        }`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Add specification
      </button>
      <p className="mt-2 text-xs text-muted">
        Facts about the product, shown as a table on its page. Things customers
        choose between (size, colour…) are options, not specifications.
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
