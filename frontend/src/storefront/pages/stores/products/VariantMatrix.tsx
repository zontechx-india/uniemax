import { useState } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { Button, buttonClass } from '../../../../shared/ui/Button'
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
import { DotsIcon, SlidersIcon, TrashIcon } from '../../../layout/icons'
import { photoChoiceFor } from './wizard/VariantPhotos'
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
 * On a phone the rows are GROUPED by the look (a "Pink" header with its
 * photo, then S, M, L under it) and each row has only the two fields every
 * seller fills — price and stock, 44px — plus a "⋯" that opens a sheet with
 * MRP, code, the Selling switch and "Don't sell this". A card per
 * combination with all six controls made 5 colours × 3 sizes ten screens long.
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

      {/* Phone: grouped by the look (Pink → S, M, L), two fields a row. */}
      <PhoneList
        types={types}
        rows={rows}
        photoOf={photoOf}
        patchRow={patchRow}
        canRemove={offered.length > 1}
        disabled={disabled}
        inputClass={inputClass}
      />

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

/**
 * The phone list. Grouped by the look-changing choice (else the first one)
 * when there are two or more choices; one choice is one plain group.
 */
function PhoneList({
  types,
  rows,
  photoOf,
  patchRow,
  canRemove,
  disabled,
  inputClass,
}: {
  types: OptionTypeDraft[]
  rows: VariantDraft[]
  photoOf: (row: VariantDraft) => StoreProductMediaItem | null
  patchRow: (index: number, patch: Partial<VariantDraft>) => void
  canRemove: boolean
  disabled: boolean
  inputClass: string
}) {
  const [moreIndex, setMoreIndex] = useState<number | null>(null)
  const byType =
    types.length >= 2
      ? (types.find((t) => t.key === photoChoiceFor(types)?.key) ?? types[0]!)
      : null
  const rest = types.filter((t) => t !== byType)
  const valueOf = (row: VariantDraft, type: OptionTypeDraft) =>
    type.values.find((v) => v.key === row.valueKeys[type.key])?.value ?? '—'
  const indexed = rows.map((row, index) => ({ row, index })).filter(({ row }) => !row.removed)
  const groups = byType
    ? byType.values
        .map((value) => ({
          key: value.key,
          title: value.value,
          items: indexed.filter(({ row }) => row.valueKeys[byType.key] === value.key),
        }))
        .filter((g) => g.items.length > 0)
    : [{ key: 'all', title: '', items: indexed }]
  const more = moreIndex !== null ? (rows[moreIndex] ?? null) : null
  const moreLabel = more ? draftLabel(types, more) : ''
  const restName = rest[0]?.name.trim().toLowerCase() || 'choice'
  // Price | Stock | ⋯ — fixed widths so every row lines up under the headings.
  const cols =
    'grid grid-cols-[minmax(0,1fr)_5rem_3.5rem_2.75rem] gap-1.5 min-[360px]:grid-cols-[minmax(0,1fr)_5.5rem_3.75rem_2.75rem]'

  return (
    <div className="space-y-3 sm:hidden">
      {groups.map((group) => {
        const photo = photoOf(group.items[0]!.row)
        return (
          <section
            key={group.key}
            aria-label={group.title || 'Choices'}
            className="rounded-2xl border border-line bg-surface/80"
          >
            {group.title && (
              <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
                {photo && (
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                    <MediaImg sizes="40px" src={photo.url} alt="" className="h-full w-full object-cover" />
                  </span>
                )}
                <h3 className="min-w-0 flex-1 text-base font-bold break-words text-fg">{group.title}</h3>
                <span className="shrink-0 text-hint text-muted">
                  {group.items.length} {restName}
                  {group.items.length === 1 ? '' : 's'}
                </span>
              </header>
            )}
            <div aria-hidden className={`${cols} px-3 pt-2 text-xs font-semibold text-muted`}>
              <span />
              <span>Price (₹)</span>
              <span>Stock</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {group.items.map(({ row, index }) => {
                const label = byType
                  ? rest.map((t) => valueOf(row, t)).join(' / ')
                  : draftLabel(types, row)
                const full = draftLabel(types, row)
                const notes = [
                  row.compareAt.trim() ? `MRP ₹${row.compareAt.trim()}` : '',
                  row.isActive ? '' : 'Paused',
                ].filter(Boolean)
                return (
                  <li
                    key={Object.values(row.valueKeys).join('|')}
                    className={`${cols} items-center px-3 py-2 ${row.isActive ? '' : 'opacity-60'}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-semibold break-words text-fg max-[359px]:text-sm">{label}</span>
                      {notes.length > 0 && (
                        <span className="block text-xs text-muted">{notes.join(' · ')}</span>
                      )}
                    </span>
                    <input
                      value={row.price}
                      onChange={(e) => patchRow(index, { price: cleanAmount(e.target.value) })}
                      inputMode="decimal"
                      placeholder="₹"
                      disabled={disabled}
                      aria-label={`Price for ${full}`}
                      className={`${inputClass} px-2 ${row.price.trim() === '' ? 'border-danger/60' : ''}`}
                    />
                    <input
                      value={row.stock}
                      onChange={(e) => patchRow(index, { stock: cleanCount(e.target.value) })}
                      inputMode="numeric"
                      placeholder="0"
                      disabled={disabled}
                      aria-label={`Stock for ${full}`}
                      className={`${inputClass} px-2`}
                    />
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setMoreIndex(index)}
                      disabled={disabled}
                      aria-label={`More for ${full}: MRP, code, pause or remove`}
                      className="w-11 px-0!"
                    >
                      <DotsIcon className="h-5 w-5" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <Dialog
        open={more !== null}
        title={moreLabel}
        subtitle="Optional details for this one."
        onClose={() => setMoreIndex(null)}
        footer={
          <Button variant="primary" size="md" full onClick={() => setMoreIndex(null)}>
            Done
          </Button>
        }
      >
        {more && moreIndex !== null && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-fg">
                MRP (₹) <span className="font-normal text-muted">optional</span>
              </span>
              <input
                value={more.compareAt}
                onChange={(e) => patchRow(moreIndex, { compareAt: cleanAmount(e.target.value) })}
                inputMode="decimal"
                placeholder="The price printed on the pack"
                disabled={disabled}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-fg">
                Code <span className="font-normal text-muted">optional</span>
              </span>
              <input
                value={more.sku}
                onChange={(e) => patchRow(moreIndex, { sku: e.target.value })}
                maxLength={64}
                placeholder="Only if you use your own codes"
                disabled={disabled}
                className={inputClass}
              />
            </label>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
              <BigSwitch
                checked={more.isActive}
                disabled={disabled}
                label={`Sell ${moreLabel}`}
                onText="Selling"
                offText="Paused"
                onChange={(next) => patchRow(moreIndex, { isActive: next })}
              />
              <Button
                variant="ghost"
                size="md"
                disabled={disabled || !canRemove}
                onClick={() => {
                  patchRow(moreIndex, { removed: true })
                  setMoreIndex(null)
                }}
              >
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <TrashIcon className="h-4 w-4" />
                  Don’t sell this
                </span>
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
