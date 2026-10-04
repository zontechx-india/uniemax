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
import { CheckIcon, ChevronDownIcon, SlidersIcon, TrashIcon } from '../../../layout/icons'
import { MediaImg } from '../../../../shared/media/MediaImg'

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
 * one decision, not six. They live in ONE sheet ("Same price for all…")
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
  const [bulkOpen, setBulkOpen] = useState(false)

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

  // 44px on phones (the card fields); the dense desktop table keeps 36px.
  const inputClass =
    'h-tap w-full rounded-md border border-line bg-input px-3 text-[15px] text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60 sm:h-9 sm:px-2.5 sm:text-sm'
  const helperButton =
    'min-h-tap shrink-0 rounded-md border border-line bg-surface px-4 text-[14px] font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50'
  const helperLabel = 'mb-1.5 block text-[14px] font-semibold text-fg'

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[15px] text-muted">
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
        className={buttonClass({ variant: 'ring', size: 'md', className: 'w-full sm:w-auto' })}
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

        {/* "Every Pink shows the pink photo" — one decision for a whole value. */}
        {media.length > 0 && (
          <div className="border-t border-line pt-4">
            <span className={helperLabel}>Same photo for every…</span>
            <div className="grid items-center gap-2">
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
                <span className="text-hint text-muted">shows this photo:</span>
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
                className={`${helperButton} w-full`}
              >
                Apply photo
              </button>
            </div>
          </div>
        )}
      </div>
      </Dialog>

      {/* sm+: table */}
      <div className="hidden overflow-x-auto rounded-md border border-line sm:block">
        <table className="w-full text-sm">
          <thead className="bg-fg/[0.04] text-left text-[12px] font-semibold text-muted">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Photo</th>
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
                <PhotoPicker
                  value={row.mediaId}
                  media={media}
                  onChange={(mediaId) => patchRow(index, { mediaId })}
                  disabled={disabled}
                  label={`Photo for ${draftLabel(types, row)}`}
                />
                <p className="min-w-0 flex-1 text-[16px] leading-snug font-bold break-words text-fg">
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
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
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
          <p className="text-[14px] font-semibold text-fg">Not selling</p>
          <p className="text-hint text-muted">Tap one to sell it again.</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rows.map((row, index) =>
              row.removed ? (
                <li key={Object.values(row.valueKeys).join('|')}>
                  <button
                    type="button"
                    onClick={() => patchRow(index, { removed: false })}
                    disabled={disabled}
                    className="inline-flex min-h-tap items-center gap-2 rounded-pill border border-line bg-surface px-3.5 text-[14px] font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
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

  const cover = media[0] ?? null
  const chosen = value ? (media.find((item) => item.id === value) ?? null) : null
  const shown = chosen ?? cover
  const pick = (mediaId: string | null) => {
    onChange(mediaId)
    setOpen(false)
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || media.length === 0}
        aria-label={label}
        aria-haspopup="dialog"
        title={
          media.length === 0
            ? 'Add photos in the Photos step first, then pick one here'
            : 'Tap to choose which photo this combination shows'
        }
        className="flex items-center gap-1 rounded-xl border border-line bg-input p-1 pr-1.5 transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-alt">
          {shown?.url ? (
            <MediaImg sizes="48px" src={shown.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold text-muted">Photo</span>
          )}
          {!chosen && shown?.url && (
            <span className="absolute inset-x-0 bottom-0 bg-scrim text-center text-[10px] leading-4 font-semibold text-white">
              Main
            </span>
          )}
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      <Dialog
        open={open}
        title="Which photo?"
        subtitle={label}
        onClose={() => setOpen(false)}
      >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <PhotoTile
              url={cover?.url ?? null}
              caption="Main"
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
          <p className="mt-3 text-hint text-muted">
            “Main” is your first photo — whichever photo is first.
          </p>
      </Dialog>
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
      aria-label={caption === 'Main' ? 'Use the main photo' : `Use photo ${caption}`}
      className={`relative aspect-square overflow-hidden rounded-xl border transition ${
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-brand'
      }`}
    >
      {url ? (
        <MediaImg sizes="96px" src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-surface-alt text-[12px] text-muted">
          —
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-scrim text-center text-[12px] leading-5 font-semibold text-white">
        {caption}
      </span>
      {selected && (
        <span className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-contrast">
          <CheckIcon className="h-4 w-4" />
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
