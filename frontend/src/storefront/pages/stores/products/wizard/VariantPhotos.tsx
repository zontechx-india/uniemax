import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { Dialog } from '../../../../../shared/ui/Dialog'
import { MediaImg } from '../../../../../shared/media/MediaImg'
import { prepareImage, webpName } from '../../../../../shared/media/cropImage'
import { getMediaConfig, validateImageSource } from '../../../../../shared/media/mediaConfig'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type { StoreProduct, StoreProductMediaItem } from '../../../../features/stores/storesApi'
import type {
  OptionTypeDraft,
  OptionValueDraft,
  VariantDraft,
} from '../../../../features/stores/productOptions'
import { CheckIcon, ImageIcon, PlusIcon } from '../../../../layout/icons'
import { MAX_LIVE_PHOTOS } from '../../media/useLiveMedia'
import { ChoiceCard } from './shared'

/**
 * The middle screen of "Price & choices" (Choices → **Photos** → Prices):
 * one photo for each value of the choice that changes how the product LOOKS
 * (Colour, Design, Print…). On the product page those photos ARE the colour
 * buttons — a value with a photo is drawn as a picture swatch, and tapping it
 * turns the gallery to that photo — so the screen shows that, live, instead
 * of explaining it in a paragraph.
 *
 * It replaced a photo box on every price card (Pink-S, Pink-M, Pink-L…),
 * pre-filled with the cover, which sellers did not know to tap, did not know
 * was optional, and could not see the effect of. A photo belongs to the look,
 * so it is asked once per value and written to every row with that value.
 *
 * Required: Continue waits until every value on sale has its own photo. The
 * sheet lists the product's photos plus "Take or upload a photo", since most
 * sellers uploaded one photo in step 2.
 */
export function VariantPhotos({
  storeId,
  product,
  type,
  rows,
  onRowsChange,
  onSaved,
  highlightKey,
  disabled,
}: {
  storeId: string
  product: StoreProduct
  /** The choice whose values get photos (Colour). */
  type: OptionTypeDraft
  rows: VariantDraft[]
  onRowsChange: (rows: VariantDraft[]) => void
  /** A photo was uploaded from here — the product came back with it. */
  onSaved: (product: StoreProduct) => void
  /** The value Continue stopped at, outlined. */
  highlightKey: string | null
  disabled: boolean
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const media = product.media.filter((m) => m.type === 'IMAGE')
  const values = valuesOnSale(type, rows)
  const photoOf = (valueKey: string) => {
    const id = valuePhotoId(rows, type.key, valueKey)
    return id ? (media.find((m) => m.id === id) ?? null) : null
  }
  const done = values.filter((v) => photoOf(v.key) !== null).length
  const open = values.find((v) => v.key === openKey) ?? null
  const label = type.name.trim() || 'Choice'

  const setPhoto = (valueKey: string, mediaId: string) =>
    onRowsChange(rows.map((row) => (row.valueKeys[type.key] === valueKey ? { ...row, mediaId } : row)))

  // Two looks on one photo: customers could not tell them apart.
  const twins = new Map<string, string[]>()
  for (const v of values) {
    const id = photoOf(v.key)?.id
    if (id) twins.set(id, [...(twins.get(id) ?? []), v.value])
  }
  const shared = [...twins.values()].find((names) => names.length > 1) ?? null
  const firstWithPhoto = values.find((v) => photoOf(v.key) !== null) ?? values[0] ?? null

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
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => {
            const photo = photoOf(v.key)
            return (
              <span key={v.key} className="flex w-12 flex-col items-center gap-1">
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
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-semibold text-fg">Tap each {label.toLowerCase()} to add its photo</p>
          <p className={`shrink-0 text-sm font-semibold ${done === values.length ? 'text-success' : 'text-muted'}`}>
            {done} of {values.length} done
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {values.map((v) => {
            const photo = photoOf(v.key)
            const flagged = highlightKey === v.key && !photo
            return (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(v.key)}
                  disabled={disabled}
                  aria-label={photo ? `Change the photo for ${v.value}` : `Add a photo for ${v.value}`}
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
                      <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
                        <CheckIcon className="h-4 w-4" />
                      </span>
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-6 w-6" />
                      <span className="text-sm font-semibold">Add photo</span>
                    </>
                  )}
                </button>
                <p className="mt-1.5 text-center text-sm font-semibold break-words text-fg">{v.value}</p>
              </li>
            )
          })}
        </ul>
      </div>

      {shared && (
        <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-hint text-fg">
          {listAnd(shared)} have the same photo — customers can’t tell them apart.
        </p>
      )}

      {open && (
        <PhotoSheet
          storeId={storeId}
          product={product}
          media={media}
          title={`Photo for ${open.value}`}
          selectedId={photoOf(open.key)?.id ?? null}
          onPick={(mediaId) => {
            setPhoto(open.key, mediaId)
            setOpenKey(null)
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
          title="Yes — add a photo of each"
          body="Customers pick one by its photo."
          onClick={() => onAnswer(true)}
        />
        <ChoiceCard
          active={answer === false}
          icon={CheckIcon}
          title="No, they look the same"
          body="Your main photo is used for all."
          onClick={() => onAnswer(false)}
        />
      </div>
    </div>
  )
}

function PhotoSheet({
  storeId,
  product,
  media,
  title,
  selectedId,
  onPick,
  onSaved,
  onClose,
}: {
  storeId: string
  product: StoreProduct
  media: StoreProductMediaItem[]
  title: string
  selectedId: string | null
  onPick: (mediaId: string) => void
  onSaved: (product: StoreProduct) => void
  onClose: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = media.length >= MAX_LIVE_PHOTOS

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const config = await getMediaConfig()
      if (validateImageSource(file, config.image)) {
        setError('That file is not a photo we can use. Try a JPG or PNG.')
        return
      }
      const blob = await prepareImage(file, config.image.maxMB * 1024 * 1024)
      if (!blob) {
        setError('That photo is too big. Try a smaller one.')
        return
      }
      const before = new Set(media.map((m) => m.id))
      const updated = await storeCatalogApi.addProductMedia(storeId, product.id, blob, webpName(file.name))
      onSaved(updated)
      const added = updated.media.find((m) => m.type === 'IMAGE' && !before.has(m.id))
      if (added) onPick(added.id)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open title={title} subtitle="Pick the photo that shows it." onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <label
          className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-1 text-center transition ${
            full || uploading
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
            {uploading ? 'Uploading…' : full ? `${MAX_LIVE_PHOTOS} photos max` : 'Take or upload a photo'}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={full || uploading}
            onChange={(e) => void upload(e)}
          />
        </label>
        {media.map((item) => {
          const on = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              disabled={uploading}
              aria-pressed={on}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                on ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand'
              }`}
            >
              <MediaImg sizes="(min-width: 640px) 160px, 30vw" src={item.url} alt="" className="h-full w-full object-cover" />
              {on && (
                <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-contrast">
                  <CheckIcon className="h-4 w-4" />
                </span>
              )}
            </button>
          )
        })}
      </div>
      {error && <p className="mt-3 text-hint text-danger">{error}</p>}
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

/** The value's photo: the one on its combinations on sale, if they agree. */
export function valuePhotoId(rows: VariantDraft[], typeKey: string, valueKey: string): string | null {
  const mine = rows.filter((row) => !row.removed && row.valueKeys[typeKey] === valueKey)
  const first = mine[0]?.mediaId ?? null
  return first && mine.every((row) => row.mediaId === first) ? first : null
}

/** The first value on sale still without a photo (Continue stops there). */
export function valueWithoutPhoto(
  type: OptionTypeDraft,
  rows: VariantDraft[],
  media: StoreProductMediaItem[],
): OptionValueDraft | null {
  return (
    valuesOnSale(type, rows).find((v) => {
      const id = valuePhotoId(rows, type.key, v.key)
      return !id || !media.some((m) => m.id === id)
    }) ?? null
  )
}

function listAnd(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
