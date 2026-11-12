import { useState } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { buttonClass } from '../../../../shared/ui/Button'
import { BigSwitch } from '../ui/BigSwitch'
import {
  OPTION_LIMITS,
  cleanAmount,
  cleanCount,
  draftLabel,
  rowsNeedingPrice,
} from '../../../features/stores/productOptions'
import type {
  OptionTypeDraft,
  VariantDraft,
} from '../../../features/stores/productOptions'
import type { StoreProductMediaItem } from '../../../features/stores/storesApi'
import { ActiveSwitch } from '../ActiveSwitch'
import { SlidersIcon, TrashIcon } from '../../../layout/icons'
import { MediaImg } from '../../../../shared/media/MediaImg'

/**
 * Every combination of the option types, one row each — photo, SKU, price,
 * MRP, stock and an on/off switch. The rows are generated from the option
 * values; the seller never adds one by hand. What they CAN do is take a
 * combination off the list ("we don't do XL in pink"): a removed row drops to
 * a "not offered" strip below the grid and can be brought back with one click,
 * so the grid never loses a combination the seller might want later.
 *
 * Photos are NOT chosen here: they belong to a look (every Pink row shows
 * the Pink photo) and are picked one per value on the screen before this
 * (`wizard/VariantPhotos.tsx`). A row only shows its photo, read-only.
 *
 * From `sm` up it is a table with one column per option type; on a phone each
 * combination is a card, because a seven-column table at 375px is unusable.
 * Bulk helpers exist because a 6 × 4 matrix is 24 prices to type and most of
 * them are the same. They live in ONE sheet ("Same price for all…")
 * rather than a panel above the list, where four bulk fields and two
 * selects pushed the actual prices a screen down on a phone.
 *
 * Phone cards: 44px fields, a labelled Selling / Not selling switch, and a
 * worded "Don't sell this" — not a bare bin beside the switch.
 */
export function VariantMatrix({
  types,
  rows,
  media,
  onChange,
  disabled = false,
}: {
  types: OptionTypeDraft[]
  rows: VariantDraft[]
  /** The product's photos, to show each row's chosen one. */
  media: StoreProductMediaItem[]
  onChange: (rows: VariantDraft[]) => void
  disabled?: boolean
}) {
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkMrp, setBulkMrp] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)

  const patchRow = (index: number, patch: Partial<VariantDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const setOffered = (patch: Partial<VariantDraft>) =>
    onChange(rows.map((row) => (row.removed ? row : { ...row, ...patch })))

  const offered = rows.filter((row) => !row.removed)
  const removed = rows.filter((row) => row.removed)
  const missing = rowsNeedingPrice(rows)
  const photoOf = (row: VariantDraft) =>
    row.mediaId ? (media.find((item) => item.id === row.mediaId) ?? null) : null
  const withPhotos = offered.some((row) => photoOf(row) !== null)
  const valueOf = (row: VariantDraft, type: OptionTypeDraft) =>
    type.values.find((v) => v.key === row.valueKeys[type.key])?.value ?? '—'

  // 44px on phones (the card fields); the dense desktop table keeps 36px.
  const inputClass =
    'h-tap w-full rounded-md border border-line bg-input px-3 text-base text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60 sm:h-9 sm:px-2.5 sm:text-sm'
  const helperButton =
    'min-h-tap shrink-0 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50'
  const helperLabel = 'mb-1.5 block text-sm font-semibold text-fg'

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-base text-muted">
        Go back and add an option to each choice — like S, M, L for Size.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bulk helpers — one number for the whole list, then only the exceptions. */}
      <button
        type="button"
        onClick={() => setBulkOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        className={buttonClass({ variant: 'secondary', size: 'md', className: 'w-full sm:w-auto' })}
      >
        <SlidersIcon className="h-4 w-4" />
        Same price for all…
      </button>
      <Dialog
        open={bulkOpen}
        title="Fill in all at once"
        subtitle="Type once, then tap Apply. Change any single one afterwards."
        onClose={() => setBulkOpen(false)}
      >
      <div className="space-y-4">
        <div className="grid gap-4">
          <BulkField
            label="Same price for all (₹)"
            value={bulkPrice}
            onChange={(v) => setBulkPrice(cleanAmount(v))}
            placeholder="₹"
            inputMode="decimal"
            disabled={disabled}
            inputClass={inputClass}
            buttonClass={helperButton}
            labelClass={helperLabel}
            onApply={() => setOffered({ price: bulkPrice.trim() })}
          />
          <BulkField
            label="Same printed price / MRP for all (₹)"
            value={bulkMrp}
            onChange={(v) => setBulkMrp(cleanAmount(v))}
            placeholder="₹"
            inputMode="decimal"
            disabled={disabled}
            inputClass={inputClass}
            buttonClass={helperButton}
            labelClass={helperLabel}
            onApply={() => setOffered({ compareAt: bulkMrp.trim() })}
          />
          <BulkField
            label="Same stock for all"
            value={bulkStock}
            onChange={(v) => setBulkStock(cleanCount(v))}
            placeholder="Qty"
            inputMode="numeric"
            disabled={disabled}
            inputClass={inputClass}
            buttonClass={helperButton}
            labelClass={helperLabel}
            onApply={() => setOffered({ stock: bulkStock.trim() })}
          />
          <button
            type="button"
            onClick={() => setOffered({ isActive: true })}
            disabled={disabled || offered.every((row) => row.isActive)}
            className={`${helperButton} w-full`}
          >
            Turn all on
          </button>
        </div>
      </div>
      </Dialog>

      {/* sm+: table */}
      <div className="hidden overflow-x-auto rounded-md border border-line sm:block">
        <table className="w-full text-sm">
          <thead className="bg-fg/[0.04] text-left text-xs font-semibold text-muted">
            <tr>
              {withPhotos && <th className="whitespace-nowrap px-3 py-2">Photo</th>}
              {types.map((type) => (
                <th key={type.key} className="whitespace-nowrap px-3 py-2">
                  {type.name.trim() || 'Option'}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2">Code</th>
              <th className="whitespace-nowrap px-3 py-2">Price (₹)</th>
              <th className="whitespace-nowrap px-3 py-2">MRP (₹)</th>
              <th className="whitespace-nowrap px-3 py-2">Stock</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Selling</th>
              <th className="px-1 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) =>
              row.removed ? null : (
                <tr
                  key={Object.values(row.valueKeys).join('|')}
                  className={row.isActive ? '' : 'text-muted'}
                >
                  {withPhotos && (
                    <td className="px-3 py-2">
                      <RowPhoto url={photoOf(row)?.url ?? null} />
                    </td>
                  )}
                  {types.map((type) => (
                    <td key={type.key} className="whitespace-nowrap px-3 py-2 font-medium">
                      {valueOf(row, type)}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input
                      value={row.sku}
                      onChange={(e) => patchRow(index, { sku: e.target.value })}
                      maxLength={64}
                      placeholder="Optional"
                      disabled={disabled}
                      aria-label={`Product code for ${draftLabel(types, row)}`}
                      className={`${inputClass} w-32`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.price}
                      onChange={(e) => patchRow(index, { price: cleanAmount(e.target.value) })}
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
                      value={row.compareAt}
                      onChange={(e) => patchRow(index, { compareAt: cleanAmount(e.target.value) })}
                      inputMode="decimal"
                      placeholder="Optional"
                      disabled={disabled}
                      aria-label={`MRP for ${draftLabel(types, row)}`}
                      className={`${inputClass} w-28`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.stock}
                      onChange={(e) => patchRow(index, { stock: cleanCount(e.target.value) })}
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
                  <td className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => patchRow(index, { removed: true })}
                      disabled={disabled || offered.length === 1}
                      aria-label={`Don't offer ${draftLabel(types, row)}`}
                      title="Don't sell this one"
                      className="flex size-tap items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <ul className="space-y-3 sm:hidden">
        {rows.map((row, index) =>
          row.removed ? null : (
            <li
              key={Object.values(row.valueKeys).join('|')}
              className={`rounded-2xl border border-line bg-surface/80 p-3.5 ${
                row.isActive ? '' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3">
                {withPhotos && <RowPhoto url={photoOf(row)?.url ?? null} />}
                <p className="min-w-0 flex-1 text-base leading-snug font-bold break-words text-fg">
                  {draftLabel(types, row)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block text-hint font-semibold text-fg">
                    Price (₹)
                  </span>
                  <input
                    value={row.price}
                    onChange={(e) => patchRow(index, { price: cleanAmount(e.target.value) })}
                    inputMode="decimal"
                    placeholder="Required"
                    disabled={disabled}
                    className={`${inputClass} ${
                      row.price.trim() === '' ? 'border-danger/60' : ''
                    }`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-hint font-semibold text-fg">
                    MRP (₹) <span className="font-normal text-muted">optional</span>
                  </span>
                  <input
                    value={row.compareAt}
                    onChange={(e) => patchRow(index, { compareAt: cleanAmount(e.target.value) })}
                    inputMode="decimal"
                    placeholder="Optional"
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-hint font-semibold text-fg">
                    How many you have
                  </span>
                  <input
                    value={row.stock}
                    onChange={(e) => patchRow(index, { stock: cleanCount(e.target.value) })}
                    inputMode="numeric"
                    placeholder="0"
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-hint font-semibold text-fg">
                    Code <span className="font-normal text-muted">optional</span>
                  </span>
                  <input
                    value={row.sku}
                    onChange={(e) => patchRow(index, { sku: e.target.value })}
                    maxLength={64}
                    placeholder="Optional"
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
                <BigSwitch
                  checked={row.isActive}
                  disabled={disabled}
                  label={`Sell ${draftLabel(types, row)}`}
                  onText="Selling"
                  offText="Paused"
                  onChange={(next) => patchRow(index, { isActive: next })}
                />
                <button
                  type="button"
                  onClick={() => patchRow(index, { removed: true })}
                  disabled={disabled || offered.length === 1}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                  Don’t sell this
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {/* Combinations the seller does not offer — one click brings any back. */}
      {removed.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line px-3.5 py-3">
          <p className="text-sm font-semibold text-fg">Not selling</p>
          <p className="text-hint text-muted">Tap one to sell it again.</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rows.map((row, index) =>
              row.removed ? (
                <li key={Object.values(row.valueKeys).join('|')}>
                  <button
                    type="button"
                    onClick={() => patchRow(index, { removed: false })}
                    disabled={disabled}
                    className="inline-flex min-h-tap items-center gap-2 rounded-pill border border-line bg-surface px-3.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <span className="line-through">{draftLabel(types, row)}</span>
                    <span className="font-semibold text-brand">Sell again</span>
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}

      <p className="text-hint text-muted">
        Selling <span className="font-semibold text-fg">{offered.length}</span> of{' '}
        {rows.length} choice{rows.length === 1 ? '' : 's'} (up to{' '}
        {OPTION_LIMITS.variants})
        {missing > 0 && (
          <>
            {' · '}
            <span className="font-medium text-danger">
              {missing} need{missing === 1 ? 's' : ''} a price
            </span>
          </>
        )}
        . Your shop shows the lowest price as “from ₹…”.
      </p>
    </div>
  )
}

/** A row's photo, shown not chosen — the Photos screen chose it. */
function RowPhoto({ url }: { url: string | null }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-alt">
      {url ? (
        <MediaImg sizes="48px" src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs text-muted">—</span>
      )}
    </span>
  )
}

function BulkField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  disabled,
  inputClass,
  buttonClass,
  labelClass,
  onApply,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputMode: 'decimal' | 'numeric'
  disabled: boolean
  inputClass: string
  buttonClass: string
  labelClass: string
  onApply: () => void
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputClass} min-w-0`}
        />
        <button
          type="button"
          onClick={() => {
            if (value.trim()) onApply()
          }}
          disabled={disabled || !value.trim()}
          className={buttonClass}
        >
          Apply
        </button>
      </div>
    </label>
  )
}
