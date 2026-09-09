import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ConfirmDialog } from '../../../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../../../shared/ui/form'
import {
  draftLabel,
  draftToInput,
  newKey,
  reconcileDraft,
  toDraft,
} from '../../../../features/stores/productOptions'
import type {
  OptionTypeDraft,
  VariantDraft,
} from '../../../../features/stores/productOptions'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  ProductOptionType,
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { PlusIcon } from '../../../../layout/icons'
import { OptionTypesEditor } from '../OptionTypesEditor'
import { VariantMatrix } from '../VariantMatrix'
import { Field, Hint, StepButtons, StepShell, inputClass } from './shared'

type Mode = 'single' | 'options'
type Draft = { types: OptionTypeDraft[]; rows: VariantDraft[] }

/**
 * Step 3 — what it costs. One question first: does it come in choices? A
 * single-version product is four fields. One with choices starts from the
 * category's suggested options (tap "Size" and the usual sizes are already
 * there), then the combinations appear with "Set every price" so a whole grid
 * is one number, and only the ones that differ need touching.
 *
 * Nothing is written until Continue; the server replaces the variant set in
 * one transaction, so options and combinations can never be half-applied.
 */
export function PricingStep({
  storeId,
  categories,
  product,
  onSaved,
  onBack,
  onNext,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onNext: () => void
}) {
  const [mode, setMode] = useState<Mode>(product.hasVariants ? 'options' : 'single')

  // Single version — the implicit Default variant's four numbers.
  const base = product.defaultVariant
  const [price, setPrice] = useState(base && Number(base.price) > 0 ? base.price : '')
  const [compareAt, setCompareAt] = useState(base?.compareAtPrice ?? '')
  const [stock, setStock] = useState(base ? String(base.stockQuantity) : '')
  const [sku, setSku] = useState(base?.sku ?? '')

  // With choices — the option draft, reconciled on every change.
  const [draft, setDraft] = useState<Draft>(() => toDraft(product))
  const [pendingDrop, setPendingDrop] = useState<
    (Draft & { dropped: VariantDraft[] }) | null
  >(null)
  const [confirmSingle, setConfirmSingle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const presets: ProductOptionType[] =
    categories.find((c) => c.id === product.category.id)?.taxonomy?.optionTemplates ?? []
  const unusedPresets = presets.filter(
    (preset) =>
      !draft.types.some((t) => t.name.trim().toLowerCase() === preset.name.toLowerCase()),
  )
  const images = product.media.filter((m) => m.type === 'IMAGE')

  const changeTypes = (types: OptionTypeDraft[]) => {
    const { rows, dropped } = reconcileDraft(draft.rows, types)
    // Only combinations that exist on the server deserve a second look; a
    // blank row the seller never saved can vanish silently.
    const saved = dropped.filter((row) => row.id !== undefined)
    if (saved.length > 0) {
      setPendingDrop({ types, rows, dropped: saved })
      return
    }
    setDraft({ types, rows })
    setError(null)
  }

  const addPreset = (preset: ProductOptionType) =>
    changeTypes([
      ...draft.types,
      {
        key: newKey(),
        name: preset.name,
        values: preset.values.map((value) => ({ key: newKey(), value })),
      },
    ])

  const saveSingle = async () => {
    const priceValue = Number(price)
    if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return setError('Enter the selling price.')
    }
    const compareAtValue = compareAt.trim() === '' ? null : Number(compareAt)
    if (
      compareAtValue !== null &&
      (Number.isNaN(compareAtValue) || compareAtValue <= priceValue)
    ) {
      return setError('MRP must be higher than the selling price.')
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return setError('Stock must be a whole number.')
    }

    setError(null)
    setBusy(true)
    try {
      // Coming back from options: fold the variants into one Default first.
      let current = product
      if (current.hasVariants) {
        current = await storeCatalogApi.replaceProductOptions(storeId, current.id, {
          optionTypes: [],
          variants: [],
        })
      }
      const target = current.defaultVariant!
      const unchanged =
        Number(target.price) === priceValue &&
        (target.compareAtPrice === null ? null : Number(target.compareAtPrice)) === compareAtValue &&
        target.stockQuantity === stockValue &&
        (target.sku ?? '') === sku.trim()
      const saved = unchanged
        ? current
        : await storeCatalogApi.updateVariant(storeId, current.id, target.id, {
            price: priceValue,
            compareAtPrice: compareAtValue,
            stockQuantity: stockValue,
            sku: sku.trim() || null,
          })
      onSaved(saved)
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const saveOptions = async () => {
    if (draft.types.length === 0) {
      return setError('Add at least one option — Size, Colour, Weight… — or choose "One version".')
    }
    const result = draftToInput(draft.types, draft.rows)
    if ('error' in result) return setError(result.error)

    setError(null)
    setBusy(true)
    try {
      onSaved(
        await storeCatalogApi.replaceProductOptions(storeId, product.id, result.input),
      )
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (mode === 'single') {
      if (product.hasVariants) return setConfirmSingle(true)
      return void saveSingle()
    }
    // Combinations taken off the list that were already saved go for good.
    const dropping = draft.rows.filter((row) => row.removed && row.id !== undefined)
    if (dropping.length > 0 && !pendingDrop) {
      return setPendingDrop({ ...draft, dropped: dropping })
    }
    void saveOptions()
  }

  return (
    <StepShell
      title="Price & choices"
      lead="Does this product come in choices — sizes, colours, weights? Pick one, and the rest is a couple of numbers."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={mode === 'single'}
          title="One version"
          body="One price, one stock count. Most products."
          onClick={() => setMode('single')}
        />
        <ModeCard
          active={mode === 'options'}
          title="Comes in choices"
          body="Sizes, colours, weights… each one can have its own price, stock and photo."
          onClick={() => setMode('options')}
        />
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price (₹)" hint="What the customer pays.">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1499"
              className={inputClass}
            />
          </Field>
          <Field
            label="MRP (₹)"
            optional
            hint="The printed price. Shown crossed out beside the selling price, with the % off."
          >
            <input
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1999"
              className={inputClass}
            />
          </Field>
          <Field label="Stock" hint="How many you have. Customers see “only 2 left” when it runs low.">
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 10"
              className={inputClass}
            />
          </Field>
          <Field
            label="Item code (SKU)"
            optional
            hint="Your own reference, printed on order lines — e.g. SAR-PINK-01."
          >
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              maxLength={64}
              placeholder="e.g. SAR-PINK-01"
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-5">
          {unusedPresets.length > 0 && (
            <div>
              <p className="text-sm font-medium text-fg">Common choices for this category</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unusedPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => addPreset(preset)}
                    disabled={busy || draft.types.length >= 3}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {preset.name}
                    {preset.values.length > 0 && (
                      <span className="font-normal text-muted">
                        {' '}
                        · {preset.values.slice(0, 4).join(', ')}
                        {preset.values.length > 4 ? '…' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Hint>
                Tap one to add it with the usual values — remove any you don’t
                stock, or add your own below.
              </Hint>
            </div>
          )}

          <OptionTypesEditor value={draft.types} onChange={changeTypes} disabled={busy} />

          {draft.rows.length > 0 && (
            <div>
              <p className="text-sm font-medium text-fg">Each combination</p>
              <Hint>
                Use “Set every price” to fill the whole list with one number,
                then change only the ones that differ. Take a combination off
                the list if you don’t sell it.
              </Hint>
              <div className="mt-3">
                <VariantMatrix
                  types={draft.types}
                  rows={draft.rows}
                  media={images}
                  onChange={(rows) => {
                    setDraft({ ...draft, rows })
                    setError(null)
                  }}
                  disabled={busy}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <StepButtons onBack={onBack} onNext={next} busy={busy} />

      <ConfirmDialog
        open={pendingDrop !== null}
        title="Remove these combinations?"
        description={
          pendingDrop ? (
            <>
              {pendingDrop.dropped.length === 1
                ? 'One saved combination'
                : `${pendingDrop.dropped.length} saved combinations`}{' '}
              will be removed. Customers with one in their cart will see it as
              no longer available; past orders keep their details.
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {pendingDrop.dropped.map((row) => (
                  <li key={row.id}>
                    <span className="font-medium text-fg">
                      {draftLabel(pendingDrop.types, row)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null
        }
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => {
          if (!pendingDrop) return
          const next = { types: pendingDrop.types, rows: pendingDrop.rows }
          setDraft(next)
          // Confirmed from Continue: the draft is already what to save.
          if (next.types === draft.types && next.rows === draft.rows) {
            setPendingDrop(null)
            void saveOptions()
            return
          }
          setPendingDrop(null)
        }}
        onCancel={() => setPendingDrop(null)}
      />

      <ConfirmDialog
        open={confirmSingle}
        title="Back to one version?"
        description={
          <>
            <span className="font-medium text-fg">{product.name}</span> will sell
            at a single price again. Its {product.variants.length} variant
            {product.variants.length === 1 ? '' : 's'} will be removed.
          </>
        }
        confirmLabel="Yes, one version"
        busy={busy}
        onConfirm={async () => {
          setConfirmSingle(false)
          await saveSingle()
        }}
        onCancel={() => setConfirmSingle(false)}
      />
    </StepShell>
  )
}

function ModeCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-4 text-left transition ${
        active
          ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
          : 'border-line bg-surface hover:border-brand/60'
      }`}
    >
      <span className="block text-sm font-semibold text-fg">{title}</span>
      <span className="mt-1 block text-xs text-muted">{body}</span>
    </button>
  )
}
