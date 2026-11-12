import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { Button } from '../../../../../shared/ui/Button'
import { Dialog } from '../../../../../shared/ui/Dialog'
import { MediaImg } from '../../../../../shared/media/MediaImg'
import { prepareImage, webpName } from '../../../../../shared/media/cropImage'
import { getMediaConfig, validateImageSource } from '../../../../../shared/media/mediaConfig'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  ProductOptionType,
  StoreProduct,
  StoreProductMediaItem,
} from '../../../../features/stores/storesApi'
import type {
  OptionTypeDraft,
  OptionValueDraft,
  VariantDraft,
} from '../../../../features/stores/productOptions'
import { lookOf, lookOptionOf } from '../../../../features/stores/productLooks'
import { CheckIcon, ImageIcon, PlusIcon } from '../../../../layout/icons'
import { MAX_LIVE_PHOTOS } from '../../media/useLiveMedia'
import { ChoiceCard } from './shared'

/** Which value (by draft key) each photo shows: mediaId → value key. */
export type LookMap = Record<string, string>

/**
 * The middle screen of "Price & choices" (Choices → **Photos** → Prices):
 * the photos of each value of the choice that changes how the product LOOKS
 * (Colour, Design, Print…). On the product page the FIRST photo of a value
 * is its colour button, and picking the colour shows only that colour's
 * photos (then the shared ones) — so the screen shows that, live, instead of
 * explaining it in a paragraph.
 *
 * One tile per value; a tap opens a sheet where the seller ticks every photo
 * that shows it (front, back, close-up) or takes / uploads several at once,
 * auto-ticked. A photo shows one value only — ticking Blue's photo for Pink
 * moves it. Photos ticked for no value are shared.
 *
 * Required: Continue waits until every value on sale has at least one photo.
 * State lives in \`PricingStep\`: rows carry the first photo (\`mediaId\`, the
 * swatch and the cart thumbnail), \`looks\` carries the rest; both are saved
 * with the options PUT (\`mediaLooks\`).
 */
export function VariantPhotos({
  storeId,
  product,
  type,
  rows,
  looks,
  onChange,
  onSaved,
  highlightKey,
  disabled,
}: {
  storeId: string
  product: StoreProduct
  /** The choice whose values get photos (Colour). */
  type: OptionTypeDraft
  rows: VariantDraft[]
  looks: LookMap
  onChange: (next: { rows: VariantDraft[]; looks: LookMap }) => void
  /** Photos were uploaded from here — the product came back with them. */
  onSaved: (product: StoreProduct) => void
  /** The value Continue stopped at, outlined. */
  highlightKey: string | null
  disabled: boolean
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const media = product.media.filter((m) => m.type === 'IMAGE')
  const values = valuesOnSale(type, rows)
  const photosOf = (valueKey: string) => valuePhotos(rows, looks, type.key, valueKey, media)
  const done = values.filter((v) => photosOf(v.key).length > 0).length
  const open = values.find((v) => v.key === openKey) ?? null
  const label = type.name.trim() || 'Choice'
  const firstWithPhoto = values.find((v) => photosOf(v.key).length > 0) ?? values[0] ?? null

  /** The sheet's answer for one value: exactly these photos, first = its button. */
  const setPhotos = (valueKey: string, ids: string[]) => {
    const nextLooks: LookMap = {}
    for (const [id, key] of Object.entries(looks)) if (key !== valueKey && !ids.includes(id)) nextLooks[id] = key
    for (const id of ids) nextLooks[id] = valueKey
    const nextRows = rows.map((row) => {
      const key = row.valueKeys[type.key]
      if (key === valueKey) return { ...row, mediaId: ids[0] ?? null }
      // A photo that moved away from this value can't stay its button.
      if (key && row.mediaId && ids.includes(row.mediaId)) {
        const left = media.find((m) => nextLooks[m.id] === key)
        return { ...row, mediaId: left?.id ?? null }
      }
      return row
    })
    onChange({ rows: nextRows, looks: nextLooks })
  }

  return (
    <div className="space-y-5">
      {/* What customers see — fills in as the seller picks. */}
      <figure className="rounded-2xl border border-line bg-surface/70 p-4" aria-hidden>
        <figcaption className="text-xs font-semibold tracking-wide text-muted uppercase">
          What customers see
        </figcaption>
        <p className="mt-2 truncate text-base font-semibold text-fg">{product.name}</p>
        <p className="mt-0.5 text-sm text-muted">
          {label}: <span className="font-semibold text-fg">{firstWithPhoto?.value}</span>
        </p>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {values.map((v) => {
            const photo = photosOf(v.key)[0] ?? null
            return (
              <span key={v.key} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <span
                  className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg ${
                    photo
                      ? `border-2 ${v.key === firstWithPhoto?.key ? 'border-brand' : 'border-line'}`
                      : 'border-2 border-dashed border-line text-muted'
                  }`}
                >
                  {photo ? (
                    <MediaImg sizes="48px" src={photo.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold">?</span>
                  )}
                </span>
                <span className="w-full truncate text-center text-xs text-muted">{v.value}</span>
              </span>
            )
          })}
        </div>
      </figure>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-base font-semibold text-fg">Tap each {label.toLowerCase()} to add its photos</p>
          <p className={`shrink-0 text-sm font-semibold ${done === values.length ? 'text-success' : 'text-muted'}`}>
            {done} of {values.length} done
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {values.map((v) => {
            const photos = photosOf(v.key)
            const photo = photos[0] ?? null
            const flagged = highlightKey === v.key && !photo
            return (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(v.key)}
                  disabled={disabled}
                  aria-label={
                    photo
                      ? `${v.value}: ${photos.length} photo${photos.length === 1 ? '' : 's'}. Change`
                      : `Add photos for ${v.value}`
                  }
                  className={`relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 transition disabled:opacity-60 ${
                    photo
                      ? 'border-line hover:border-brand'
                      : flagged
                        ? 'border-dashed border-danger bg-danger/5 text-danger'
                        : 'border-dashed border-brand/40 bg-brand-soft/40 text-brand hover:border-brand'
                  }`}
                >
                  {photo ? (
                    <>
                      <MediaImg sizes="(min-width: 640px) 160px, 30vw" src={photo.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute top-1.5 right-1.5 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-success px-1.5 text-xs font-bold text-white">
                        <CheckIcon className="h-3.5 w-3.5" />
                        {photos.length > 1 ? photos.length : null}
                      </span>
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-6 w-6" />
                      <span className="text-sm font-semibold">Add photos</span>
                    </>
                  )}
                </button>
                <p className="mt-1.5 text-center text-sm font-semibold break-words text-fg">{v.value}</p>
              </li>
            )
          })}
        </ul>
      </div>

      {open && (
        <PhotoSheet
          key={open.key}
          storeId={storeId}
          product={product}
          media={media}
          value={open.value}
          step={photosOf(open.key).length > 0 ? null : { n: done + 1, of: values.length }}
          initial={photosOf(open.key).map((m) => m.id)}
          ownerOf={(mediaId) => {
            const key = looks[mediaId] ?? rows.find((row) => row.mediaId === mediaId)?.valueKeys[type.key]
            return key && key !== open.key ? (type.values.find((v) => v.key === key)?.value ?? null) : null
          }}
          onDone={(ids) => {
            const wasEmpty = photosOf(open.key).length === 0
            setPhotos(open.key, ids)
            // Filling in: carry on with the next value still empty.
            const next =
              wasEmpty && ids.length > 0
                ? values.find((v) => v.key !== open.key && photosOf(v.key).length === 0)
                : undefined
            setOpenKey(next?.key ?? null)
          }}
          onSaved={onSaved}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  )
}

/** The look question, for a choice whose name does not say (Type, Model…). */
export function LooksQuestion({
  name,
  answer,
  onAnswer,
}: {
  name: string
  answer: boolean | null
  onAnswer: (looksDifferent: boolean) => void
}) {
  const label = name.trim() || 'choice'
  return (
    <div role="radiogroup" aria-label={`Does each ${label} look different?`}>
      <p className="mb-2 text-base font-semibold text-fg">Does each {label.toLowerCase()} look different?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          active={answer === true}
          icon={ImageIcon}
          title="Yes — add photos of each"
          body="Customers pick one by its photo."
          onClick={() => onAnswer(true)}
        />
        <ChoiceCard
          active={answer === false}
          icon={CheckIcon}
          title="No, they look the same"
          body="Your photos are shown for all."
          onClick={() => onAnswer(false)}
        />
      </div>
    </div>
  )
}

/**
 * "Photos of Pink": tick every photo that shows it. The first ticked is its
 * colour button ("Button" label). A photo another value uses carries that
 * value's name; ticking it moves it here. "Take or upload photos" accepts
 * several files and ticks each one as it lands.
 */
function PhotoSheet({
  storeId,
  product,
  media,
  value,
  step,
  initial,
  ownerOf,
  onDone,
  onSaved,
  onClose,
}: {
  storeId: string
  product: StoreProduct
  media: StoreProductMediaItem[]
  value: string
  /** "2 of 5" while filling in empty values one after another. */
  step: { n: number; of: number } | null
  initial: string[]
  /** The other value a photo shows now, if any. */
  ownerOf: (mediaId: string) => string | null
  onDone: (ids: string[]) => void
  onSaved: (product: StoreProduct) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>(initial)
  const [uploading, setUploading] = useState<{ n: number; of: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const room = MAX_LIVE_PHOTOS - media.length

  const toggle = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    const take = files.slice(0, Math.max(room, 0))
    if (take.length < files.length) setError(`${MAX_LIVE_PHOTOS} photos per product — only ${take.length} added.`)
    let known = new Set(media.map((m) => m.id))
    try {
      const config = await getMediaConfig()
      for (const [i, file] of take.entries()) {
        setUploading({ n: i + 1, of: take.length })
        if (validateImageSource(file, config.image)) {
          setError(`“${file.name}” is not a photo we can use. Try a JPG or PNG.`)
          continue
        }
        const blob = await prepareImage(file, config.image.maxMB * 1024 * 1024)
        if (!blob) {
          setError(`“${file.name}” is too big. Try a smaller one.`)
          continue
        }
        const updated = await storeCatalogApi.addProductMedia(storeId, product.id, blob, webpName(file.name))
        onSaved(updated)
        const added = updated.media.find((m) => m.type === 'IMAGE' && !known.has(m.id))
        known = new Set(updated.media.map((m) => m.id))
        if (added) setPicked((list) => [...list, added.id])
      }
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setUploading(null)
    }
  }

  return (
    <Dialog
      open
      title={`Photos of ${value}`}
      subtitle={`${step ? `${step.n} of ${step.of} · ` : ''}Tap every photo that shows ${value}.`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          disabled={uploading !== null}
          onClick={() => onDone(picked.filter((id) => media.some((m) => m.id === id)))}
        >
          {picked.length === 0 ? 'Done' : `Done · ${picked.length} photo${picked.length === 1 ? '' : 's'}`}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <label
          className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-1 text-center transition ${
            room <= 0 || uploading
              ? 'cursor-default border-line text-muted'
              : 'cursor-pointer border-brand/50 bg-brand-soft/40 text-brand hover:border-brand'
          }`}
        >
          {uploading ? (
            <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-r-transparent" />
          ) : (
            <PlusIcon className="h-6 w-6" />
          )}
          <span className="text-sm leading-tight font-semibold">
            {uploading
              ? `Uploading ${uploading.n} of ${uploading.of}…`
              : room <= 0
                ? `${MAX_LIVE_PHOTOS} photos max`
                : 'Take or upload photos'}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={room <= 0 || uploading !== null}
            onChange={(e) => void upload(e)}
          />
        </label>
        {media.map((item) => {
          const at = picked.indexOf(item.id)
          const on = at >= 0
          const owner = on ? null : ownerOf(item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              disabled={uploading !== null}
              aria-pressed={on}
              aria-label={`${on ? 'Untick' : 'Tick'} this photo${owner ? ` (now ${owner})` : ''}`}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                on ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand'
              }`}
            >
              <MediaImg sizes="(min-width: 640px) 160px, 30vw" src={item.url} alt="" className="h-full w-full object-cover" />
              <span
                className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  on ? 'border-brand bg-brand text-brand-contrast' : 'border-white bg-black/20'
                }`}
              >
                {on && <CheckIcon className="h-4 w-4" />}
              </span>
              {(at === 0 || owner) && (
                <span
                  className={`absolute inset-x-0 bottom-0 truncate px-1 text-center text-xs leading-5 font-semibold ${
                    at === 0 ? 'bg-brand text-brand-contrast' : 'bg-scrim text-white'
                  }`}
                >
                  {at === 0 ? 'Button' : owner}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-hint text-muted">
        The first one you tick is the {value} button customers tap.
      </p>
      {error && <p className="mt-2 text-hint text-danger">{error}</p>}
    </Dialog>
  )
}

// ---- rules -------------------------------------------------------------------

/** Names that always change how the product looks. */
const LOOKS = /colou?r|shade|design|pattern|print|style|finish/i
/** Names that never do: every size of a shirt shows the same photo. */
const SAME_LOOK =
  /size|weight|pack|quantity|qty|count|capacity|length|width|height|volume|storage|ram|memory|age|fit|litre|liter|kg|gram|ml/i

/**
 * Which choice gets photos: a looks-name (Colour) is certain; any other name
 * not on the same-look list (Type, Model) is asked; sizes and weights alone
 * skip the Photos screen.
 */
export function photoChoiceFor(types: OptionTypeDraft[]): { key: string; ask: boolean } | null {
  const sure = types.find((t) => LOOKS.test(t.name))
  if (sure) return { key: sure.key, ask: false }
  const maybe = types.find((t) => t.name.trim() !== '' && !SAME_LOOK.test(t.name))
  return maybe ? { key: maybe.key, ask: true } : null
}

/** Values that still have at least one combination on sale. */
export function valuesOnSale(type: OptionTypeDraft, rows: VariantDraft[]): OptionValueDraft[] {
  return type.values.filter((v) => rows.some((row) => !row.removed && row.valueKeys[type.key] === v.key))
}

/**
 * A value's photos, in order: its button (the photo on its combinations on
 * sale, when they agree) then every other photo ticked for it.
 */
export function valuePhotos(
  rows: VariantDraft[],
  looks: LookMap,
  typeKey: string,
  valueKey: string,
  media: StoreProductMediaItem[],
): StoreProductMediaItem[] {
  const mine = rows.filter((row) => !row.removed && row.valueKeys[typeKey] === valueKey)
  const firstId = mine[0]?.mediaId ?? null
  const lead =
    firstId && mine.every((row) => row.mediaId === firstId)
      ? (media.find((m) => m.id === firstId) ?? null)
      : null
  const rest = media.filter((m) => m !== lead && looks[m.id] === valueKey)
  return lead ? [lead, ...rest] : rest
}

/** The first value on sale still without a photo (Continue stops there). */
export function valueWithoutPhoto(
  type: OptionTypeDraft,
  rows: VariantDraft[],
  looks: LookMap,
  media: StoreProductMediaItem[],
): OptionValueDraft | null {
  return valuesOnSale(type, rows).find((v) => valuePhotos(rows, looks, type.key, v.key, media).length === 0) ?? null
}

/**
 * The saved looks as a draft map. Tagged photos map by option + value name;
 * a product saved before photos had looks maps each combination's own photo
 * to its value, so nothing is lost the first time it is edited.
 */
export function initialLooks(
  product: StoreProduct,
  types: OptionTypeDraft[],
  rows: VariantDraft[],
): LookMap {
  const looks: LookMap = {}
  const saved: ProductOptionType[] = types.map((t) => ({ name: t.name, values: t.values.map((v) => v.value) }))
  const type = lookOptionOf(product.media, saved)
  const draftType = type ? types.find((t) => t.name === type.name) : undefined
  if (type && draftType) {
    for (const item of product.media) {
      const value = lookOf(item, type)
      const key = draftType.values.find((v) => v.value === value)?.key
      if (key) looks[item.id] = key
    }
    return looks
  }
  const choice = photoChoiceFor(types)
  if (!choice) return looks
  for (const row of rows) {
    const key = row.valueKeys[choice.key]
    if (row.mediaId && key && !looks[row.mediaId]) looks[row.mediaId] = key
  }
  return looks
}

/** What the options PUT saves as \`mediaLooks\` — only values still on sale. */
export function mediaLooksFor(
  type: OptionTypeDraft | null,
  rows: VariantDraft[],
  looks: LookMap,
  media: StoreProductMediaItem[],
  savedTypes: ProductOptionType[],
): { mediaId: string; option: string; value: string }[] {
  if (!type) return []
  const saved = savedTypes.find((t) => t.name.trim().toLowerCase() === type.name.trim().toLowerCase())
  if (!saved) return []
  // A photo shows one look: an old product that used one photo for two
  // colours keeps it on the first.
  const taken = new Set<string>()
  return valuesOnSale(type, rows).flatMap((v) => {
    const value = saved.values.find((x) => x === v.value.trim() || x === v.value)
    if (!value) return []
    return valuePhotos(rows, looks, type.key, v.key, media).flatMap((m) => {
      if (taken.has(m.id)) return []
      taken.add(m.id)
      return [{ mediaId: m.id, option: saved.name, value }]
    })
  })
}
