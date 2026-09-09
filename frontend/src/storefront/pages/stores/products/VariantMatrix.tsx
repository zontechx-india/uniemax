import { useEffect, useRef, useState } from 'react'
import {
  OPTION_LIMITS,
  draftLabel,
  rowsNeedingPrice,
} from '../../../features/stores/productOptions'
import type {
  OptionTypeDraft,
  VariantDraft,
} from '../../../features/stores/productOptions'
import type { StoreProductMediaItem } from '../../../features/stores/storesApi'
import { ActiveSwitch } from '../ActiveSwitch'
import { CheckIcon, ChevronDownIcon, TrashIcon } from '../../../layout/icons'

/**
 * Every combination of the option types, one row each — photo, SKU, price,
 * MRP, stock and an on/off switch. The rows are generated from the option
 * values; the seller never adds one by hand. What they CAN do is take a
 * combination off the list ("we don't do XL in pink"): a removed row drops to
 * a "not offered" strip below the grid and can be brought back with one click,
 * so the grid never loses a combination the seller might want later.
 *
 * Photos are chosen by looking at them: the thumbnail is the control, and it
 * opens the product's own photos to pick from — never a "Photo 3" in a list.
 *
 * From `sm` up it is a table with one column per option type; on a phone each
 * combination is a card, because a seven-column table at 375px is unusable.
 * Bulk helpers exist because a 6 × 4 matrix is 24 prices to type and most of
 * them are the same — and because "every pink one shows the pink photo" is
 * one decision, not six.
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
  /** The product's photos, for the per-variant picker. Empty before the first upload. */
  media: StoreProductMediaItem[]
  onChange: (rows: VariantDraft[]) => void
  disabled?: boolean
}) {
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkMrp, setBulkMrp] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [photoTypeKey, setPhotoTypeKey] = useState('')
  const [photoValueKey, setPhotoValueKey] = useState('')
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null)

  const patchRow = (index: number, patch: Partial<VariantDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const setOffered = (patch: Partial<VariantDraft>) =>
    onChange(rows.map((row) => (row.removed ? row : { ...row, ...patch })))

  const offered = rows.filter((row) => !row.removed)
  const removed = rows.filter((row) => row.removed)
  const missing = rowsNeedingPrice(rows)
  const valueOf = (row: VariantDraft, type: OptionTypeDraft) =>
    type.values.find((v) => v.key === row.valueKeys[type.key])?.value ?? '—'

  const photoType = types.find((type) => type.key === photoTypeKey)
  const photoValue = photoType?.values.find((v) => v.key === photoValueKey)
  const applyPhotoByValue = () => {
    if (!photoTypeKey || !photoValueKey) return
    onChange(
      rows.map((row) =>
        row.valueKeys[photoTypeKey] === photoValueKey
          ? { ...row, mediaId: photoMediaId }
          : row,
      ),
    )
  }

  const inputClass =
    'h-9 w-full rounded-md border border-line bg-input px-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'
  const helperButton =
    'h-9 shrink-0 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50'
  const helperLabel =
    'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted'

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        Add a value to each option above and the combinations will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bulk helpers — one number for the whole list, then only the exceptions. */}
      <div className="space-y-3 rounded-md bg-surface-alt/60 p-3">
        <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <BulkField
            label="Set every price"
            value={bulkPrice}
            onChange={setBulkPrice}
            placeholder="₹"
            inputMode="decimal"
            disabled={disabled}
            inputClass={inputClass}
            buttonClass={helperButton}
            labelClass={helperLabel}
            onApply={() => setOffered({ price: bulkPrice.trim() })}
          />
          <BulkField
            label="Set every MRP"
            value={bulkMrp}
            onChange={setBulkMrp}
            placeholder="₹"
            inputMode="decimal"
            disabled={disabled}
            inputClass={inputClass}
            buttonClass={helperButton}
            labelClass={helperLabel}
            onApply={() => setOffered({ compareAt: bulkMrp.trim() })}
          />
          <BulkField
            label="Set every stock"
            value={bulkStock}
            onChange={setBulkStock}
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
            className={`${helperButton} w-full lg:w-auto`}
          >
            Enable all
          </button>
        </div>

        {/* "Every Pink shows the pink photo" — one decision for a whole value. */}
        {media.length > 0 && (
          <div className="border-t border-line/70 pt-3">
            <span className={helperLabel}>Same photo for every…</span>
            <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
              <select
                value={photoTypeKey}
                onChange={(e) => {
                  setPhotoTypeKey(e.target.value)
                  setPhotoValueKey('')
                }}
                disabled={disabled}
                aria-label="Option"
                className={inputClass}
              >
                <option value="">Choose an option…</option>
                {types.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.name.trim() || 'Option'}
                  </option>
                ))}
              </select>
              <select
                value={photoValueKey}
                onChange={(e) => setPhotoValueKey(e.target.value)}
                disabled={disabled || !photoType}
                aria-label="Value"
                className={inputClass}
              >
                <option value="">
                  {photoType ? `Which ${photoType.name.trim() || 'value'}…` : 'Then a value…'}
                </option>
                {(photoType?.values ?? []).map((value) => (
                  <option key={value.key} value={value.key}>
                    {value.value}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted sm:hidden">shows</span>
                <PhotoPicker
                  value={photoMediaId}
                  media={media}
                  onChange={setPhotoMediaId}
                  disabled={disabled}
                  label={
                    photoValue
                      ? `Photo for every ${photoValue.value}`
                      : 'Photo to apply'
                  }
                />
              </div>
              <button
                type="button"
                onClick={applyPhotoByValue}
                disabled={disabled || !photoTypeKey || !photoValueKey}
                className={`${helperButton} w-full sm:w-auto`}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* sm+: table */}
      <div className="hidden overflow-x-auto rounded-md border border-line sm:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Photo</th>
              {types.map((type) => (
                <th key={type.key} className="whitespace-nowrap px-3 py-2">
                  {type.name.trim() || 'Option'}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2">SKU</th>
              <th className="whitespace-nowrap px-3 py-2">Price (₹)</th>
              <th className="whitespace-nowrap px-3 py-2">MRP (₹)</th>
              <th className="whitespace-nowrap px-3 py-2">Stock</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">On sale</th>
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
                  <td className="px-3 py-2">
                    <PhotoPicker
                      value={row.mediaId}
                      media={media}
                      onChange={(mediaId) => patchRow(index, { mediaId })}
                      disabled={disabled}
                      label={`Photo for ${draftLabel(types, row)}`}
                    />
                  </td>
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
                      aria-label={`SKU for ${draftLabel(types, row)}`}
                      className={`${inputClass} w-32 font-mono`}
                    />
                  </td>
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
                      value={row.compareAt}
                      onChange={(e) => patchRow(index, { compareAt: e.target.value })}
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
                  <td className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => patchRow(index, { removed: true })}
                      disabled={disabled || offered.length === 1}
                      aria-label={`Don't offer ${draftLabel(types, row)}`}
                      title="Don't offer this combination"
                      className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
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
      <ul className="space-y-2 sm:hidden">
        {rows.map((row, index) =>
          row.removed ? null : (
            <li
              key={Object.values(row.valueKeys).join('|')}
              className={`rounded-md border border-line bg-surface p-3 ${
                row.isActive ? '' : 'opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                <PhotoPicker
                  value={row.mediaId}
                  media={media}
                  onChange={(mediaId) => patchRow(index, { mediaId })}
                  disabled={disabled}
                  label={`Photo for ${draftLabel(types, row)}`}
                />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                  {draftLabel(types, row)}
                </p>
                <ActiveSwitch
                  checked={row.isActive}
                  disabled={disabled}
                  label={`${row.isActive ? 'Disable' : 'Enable'} ${draftLabel(types, row)}`}
                  onChange={(next) => patchRow(index, { isActive: next })}
                />
                <button
                  type="button"
                  onClick={() => patchRow(index, { removed: true })}
                  disabled={disabled || offered.length === 1}
                  aria-label={`Don't offer ${draftLabel(types, row)}`}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
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
                    MRP (₹)
                  </span>
                  <input
                    value={row.compareAt}
                    onChange={(e) => patchRow(index, { compareAt: e.target.value })}
                    inputMode="decimal"
                    placeholder="Optional"
                    disabled={disabled}
                    className={inputClass}
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
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">
                    SKU
                  </span>
                  <input
                    value={row.sku}
                    onChange={(e) => patchRow(index, { sku: e.target.value })}
                    maxLength={64}
                    placeholder="Optional"
                    disabled={disabled}
                    className={`${inputClass} font-mono`}
                  />
                </label>
              </div>
            </li>
          ),
        )}
      </ul>

      {/* Combinations the seller does not offer — one click brings any back. */}
      {removed.length > 0 && (
        <div className="rounded-md border border-dashed border-line px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Not offered
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rows.map((row, index) =>
              row.removed ? (
                <li key={Object.values(row.valueKeys).join('|')}>
                  <button
                    type="button"
                    onClick={() => patchRow(index, { removed: false })}
                    disabled={disabled}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <span className="line-through">{draftLabel(types, row)}</span>
                    <span className="font-semibold">Offer</span>
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        <span className="font-medium text-fg">{offered.length}</span> of{' '}
        {rows.length} combination{rows.length === 1 ? '' : 's'} offered (max{' '}
        {OPTION_LIMITS.variants})
        {missing > 0 && (
          <>
            {' · '}
            <span className="font-medium text-danger">
              {missing} need{missing === 1 ? 's' : ''} a price
            </span>
          </>
        )}
        . Listings show the cheapest as a “from” price; an MRP shows struck
        through beside the price.
      </p>
    </div>
  )
}

/**
 * The photo a combination shows, chosen by sight: the thumbnail IS the
 * control, and it opens the product's own photos to pick from. "Cover" (the
 * first photo) is what a combination shows when nothing is chosen.
 */
function PhotoPicker({
  value,
  media,
  onChange,
  disabled,
  label,
}: {
  value: string | null
  media: StoreProductMediaItem[]
  onChange: (mediaId: string | null) => void
  disabled: boolean
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cover = media[0] ?? null
  const chosen = value ? (media.find((item) => item.id === value) ?? null) : null
  const shown = chosen ?? cover
  const pick = (mediaId: string | null) => {
    onChange(mediaId)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || media.length === 0}
        aria-label={label}
        aria-expanded={open}
        title={
          media.length === 0
            ? 'Add photos in the Photos step first, then pick one here'
            : 'Tap to choose which photo this combination shows'
        }
        className="flex items-center gap-1 rounded-md border border-line bg-input p-1 pr-1.5 transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-alt">
          {shown?.url ? (
            <img src={shown.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[9px] font-semibold uppercase text-muted">Cover</span>
          )}
          {!chosen && shown?.url && (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[8px] font-semibold uppercase leading-3 text-white">
              Cover
            </span>
          )}
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-line bg-surface p-2 shadow-floating">
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Which photo?
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            <PhotoTile
              url={cover?.url ?? null}
              caption="Cover"
              selected={value === null}
              onClick={() => pick(null)}
            />
            {media.map((item, i) => (
              <PhotoTile
                key={item.id}
                url={item.url}
                caption={String(i + 1)}
                selected={value === item.id}
                onClick={() => pick(item.id)}
              />
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted">
            “Cover” follows the first photo, whichever that is.
          </p>
        </div>
      )}
    </div>
  )
}

function PhotoTile({
  url,
  caption,
  selected,
  onClick,
}: {
  url: string | null
  caption: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={caption === 'Cover' ? 'Use the cover photo' : `Use photo ${caption}`}
      className={`relative aspect-square overflow-hidden rounded-md border transition ${
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-brand'
      }`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-surface-alt text-[9px] text-muted">
          —
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] font-semibold uppercase leading-4 text-white">
        {caption}
      </span>
      {selected && (
        <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-contrast">
          <CheckIcon className="h-3 w-3" />
        </span>
      )}
    </button>
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
      <div className="flex gap-1.5">
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
