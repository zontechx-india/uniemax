import { useEffect, useState } from 'react'
import { Button } from '../../../../../shared/ui/Button'
import { toApiError } from '../../../../../shared/auth/http'
import { ConfirmDialog } from '../../../../../shared/ui/ConfirmDialog'
import {
  groupsEqual,
  groupsToInput,
  toGroupDrafts,
} from '../../../../features/stores/productGroups'
import type { GroupDraft } from '../../../../features/stores/productGroups'
import {
  cleanCount,
  draftLabel,
  draftToInput,
  newKey,
  reconcileDraft,
  rowsNeedingPrice,
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
import { CheckIcon, PaletteIcon, PlusIcon, SlidersIcon, TagIcon } from '../../../../layout/icons'
import { CameraIcon } from '../../media/icons'
import { OptionTypesEditor } from '../OptionTypesEditor'
import type { OptionsDraft } from '../OptionTypesEditor'
import { VariantMatrix } from '../VariantMatrix'
import { PlatformFeeNote } from './PlatformFeeNote'
import {
  LooksQuestion,
  VariantPhotos,
  initiallySame,
  photoChoiceFor,
  rowsWithPhotos,
  valueWithoutPhoto,
} from './VariantPhotos'
import { ChoicesPreview, exampleChoice, listWords, VersionCard } from './choicesHelp'
import { Field, Hint, inputClass, MoneyInput, Section, StepButtons, StepError, StepShell, Stepper } from './shared'
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from './localDraft'
import type { StepKey, VersionPlan } from './shared'

/** null = not answered yet: a new, unpriced product starts with no answer picked. */
type Mode = 'single' | 'options' | null
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
 * With typed options the step is up to THREE screens inside one component
 * (so no state is lost between them): **pick the choices** (Size: S, M, L),
 * then — only when a choice changes how it looks (Colour) — **photos for
 * each look** (any photo, any colour, in order; required unless "same photos
 * for all"; `VariantPhotos`), then **price and stock for each**. One long page with presets, options, a
 * combinations grid and bulk tools was where sellers gave up.
 *
 * Nothing is written until Continue. Typed options go through the options
 * PUT (the server replaces the variant set in one transaction) and families
 * through the groups PUT (likewise, one transaction); both are validated
 * locally before the first write, so a naming clash never leaves half a
 * save behind.
 *
 * A new product starts with NEITHER answer picked (unless step 1 answered
 * it): "No" pre-selected let sellers tap Continue straight past the question,
 * then make a product per colour. Until one is picked the step shows what a
 * customer would see with choices — the seller's own photo and name.
 */
export function PricingStep({
  storeId,
  categories,
  product,
  plan,
  onSaved,
  onOtherProductChange,
  onCatalogChanged,
  onSwitchProduct,
  onPartChange,
  onBack,
  onNext,
  supplyOnly = false,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  /**
   * A supplier account: its price is the suggested price sellers start from;
   * its price for sellers is asked on the last step (D-28).
   */
  supplyOnly?: boolean
  /** Step 1's answer, if the seller gave one. */
  plan: VersionPlan
  onSaved: (product: StoreProduct) => void
  /** A DIFFERENT product came back from the server (a family member). */
  onOtherProductChange: (product: StoreProduct) => void
  /** Other products' rows changed server-side — the list should reload. */
  onCatalogChanged: () => void
  /** Continue the wizard on another product, at a step. */
  onSwitchProduct: (product: StoreProduct, step: StepKey) => void
  /** The screen in view, for the wizard header ("Options", "Colour photos"); null = the step's own name. */
  onPartChange?: (label: string | null) => void
  onBack: () => void
  onNext: () => void
}) {
  // Not yet priced or split on the server: what the seller typed here last
  // time (kept on this device — `localDraft.ts`) comes back.
  const fresh =
    !product.hasVariants && product.groups.length === 0 && !(Number(product.defaultVariant?.price ?? 0) > 0)
  const [restored] = useState(() => (fresh ? readLocalDraft<LocalPricing>(product.id, 'pricing') : null))
  const [mode, setMode] = useState<Mode>(() => {
    if (restored?.mode) return restored.mode
    if (product.hasVariants || product.groups.length > 0) return 'options'
    if (Number(product.defaultVariant?.price ?? 0) > 0) return 'single'
    return plan === 'many' ? 'options' : plan === 'one' ? 'single' : null
  })
  /** Once answered (step 1, or saved), "one or many?" shows as a line with Change — not asked twice. */
  const [askAgain, setAskAgain] = useState(false)

  // Single version — the implicit Default variant's four numbers.
  const base = product.defaultVariant
  const [price, setPrice] = useState(restored?.price ?? (base && Number(base.price) > 0 ? base.price : ''))
  const [compareAt, setCompareAt] = useState(restored?.compareAt ?? base?.compareAtPrice ?? '')
  // A draft that was never priced starts with an EMPTY count, not the
  // server's 0: a prefilled 0 got saved untouched and the product went live
  // as sold out.
  const [stock, setStock] = useState(
    restored?.stock ?? (base && Number(base.price) > 0 ? String(base.stockQuantity) : ''),
  )
  const [sku, setSku] = useState(restored?.sku ?? base?.sku ?? '')

  // With choices — typed options (the matrix), families, and the order the
  // seller sees the cards in.
  const [initial] = useState(() => {
    if (restored && restored.types.length > 0) {
      const d = { types: restored.types, rows: restored.rows }
      return { d, g: [] as GroupDraft[], order: d.types.map((t) => t.key) }
    }
    const d = toDraft(product)
    const g = toGroupDrafts(product)
    return { d, g, order: [...d.types.map((t) => t.key), ...g.map((x) => x.key)] }
  })
  const [draft, setDraft] = useState<Draft>(initial.d)
  const [groups, setGroups] = useState<GroupDraft[]>(initial.g)
  const [order, setOrder] = useState<string[]>(initial.order)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [confirmSingle, setConfirmSingle] = useState(false)
  /** "choices" → "photos" (only for a look-changing choice) → "prices". */
  const [part, setPart] = useState<'choices' | 'photos' | 'prices'>('choices')
  /** "Does each Type look different?" — for a choice whose name does not say. */
  const [looks, setLooks] = useState<{ key: string; yes: boolean } | null>(() => {
    const choice = photoChoiceFor(initial.d.types)
    return choice?.ask && initial.d.rows.some((row) => row.mediaIds.length > 0)
      ? { key: choice.key, yes: true }
      : null
  })
  /** The value Continue stopped at on the Photos screen. */
  const [missingPhoto, setMissingPhoto] = useState<string | null>(null)
  /** "Same photos for all colours" — no lists; every photo shows with every colour. */
  const [samePhotos, setSamePhotos] = useState(() => restored?.samePhotos ?? initiallySame(initial.d.rows))

  // Keep the unsaved work on this device on every change (cleared on save).
  useEffect(() => {
    if (!fresh || mode === null) return
    writeLocalDraft(product.id, 'pricing', {
      mode,
      types: draft.types,
      rows: draft.rows,
      samePhotos,
      price,
      compareAt,
      stock,
      sku,
    } satisfies LocalPricing)
  }, [fresh, product.id, mode, draft, samePhotos, price, compareAt, stock, sku])
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
  const photoChoice = mode === 'options' ? photoChoiceFor(draft.types) : null
  const photoType = photoChoice ? (draft.types.find((t) => t.key === photoChoice.key) ?? null) : null
  const looksAnswer = photoChoice && looks?.key === photoChoice.key ? looks.yes : null
  const needsPhotos = photoType !== null && (!photoChoice!.ask || looksAnswer === true)
  const parts = photoType
    ? (['choices', 'photos', 'prices'] as const)
    : (['choices', 'prices'] as const)
  const cardCount = draft.types.length + groups.length
  const example = exampleChoice(presets)
  /** One name per screen, used by the header, the 1-2-3 strip and the title alike. */
  const partLabel = (p: 'choices' | 'photos' | 'prices') =>
    p === 'choices' ? 'Options' : p === 'photos' ? `${capitalise(photoType?.name ?? '')} photos`.trim() : 'Price & stock'
  const headerLabel =
    mode === 'options' ? (draft.types.length > 0 ? partLabel(part) : 'Options') : null
  useEffect(() => {
    onPartChange?.(headerLabel)
  }, [headerLabel, onPartChange])
  useEffect(() => () => onPartChange?.(null), [onPartChange])
  /** Product code is rarely used — kept one tap away. */
  const [showMore, setShowMore] = useState(() => !!base?.sku)

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
      return {
        error: price.trim()
          ? 'Enter the price in numbers only, e.g. 1299.'
          : supplyOnly
            ? 'Enter the suggested price.'
            : 'Enter the selling price.',
      }
    }
    const compareAtValue = compareAt.trim() === '' ? null : Number(compareAt)
    if (
      compareAtValue !== null &&
      (Number.isNaN(compareAtValue) || compareAtValue <= priceValue)
    ) {
      return { error: 'MRP must be higher than the selling price.' }
    }
    if (stock.trim() === '') {
      return { error: 'Enter how many you have, e.g. 10. Put 0 if it is sold out.' }
    }
    const stockValue = Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return { error: 'Enter how many you have as a whole number, e.g. 10 (0 if sold out).' }
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
      return 'Add at least one option, like Size or Colour — or pick “Just one”.'
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
      // Every size of a colour carries that colour's photos; "same photos"
      // or "they look the same" clears the lists.
      const lookType = d.types.find((t) => t.key === photoType?.key) ?? null
      const rows = rowsWithPhotos(
        d.rows,
        needsPhotos ? lookType : null,
        (needsPhotos && samePhotos) || (photoType !== null && !needsPhotos) ? 'none' : 'lists',
        images,
      )
      const result = draftToInput(d.types, rows)
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
      clearLocalDraft(product.id, 'pricing')
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

  /** After a "needs a price" error, bring the first empty (red) price box into view. */
  const pointAtEmptyPrice = () =>
    window.setTimeout(() => {
      const box = [...document.querySelectorAll<HTMLElement>('[data-needs-price]')].find(
        (el) => el.offsetParent !== null,
      )
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 400)

  const saveOptions = async () => {
    const problem = validateOptions(draft, groups)
    if (problem) {
      setError(problem)
      if (rowsNeedingPrice(draft.rows) > 0) pointAtEmptyPrice()
      return
    }
    setError(null)
    setBusy(true)
    try {
      await persist(draft, groups)
      clearLocalDraft(product.id, 'pricing')
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

  /**
   * Choices screen → prices screen. Only the typed options are checked here
   * (named, with values); prices are the next screen's job, and families are
   * checked with everything else on the final Continue.
   */
  const toPrices = () => {
    if (draft.types.length === 0) return setError('Add at least one option, like Size or Colour.')
    const unnamed = draft.types.find((t) => !t.name.trim())
    if (unnamed) return setError('Give every option a name, like “Size”.')
    const empty = draft.types.find((t) => t.values.length === 0)
    if (empty) return setError(`Add at least one value to “${empty.name.trim()}” — for example S, M, L.`)
    setError(null)
    setPart(photoType ? 'photos' : 'prices')
  }

  /** Photos screen → prices: every look on sale needs its own photo. */
  const fromPhotos = () => {
    if (photoChoice?.ask && looksAnswer === null) {
      return setError(`Tap Yes or No first — does each ${photoType?.name.trim().toLowerCase()} look different?`)
    }
    if (needsPhotos && photoType) {
      const missing = samePhotos ? null : valueWithoutPhoto(photoType, draft.rows, images)
      if (missing) {
        setMissingPhoto(missing.key)
        return setError(
          `Add a photo for ${missing.value} — or turn on “Same photos for all ${photoType.name.trim().toLowerCase()}s”.`,
        )
      }
    }
    setMissingPhoto(null)
    setError(null)
    setPart('prices')
  }

  const next = () => {
    if (mode === null) {
      return setError('Pick one first: “Just one” or “Many options”.')
    }
    // Typed options are priced on their own screen.
    if (mode === 'options' && part === 'choices' && draft.types.length > 0) return toPrices()
    if (mode === 'options' && part === 'photos') return fromPhotos()
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

  // Price and MRP side by side, then stock with big − / + buttons. No grey
  // example numbers in the fields: sellers read "1499" as a saved price.
  // The product code is rare, so it waits behind "More".
  const singleFields = (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      <Field label={supplyOnly ? 'Suggested price (₹)' : 'Selling price (₹)'}>
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      <Field label="MRP (₹)" optional hint="Shown crossed out">
        <MoneyInput value={compareAt} onChange={setCompareAt} />
      </Field>
      {supplyOnly ? (
        <p className="col-span-2 -mt-1.5 text-hint text-muted">
          Sellers start from this. Your price for sellers comes in the last step.
        </p>
      ) : (
        <div className="col-span-2 -mt-1.5">
          <PlatformFeeNote storeId={storeId} price={price} />
        </div>
      )}
      <div className="col-span-2">
        <Field label="Stock — how many you have" hint="0 = sold out">
          <Stepper value={stock} onChange={(v) => setStock(cleanCount(v))} label="Stock" />
        </Field>
      </div>
      {showMore ? (
        <div className="col-span-2">
          <Field label="Product code" optional hint="Your own code for this product">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              maxLength={64}
              className={inputClass}
            />
          </Field>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowMore(true)}
          className="col-span-2 justify-self-start px-2"
        >
          <PlusIcon className="h-4 w-4" />
          More (product code)
        </Button>
      )}
    </div>
  )

  const removedByGroups = product.groups.length
  const removedByVariants = product.variants.length

  return (
    <StepShell
      title={headerLabel ?? 'Price & stock'}
      lead={
        mode === 'options' && part === 'photos' && photoType
          ? needsPhotos
            ? `Customers tap a ${photoType.name.trim().toLowerCase()} and see its photos.`
            : undefined
          : mode === 'options' && part === 'prices'
          ? supplyOnly
            ? 'Suggested price and stock for each. Your price for sellers comes last.'
            : 'A price and stock for each one.'
          : undefined
      }
    >
      {/* Where the seller is inside step 3 — the same names as the header. */}
      {mode === 'options' && draft.types.length > 0 && (
        <ol className="flex gap-1.5" aria-label="Price step">
          {parts.map((p, i) => (
            <li
              key={p}
              aria-current={part === p ? 'step' : undefined}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs leading-tight font-semibold sm:justify-start sm:px-3 ${
                part === p ? 'bg-brand-soft text-brand' : 'bg-fg/5 text-muted'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold max-[359px]:hidden ${
                  part === p ? 'bg-brand text-brand-contrast' : 'ws-well'
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-center break-words sm:text-left">
                {partLabel(p)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* One or many — as two pictures: one shirt, or the same shirt in the
          category's own colours (or sizes). The picture carries the meaning;
          the words are a title and a few more. */}
      {part === 'choices' && mode !== null && !askAgain && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
          <CheckIcon className="h-5 w-5 shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-base font-semibold text-fg">
            {mode === 'single' ? 'Just one — one price, one stock' : 'Many options'}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAskAgain(true)} className="px-2.5">
            Change
          </Button>
        </div>
      )}
      {part === 'choices' && (mode === null || askAgain) && (
        <Section title="One or many options?" icon={PaletteIcon}>
          <div role="radiogroup" aria-label="One or many options?" className="grid grid-cols-2 gap-2.5">
            <VersionCard
              many={false}
              values={example.values}
              active={mode === 'single'}
              title="Just one"
              body="One price, one stock"
              onClick={() => {
                setMode('single')
                setAskAgain(false)
                setError(null)
              }}
            />
            <VersionCard
              many
              values={example.values}
              active={mode === 'options'}
              title="Many options"
              body={listWords(example.values)}
              onClick={() => {
                setMode('options')
                setAskAgain(false)
                setError(null)
              }}
            />
          </div>
          {mode !== 'single' && (
            <p className="text-hint text-muted">
              Colours or sizes go in <span className="font-semibold text-fg">this one product</span> — not a
              new product for each.
            </p>
          )}
        </Section>
      )}

      {/* Show, don't explain — while the seller decides. Once they pick, it
          would only push the next tap below the fold. */}
      {mode === null && (
        <ChoicesPreview name={product.name} photo={images[0] ?? null} choice={example} />
      )}

      {mode === null ? null : mode === 'single' ? (
        <Section title="Price & stock" icon={TagIcon}>
          {singleFields}
        </Section>
      ) : part === 'choices' ? (
        <Section title="Options" icon={SlidersIcon}>
          {unusedPresets.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-fg">Tap what customers choose</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unusedPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => addPreset(preset)}
                    disabled={busy || cardCount >= 3}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-sm font-semibold text-fg transition hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {preset.name}
                    {preset.values.length > 0 && (
                      <span className="font-normal text-muted">
                        {' '}
                        · {preset.values.slice(0, 3).join(', ')}
                        {preset.values.length > 3 ? '…' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Hint>Comes filled in — remove what you don’t sell.</Hint>
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

          {draft.types.length > 0 && draft.rows.length > 0 && (
            <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-hint font-medium text-fg">
              <CheckIcon className="h-4 w-4 shrink-0 text-success" />
              {draft.rows.filter((row) => !row.removed).length} item
              {draft.rows.filter((row) => !row.removed).length === 1 ? '' : 's'} to price · next:{' '}
              {photoType ? 'photos' : 'price & stock'}
            </p>
          )}

          {draft.types.length === 0 && groups.length > 0 && (
            <div className="border-t border-line pt-3.5">
              <p className="text-sm font-semibold text-fg">This product’s price</p>
              <Hint>Linked products keep their own.</Hint>
              <div className="mt-3">{singleFields}</div>
            </div>
          )}
        </Section>
      ) : part === 'photos' && photoType ? (
        <Section title={partLabel('photos')} icon={CameraIcon}>
          {photoChoice?.ask && (
            <LooksQuestion
              name={photoType.name}
              answer={looksAnswer}
              onAnswer={(yes) => {
                setLooks({ key: photoType.key, yes })
                setError(null)
              }}
            />
          )}
          {needsPhotos && (
            <VariantPhotos
              storeId={storeId}
              product={product}
              type={photoType}
              rows={draft.rows}
              onRowsChange={(rows) => {
                setDraft({ ...draft, rows })
                setError(null)
              }}
              same={samePhotos}
              onSameChange={(same) => {
                setSamePhotos(same)
                setMissingPhoto(null)
                setError(null)
              }}
              onSaved={onSaved}
              highlightKey={missingPhoto}
              disabled={busy}
            />
          )}
        </Section>
      ) : (
        <Section title="Price & stock of each" icon={TagIcon}>
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
          {/* Each choice has its own price — one note for all of them. */}
          {!supplyOnly && <PlatformFeeNote storeId={storeId} />}
        </Section>
      )}

      {error && <StepError>{error}</StepError>}

      <StepButtons
        onBack={
          mode === 'options' && part !== 'choices'
            ? () => {
                setError(null)
                setPart(part === 'prices' && photoType ? 'photos' : 'choices')
              }
            : onBack
        }
        onNext={next}
        busy={busy}
      />

      <ConfirmDialog
        open={pendingDrop !== null}
        title="Stop selling these options?"
        description={
          pendingDrop ? (
            <>
              {pendingDrop.dropped.length === 1
                ? 'One saved option'
                : `${pendingDrop.dropped.length} saved options`}{' '}
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
        title="Sell it as one kind only?"
        description={
          <>
            <span className="font-medium text-fg">{product.name}</span> will sell
            at a single price again.
            {removedByVariants > 0 && (
              <>
                {' '}
                Its {removedByVariants} choice{removedByVariants === 1 ? '' : 's'} will be
                removed.
              </>
            )}
            {removedByGroups > 0 && (
              <>
                {' '}
                It will stop being linked to {removedByGroups === 1 ? 'its other products' : `${removedByGroups} groups of products`}
                — those products stay in your shop.
              </>
            )}
          </>
        }
        confirmLabel="Yes, one kind"
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

/** Step 3's unsaved work as kept on this device. */
type LocalPricing = {
  mode: Mode
  types: OptionTypeDraft[]
  rows: VariantDraft[]
  samePhotos: boolean
  price: string
  compareAt: string
  stock: string
  sku: string
}

/** "colour" → "Colour", for screen names built from an option name. */
function capitalise(word: string): string {
  const w = word.trim()
  return w ? w[0]!.toUpperCase() + w.slice(1) : w
}
