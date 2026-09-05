import { ChipInput } from '../../../../shared/ui/ChipInput'
import { TextField } from '../../../../shared/ui/form'
import {
  OPTION_LIMITS,
  newKey,
} from '../../../features/stores/productOptions'
import type { OptionTypeDraft } from '../../../features/stores/productOptions'
import { PlusIcon, TrashIcon } from '../../../layout/icons'

/**
 * The seller's option types — up to three named dimensions, each with its
 * values as chips. This edits the DRAFT model (`OptionTypeDraft`, keyed), so
 * renaming "Option" to "Size" or "Red" to "Crimson" keeps every combination
 * that depends on it; the parent reconciles the matrix on every change.
 *
 * `initialOptionTypes` is the hook for a future category template: passing
 * suggested types pre-fills the editor without any other change.
 */
export function OptionTypesEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: OptionTypeDraft[]
  onChange: (next: OptionTypeDraft[]) => void
  disabled?: boolean
}) {
  const update = (key: string, patch: (type: OptionTypeDraft) => OptionTypeDraft) =>
    onChange(value.map((type) => (type.key === key ? patch(type) : type)))

  const addType = () =>
    onChange([...value, { key: newKey(), name: '', values: [] }])

  return (
    <div className="space-y-3">
      {value.map((type, index) => (
        <div
          key={type.key}
          className="rounded-md border border-line bg-surface p-3.5"
        >
          <div className="flex items-start gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
              <TextField
                label={`Option ${index + 1}`}
                placeholder={['e.g. Size', 'e.g. Colour', 'e.g. Material'][index] ?? 'Name'}
                value={type.name}
                onChange={(e) =>
                  update(type.key, (t) => ({ ...t, name: e.target.value }))
                }
                maxLength={OPTION_LIMITS.nameLength}
                disabled={disabled}
                className="!h-11"
              />
              <ChipInput
                label="Values"
                items={type.values}
                placeholder="Type a value and press Enter — e.g. S, M, L"
                maxItems={OPTION_LIMITS.valuesPerType}
                maxLength={OPTION_LIMITS.nameLength}
                disabled={disabled}
                ariaLabel={`Values for ${type.name || `option ${index + 1}`}`}
                onAdd={(v) =>
                  update(type.key, (t) => ({
                    ...t,
                    values: [...t.values, { key: newKey(), value: v }],
                  }))
                }
                onRemove={(valueKey) =>
                  update(type.key, (t) => ({
                    ...t,
                    values: t.values.filter((v) => v.key !== valueKey),
                  }))
                }
                onRename={(valueKey, v) =>
                  update(type.key, (t) => ({
                    ...t,
                    values: t.values.map((entry) =>
                      entry.key === valueKey ? { ...entry, value: v } : entry,
                    ),
                  }))
                }
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t.key !== type.key))}
              disabled={disabled}
              className="mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              aria-label={`Remove option ${type.name || index + 1}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addType}
          disabled={disabled || value.length >= OPTION_LIMITS.types}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add option
        </button>
        <p className="text-xs text-muted">
          Up to {OPTION_LIMITS.types} options. Every combination of their values
          becomes a variant with its own price and stock — switch off the ones
          you don’t sell.
        </p>
      </div>
    </div>
  )
}
