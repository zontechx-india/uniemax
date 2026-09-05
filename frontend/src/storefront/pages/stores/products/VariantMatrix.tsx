import { useState } from 'react'
import {
  OPTION_LIMITS,
  draftLabel,
  rowsNeedingPrice,
} from '../../../features/stores/productOptions'
import type {
  OptionTypeDraft,
  VariantDraft,
} from '../../../features/stores/productOptions'
import { ActiveSwitch } from '../ActiveSwitch'

/**
 * Every combination of the option types, one row each, with its price, stock
 * and on/off switch. The rows are generated — the seller never adds or removes
 * one by hand; they change the option values and the matrix follows.
 *
 * From `sm` up it is a table with one column per option type; on a phone each
 * combination is a card, because a five-column table at 375px is unusable.
 * "Set all" helpers exist because a 6 × 4 matrix is 24 prices to type and
 * most of them are the same.
 */
export function VariantMatrix({
  types,
  rows,
  onChange,
  disabled = false,
}: {
  types: OptionTypeDraft[]
  rows: VariantDraft[]
  onChange: (rows: VariantDraft[]) => void
  disabled?: boolean
}) {
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')

  const patchRow = (index: number, patch: Partial<VariantDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const setAll = (patch: Partial<VariantDraft>) =>
    onChange(rows.map((row) => ({ ...row, ...patch })))

  const missing = rowsNeedingPrice(rows)
  const valueOf = (row: VariantDraft, type: OptionTypeDraft) =>
    type.values.find((v) => v.key === row.valueKeys[type.key])?.value ?? '—'

  const inputClass =
    'h-9 w-full rounded-md border border-line bg-input px-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        Add a value to each option above and the combinations will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bulk helpers */}
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-alt/60 p-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Set every price
          </span>
          <div className="flex gap-1.5">
            <input
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              inputMode="decimal"
              placeholder="₹"
              disabled={disabled}
              className={`${inputClass} w-28`}
            />
            <button
              type="button"
              onClick={() => {
                if (bulkPrice.trim()) setAll({ price: bulkPrice.trim() })
              }}
              disabled={disabled || !bulkPrice.trim()}
              className="h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Set every stock
          </span>
          <div className="flex gap-1.5">
            <input
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value)}
              inputMode="numeric"
              placeholder="Qty"
              disabled={disabled}
              className={`${inputClass} w-24`}
            />
            <button
              type="button"
              onClick={() => {
                if (bulkStock.trim()) setAll({ stock: bulkStock.trim() })
              }}
              disabled={disabled || !bulkStock.trim()}
              className="h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </label>
        <button
          type="button"
          onClick={() => setAll({ isActive: true })}
          disabled={disabled || rows.every((row) => row.isActive)}
          className="h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50"
        >
          Enable all
        </button>
      </div>

      {/* sm+: table */}
      <div className="hidden overflow-x-auto rounded-md border border-line sm:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              {types.map((type) => (
                <th key={type.key} className="px-3 py-2">
                  {type.name.trim() || 'Option'}
                </th>
              ))}
              <th className="px-3 py-2">Price (₹)</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2 text-right">On sale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) => (
              <tr
                key={Object.values(row.valueKeys).join('|')}
                className={row.isActive ? '' : 'text-muted'}
              >
                {types.map((type) => (
                  <td key={type.key} className="px-3 py-2 font-medium">
                    {valueOf(row, type)}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <input
                    value={row.price}
                    onChange={(e) => patchRow(index, { price: e.target.value })}
                    inputMode="decimal"
                    placeholder="Required"
                    disabled={disabled}
                    aria-label={`Price for ${draftLabel(types, row)}`}
                    className={`${inputClass} w-28 ${
                      row.price.trim() === '' ? 'border-danger/60' : ''
                    }`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.stock}
                    onChange={(e) => patchRow(index, { stock: e.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    disabled={disabled}
                    aria-label={`Stock for ${draftLabel(types, row)}`}
                    className={`${inputClass} w-20`}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <ActiveSwitch
                    checked={row.isActive}
                    disabled={disabled}
                    label={`${row.isActive ? 'Disable' : 'Enable'} ${draftLabel(types, row)}`}
                    onChange={(next) => patchRow(index, { isActive: next })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row, index) => (
          <li
            key={Object.values(row.valueKeys).join('|')}
            className={`rounded-md border border-line bg-surface p-3 ${
              row.isActive ? '' : 'opacity-70'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-fg">
                {draftLabel(types, row)}
              </p>
              <ActiveSwitch
                checked={row.isActive}
                disabled={disabled}
                label={`${row.isActive ? 'Disable' : 'Enable'} ${draftLabel(types, row)}`}
                onChange={(next) => patchRow(index, { isActive: next })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">
                  Price (₹)
                </span>
                <input
                  value={row.price}
                  onChange={(e) => patchRow(index, { price: e.target.value })}
                  inputMode="decimal"
                  placeholder="Required"
                  disabled={disabled}
                  className={`${inputClass} ${
                    row.price.trim() === '' ? 'border-danger/60' : ''
                  }`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">
                  Stock
                </span>
                <input
                  value={row.stock}
                  onChange={(e) => patchRow(index, { stock: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                  disabled={disabled}
                  className={inputClass}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">
        {types.map((t) => t.values.length).join(' × ')} ={' '}
        <span className="font-medium text-fg">{rows.length}</span> combination
        {rows.length === 1 ? '' : 's'} (max {OPTION_LIMITS.variants})
        {missing > 0 && (
          <>
            {' · '}
            <span className="font-medium text-danger">
              {missing} need{missing === 1 ? 's' : ''} a price
            </span>
          </>
        )}
        . Listings show the cheapest as a “from” price.
      </p>
    </div>
  )
}
