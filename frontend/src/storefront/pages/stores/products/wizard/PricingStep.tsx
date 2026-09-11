import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ConfirmDialog } from '../../../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../../../shared/ui/form'
import {
  groupsEqual,
  groupsToInput,
  toGroupDrafts,
} from '../../../../features/stores/productGroups'
import type { GroupDraft } from '../../../../features/stores/productGroups'
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
import type { OptionsDraft } from '../OptionTypesEditor'
import { VariantMatrix } from '../VariantMatrix'
import { Field, Hint, StepButtons, StepShell, inputClass } from './shared'
import type { StepKey } from './shared'

type Mode = 'single' | 'options'
type Draft = { types: OptionTypeDraft[]; rows: VariantDraft[] }
type PendingDrop = Draft & { groups: GroupDraft[]; order: string[]; dropped: VariantDraft[] }

/**
 * Step 3 — what it costs. One question first: does it come in choices? A
 * single-version product is four fields. One with choices is a list of
 * options, each of two kinds: values TYPED here become variants of this
 * product (the combinations grid, "Set every price"), values that are OTHER
 * PRODUCTS of the store make a family — Maroon / Blue / Tan each a product
 * of its own, this one among them. A product with only a family and no
 * typed option still sells at one price, so the four fields show again.
 *
 * Nothing is written until Continue. Typed options go through the options
 * PUT (the server replaces the variant set in one transaction) and families
 * through the groups PUT (likewise, one transaction); both are validated
 * locally before the first write, so a naming clash never leaves half a
 * save behind.
 */
export function PricingStep({
  storeId,
  categories,
  product,
  onSaved,
  onOtherProductChange,
  onCatalogChanged,
  onSwitchProduct,
  onBack,
  onNext,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  /** A DIFFERENT product came back from the server (a family member). */
  onOtherProductChange: (product: StoreProduct) => void
  /** Other products' rows changed server-side — the list should reload. */
  onCatalogChanged: () => void
  /** Continue the wizard on another product, at a step. */
  onSwitchProduct: (product: StoreProduct, step: StepKey) => void
  onBack: () => void
  onNext: () => void
}) {
  const [mode, setMode] = useState<Mode>(
    product.hasVariants || product.groups.length > 0 ? 'options' : 'single',
  )

  // Single version — the implicit Default variant's four numbers.
  const base = product.defaultVariant
  const [price, setPrice] = useState(base && Number(base.price) > 0 ? base.price : '')
  const [compareAt, setCompareAt] = useState(base?.compareAtPrice ?? '')
  const [stock, setStock] = useState(base ? String(base.stockQuantity) : '')
  const [sku, setSku] = useState(base?.sku ?? '')

  // With choices — typed options (the matrix), families, and the order the
  // seller sees the cards in.
  const [initial] = useState(() => {
    const d = toDraft(product)
    const g = toGroupDrafts(product)
    return { d, g, order: [...d.types.map((t) => t.key), ...g.map((x) => x.key)] }
  })
  const [draft, setDraft] = useState<Draft>(initial.d)
  const [groups, setGroups] = useState<GroupDraft[]>(initial.g)
  const [order, setOrder] = useState<string[]>(initial.order)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [confirmSingle, setConfirmSingle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const presets: ProductOptionType[] =
    categories.find((c) => c.id === product.category.id)?.taxonomy?.optionTemplates ?? []
  const usedNames = new Set(
    [...draft.types.map((t) => t.name), ...groups.map((g) => g.name)].map((n) =>
      n.trim().toLowerCase(),
    ),
  )
  const unusedPresets = presets.filter((preset) => !usedNames.has(preset.name.toLowerCase()))
  const images = product.media.filter((m) => m.type === 'IMAGE')
  const cardCount = draft.types.length + groups.length

  /**
   * Every change from the editor comes through here so the matrix is
   * reconciled to the typed options. Only combinations that exist on the
   * server deserve a second look; a blank row the seller never saved can
   * vanish silently.
   */
  const changeOptions = (next: OptionsDraft) => {
    const { rows, dropped } = reconcileDraft(draft.rows, next.types)
    const saved = dropped.filter((row) => row.id !== undefined)
    if (saved.length > 0) {
      setPendingDrop({
        types: next.types,
        rows,
        groups: next.groups,
        order: next.order,
        dropped: saved,
      })
      return
    }
    setDraft({ types: next.types, rows })
    setGroups(next.groups)
    setOrder(next.order)
    setError(null)
  }

  const addPreset = (preset: ProductOptionType) => {
    const key = newKey()
    changeOptions({
      types: [
        ...draft.types,
        { key, name: preset.name, values: preset.values.map((value) => ({ key: newKey(), value })) },
      ],
      groups,
      order: [...order, key],
    })
  }

  /** The four single-version fields, checked. */
  const readSingleFields = ():
    | { price: number; compareAtPrice: number | null; stockQuantity: number; sku: string | null }
    | { error: string } => {
    const priceValue = Number(price)
    if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return { error: 'Enter the selling price.' }
    }
    const compareAtValue = compareAt.trim() === '' ? null : Number(compareAt)
    if (
      compareAtValue !== null &&
      (Number.isNaN(compareAtValue) || compareAtValue <= priceValue)
    ) {
      return { error: 'MRP must be higher than the selling price.' }
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return { error: 'Stock must be a whole number.' }
    }
    return {
      price: priceValue,
      compareAtPrice: compareAtValue,
      stockQuantity: stockValue,
      sku: sku.trim() || null,
    }
  }

  /**
   * Write the single-version fields: fold any variants into one Default
   * first, then patch it if anything changed.
   */
  const writeSingle = async (
    fields: Exclude<ReturnType<typeof readSingleFields>, { error: string }>,
  ): Promise<StoreProduct> => {
    let current = product
    if (current.hasVariants) {
      current = await storeCatalogApi.replaceProductOptions(storeId, current.id, {
        optionTypes: [],
        variants: [],
      })
    }
    const target = current.defaultVariant!
    const unchanged =
      Number(target.price) === fields.price &&
      (target.compareAtPrice === null ? null : Number(target.compareAtPrice)) ===
        fields.compareAtPrice &&
      target.stockQuantity === fields.stockQuantity &&
      (target.sku ?? '') === (fields.sku ?? '')
    return unchanged
      ? current
      : storeCatalogApi.updateVariant(storeId, current.id, target.id, fields)
  }

  /**
   * Check everything the "choices" mode would save — typed options, the
   * single fields when there are none, and the families — before touching
   * the server. Returns the error to show, or null.
   */
  const validateOptions = (d: Draft, g: GroupDraft[]): string | null => {
    if (d.types.length === 0 && g.length === 0) {
      return 'Add at least one option — Size, Colour, Weight… — or choose "One version".'
    }
    if (d.types.length > 0) {
      const result = draftToInput(d.types, d.rows)
      if ('error' in result) return result.error
    } else {
      const fields = readSingleFields()
      if ('error' in fields) return fields.error
    }
    const groupResult = groupsToInput(g, d.types.map((t) => t.name), product.id)
    if ('error' in groupResult) return groupResult.error
    return null
  }

  /** Save "choices" mode: options (or the single fields), then families. */
  const persist = async (d: Draft, g: GroupDraft[]): Promise<StoreProduct> => {
    let saved: StoreProduct
    if (d.types.length > 0) {
      const result = draftToInput(d.types, d.rows)
      if ('error' in result) throw new Error(result.error)
      saved = await storeCatalogApi.replaceProductOptions(storeId, product.id, result.input)
    } else {
      const fields = readSingleFields()
      if ('error' in fields) throw new Error(fields.error)
      saved = await writeSingle(fields)
    }
    onSaved(saved)
    const groupResult = groupsToInput(g, d.types.map((t) => t.name), product.id)
    if ('error' in groupResult) throw new Error(groupResult.error)
    if (!groupsEqual(g, saved.groups)) {
      saved = await storeCatalogApi.replaceProductGroups(storeId, product.id, groupResult.input)
      onSaved(saved)
      onCatalogChanged()
    }
    return saved
  }

  const saveSingle = async () => {
    const fields = readSingleFields()
    if ('error' in fields) return setError(fields.error)
    setError(null)
    setBusy(true)
    try {
      let saved = await writeSingle(fields)
      onSaved(saved)
      if (product.groups.length > 0) {
        saved = await storeCatalogApi.replaceProductGroups(storeId, product.id, { groups: [] })
        onSaved(saved)
        onCatalogChanged()
      }
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const saveOptions = async () => {
    const problem = validateOptions(draft, groups)
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    try {
      await persist(draft, groups)
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * "Create new product for this value": make the draft twin, add it to the
   * family, save everything on this product, then carry on in the new
   * product's wizard at Photos. Validated with the would-be member first, so
   * the copy is only made when the family can actually be saved.
   */
  const createMember = async (groupKey: string, value: string, name: string) => {
    const withNew = (productId: string, memberName: string) =>
      groups.map((g) =>
        g.key === groupKey
          ? {
              ...g,
              members: [
                ...g.members,
                { productId, name: memberName, imageUrl: null, price: null, isDraft: true, value },
              ],
            }
          : g,
      )
    const problem = validateOptions(draft, withNew('new', name))
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    try {
      const created = await storeCatalogApi.copyProduct(storeId, product.id, { name })
      onOtherProductChange(created)
      const nextGroups = withNew(created.id, created.name)
      setGroups(nextGroups)
      const saved = await persist(draft, nextGroups)
      // The family is symmetric: the new product's groups are this product's
      // groups, seen from its own row.
      const switched: StoreProduct = {
        ...created,
        groups: saved.groups.flatMap((group) => {
          const me = group.members.find((member) => member.productId === created.id)
          return me ? [{ ...group, value: me.value }] : []
        }),
      }
      onOtherProductChange(switched)
      onSwitchProduct(switched, 'photos')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (mode === 'single') {
      if (product.hasVariants || product.groups.length > 0) return setConfirmSingle(true)
      return void saveSingle()
    }
    // Combinations taken off the list that were already saved go for good.
    const dropping = draft.rows.filter((row) => row.removed && row.id !== undefined)
    if (dropping.length > 0 && !pendingDrop) {
      return setPendingDrop({ ...draft, groups, order, dropped: dropping })
    }
    void saveOptions()
  }

  const singleFields = (
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
  )

  const removedByGroups = product.groups.length
  const removedByVariants = product.variants.length

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
          body="Sizes, colours, weights… typed here as variants, or as other products of your store."
          onClick={() => setMode('options')}
        />
      </div>

      {mode === 'single' ? (
        singleFields
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
                    disabled={busy || cardCount >= 3}
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

          <OptionTypesEditor
            draft={{ types: draft.types, groups, order }}
            product={product}
            storeId={storeId}
            onChange={changeOptions}
            onCreateMember={(key, value, name) => void createMember(key, value, name)}
            disabled={busy}
          />

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

          {draft.types.length === 0 && groups.length > 0 && (
            <div>
              <p className="text-sm font-medium text-fg">This product’s price</p>
              <Hint>
                The other products in the family carry their own — set each
                one from its own wizard.
              </Hint>
              <div className="mt-3">{singleFields}</div>
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
          const nextDraft = { types: pendingDrop.types, rows: pendingDrop.rows }
          setDraft(nextDraft)
          setGroups(pendingDrop.groups)
          setOrder(pendingDrop.order)
          // Confirmed from Continue: the draft is already what to save.
          if (nextDraft.types === draft.types && nextDraft.rows === draft.rows) {
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
            at a single price again.
            {removedByVariants > 0 && (
              <>
                {' '}
                Its {removedByVariants} variant{removedByVariants === 1 ? '' : 's'} will be
                removed.
              </>
            )}
            {removedByGroups > 0 && (
              <>
                {' '}
                It will leave its {removedByGroups === 1 ? 'product family' : `${removedByGroups} product families`}
                — the other products stay in your store.
              </>
            )}
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
