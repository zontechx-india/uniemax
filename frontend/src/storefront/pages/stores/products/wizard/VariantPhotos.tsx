import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { Button } from '../../../../../shared/ui/Button'
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
import { BigSwitch } from '../../ui/BigSwitch'
import { CheckIcon, ImageIcon, PlusIcon } from '../../../../layout/icons'
import { MAX_LIVE_PHOTOS } from '../../media/useLiveMedia'
import { ChoiceCard } from './shared'

/** Photos one variant may list (server limit). */
export const MAX_VARIANT_PHOTOS = 10

/**
 * The middle screen of "Price & choices" (Choices → **Photos** → Prices),
 * shown when a choice changes how the product LOOKS (Colour, Print…).
 *
 * The product owns a photo library; each colour picks ANY photos from it, in
 * order — the model large marketplaces use. Reuse is free: one photo can show
 * Pink and Green ("Also in Pink" is a label, nothing moves). Photo 1 of a
 * colour is its MAIN photo: the colour button, the first gallery photo, the
 * cart and order picture. The list is picked per colour and written to every
 * size of it (each variant keeps \`mediaIds\`).
 *
 * Two ways in, editing the same lists: **By colour** (a row per colour with
 * its photo strip and a +, opening a numbered tick sheet with upload) and
 * **By photo** (each photo with colour chips — fastest with many photos).
 * "Same photos for all colours" is the one switch for a seller whose photos
 * show every colour together.
 *
 * Required, never a dead end: each colour needs at least one photo, a reused
 * photo counts, the switch counts, and upload sits inside the sheet.
 */
export function VariantPhotos({
  storeId,
  product,
  type,
  rows,
  onRowsChange,
  same,
  onSameChange,
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
  /** "Same photos for all colours". */
  same: boolean
  onSameChange: (same: boolean) => void
  /** Photos were uploaded from here — the product came back with them. */
  onSaved: (product: StoreProduct) => void
  /** The value Continue stopped at, outlined. */
  highlightKey: string | null
  disabled: boolean
}) {
  const [view, setView] = useState<'colour' | 'photo'>('colour')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const media = product.media.filter((m) => m.type === 'IMAGE')
  const values = valuesOnSale(type, rows)
  const label = type.name.trim() || 'Choice'
  const lower = label.toLowerCase()
  const listOf = (valueKey: string) => valueList(rows, type.key, valueKey, media)
  const done = values.filter((v) => listOf(v.key).length > 0).length
  const open = values.find((v) => v.key === openKey) ?? null
  const uploader = useUploader(storeId, product, onSaved)

  const setList = (valueKey: string, ids: string[]) =>
    onRowsChange(rows.map((row) => (row.valueKeys[type.key] === valueKey ? { ...row, mediaIds: ids } : row)))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface/70 px-4 py-3">
        <BigSwitch
          checked={same}
          disabled={disabled}
          label={`Same photos for all ${lower}s`}
          onText={`Same photos for all ${lower}s`}
          offText={`Same photos for all ${lower}s`}
          onChange={onSameChange}
        />
        <p className="mt-1 text-hint text-muted">Turn on if your photos show every {lower} together.</p>
      </div>

      {same ? (
        <p className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-hint text-fg">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          All {media.length} photo{media.length === 1 ? '' : 's'} show with every {lower}. Customers pick a {lower} by its
          name.
        </p>
      ) : (
        <>
          <div role="group" aria-label="Arrange photos" className="flex gap-1 rounded-xl bg-fg/5 p-1">
            {(['colour', 'photo'] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className="flex-1"
              >
                {v === 'colour' ? `By ${lower}` : 'By photo'}
              </Button>
            ))}
          </div>

          {view === 'colour' ? (
            <ul className="space-y-2.5">
              {values.map((v) => {
                const list = listOf(v.key)
                const flagged = highlightKey === v.key && list.length === 0
                return (
                  <li
                    key={v.key}
                    className={`rounded-2xl border p-3 ${flagged ? 'border-danger bg-danger/5' : 'border-line bg-surface/70'}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 text-base font-bold break-words text-fg">{v.value}</p>
                      <p className={`shrink-0 text-sm font-semibold ${list.length ? 'text-success' : 'text-danger'}`}>
                        {list.length ? `${list.length} photo${list.length === 1 ? '' : 's'}` : 'Needs a photo'}
                      </p>
                    </div>
                    {/* The whole strip is one button: every photo and the + open the same sheet. */}
                    <button
                      type="button"
                      onClick={() => setOpenKey(v.key)}
                      disabled={disabled}
                      aria-label={
                        list.length
                          ? `${v.value}: ${list.length} photo${list.length === 1 ? '' : 's'}. Change`
                          : `Choose photos for ${v.value}`
                      }
                      className="-mx-3 mt-2 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-1 text-left [scrollbar-width:none]"
                    >
                      {list.map((photo, i) => (
                        <span
                          key={photo.id}
                          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line"
                        >
                          <MediaImg sizes="64px" src={photo.url} alt="" className="h-full w-full object-cover" />
                          {i === 0 && (
                            <span className="absolute inset-x-0 bottom-0 bg-brand text-center text-xs leading-4 font-bold text-brand-contrast">
                              Main
                            </span>
                          )}
                        </span>
                      ))}
                      <span
                        className={`flex h-16 shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-dashed font-semibold transition ${
                          list.length ? 'w-16' : 'px-4'
                        } ${flagged ? 'border-danger text-danger' : 'border-brand/50 bg-brand-soft/40 text-brand'}`}
                      >
                        <PlusIcon className="h-5 w-5" />
                        {list.length === 0 && <span className="text-sm">Add photos</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="space-y-2.5">
              {media.map((photo) => {
                const tags = values.filter((v) => listOf(v.key).some((m) => m.id === photo.id))
                return (
                  <li key={photo.id} className="flex gap-3 rounded-2xl border border-line bg-surface/70 p-2.5">
                    <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                      <MediaImg sizes="80px" src={photo.url} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-hint text-muted">
                        {tags.length ? `Shows ${tags.map((t) => t.value).join(', ')}` : `All ${lower}s (not tagged)`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {values.map((v) => {
                          const on = tags.includes(v)
                          const list = listOf(v.key).map((m) => m.id)
                          return (
                            <Button
                              key={v.key}
                              variant="secondary"
                              size="sm"
                              aria-pressed={on}
                              disabled={disabled || (!on && list.length >= MAX_VARIANT_PHOTOS)}
                              onClick={() =>
                                setList(v.key, on ? list.filter((id) => id !== photo.id) : [...list, photo.id])
                              }
                              className="px-3"
                            >
                              <span className={`inline-flex items-center gap-1 ${on ? 'text-brand' : 'text-fg'}`}>
                                {on && <CheckIcon className="h-3.5 w-3.5" />}
                                {v.value}
                              </span>
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </li>
                )
              })}
              <li>
                <UploadButton uploader={uploader} room={MAX_LIVE_PHOTOS - media.length} tile={false} />
                {uploader.error && <p className="mt-2 text-hint text-danger">{uploader.error}</p>}
              </li>
            </ul>
          )}

          <p className={`text-sm font-semibold ${done === values.length ? 'text-success' : 'text-muted'}`}>
            {done === values.length ? `All ${values.length} ${lower}s ready` : `${done} of ${values.length} ${lower}s ready`}
          </p>
        </>
      )}

      {open && (
        <PhotoSheet
          key={open.key}
          media={media}
          value={open.value}
          step={listOf(open.key).length > 0 ? null : { n: done + 1, of: values.length }}
          initial={listOf(open.key).map((m) => m.id)}
          alsoIn={(mediaId) =>
            values.filter((v) => v.key !== open.key && listOf(v.key).some((m) => m.id === mediaId)).map((v) => v.value)
          }
          uploader={uploader}
          onDone={(ids) => {
            const wasEmpty = listOf(open.key).length === 0
            setList(open.key, ids)
            // Filling in: carry on with the next value still empty.
            const next =
              wasEmpty && ids.length > 0
                ? values.find((v) => v.key !== open.key && listOf(v.key).length === 0)
                : undefined
            setOpenKey(next?.key ?? null)
          }}
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
 * "Photos of Pink": tap photos in order — the number on each is its place, 1
 * is the main photo. A photo other colours use says "Also in Blue" and stays
 * theirs too. "Take or upload photos" adds several at once, ticked in order.
 */
function PhotoSheet({
  media,
  value,
  step,
  initial,
  alsoIn,
  uploader,
  onDone,
  onClose,
}: {
  media: StoreProductMediaItem[]
  value: string
  /** "2 of 5" while filling in empty values one after another. */
  step: { n: number; of: number } | null
  initial: string[]
  alsoIn: (mediaId: string) => string[]
  uploader: Uploader
  onDone: (ids: string[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>(initial)
  const full = picked.length >= MAX_VARIANT_PHOTOS

  const toggle = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_VARIANT_PHOTOS ? list : [...list, id]))

  return (
    <Dialog
      open
      title={`Photos of ${value}`}
      subtitle={`${step ? `${step.n} of ${step.of} · ` : ''}Tap in order. 1 is the main photo.`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          disabled={uploader.busy !== null}
          onClick={() => onDone(picked.filter((id) => media.some((m) => m.id === id)))}
        >
          {picked.length === 0 ? 'Done' : `Done · ${picked.length} photo${picked.length === 1 ? '' : 's'}`}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <UploadButton
          uploader={uploader}
          room={Math.min(MAX_LIVE_PHOTOS - media.length, MAX_VARIANT_PHOTOS - picked.length)}
          tile
          onUploaded={(ids) => setPicked((list) => [...list, ...ids].slice(0, MAX_VARIANT_PHOTOS))}
        />
        {media.map((item) => {
          const at = picked.indexOf(item.id)
          const on = at >= 0
          const others = alsoIn(item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              disabled={uploader.busy !== null || (!on && full)}
              aria-pressed={on}
              aria-label={`${on ? `Photo ${at + 1}, tap to remove` : 'Tap to add'}${others.length ? ` (also in ${others.join(', ')})` : ''}`}
              className={`relative aspect-square max-w-full overflow-hidden rounded-xl border-2 transition disabled:opacity-50 ${
                on ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand'
              }`}
            >
              <MediaImg sizes="(min-width: 640px) 160px, 30vw" src={item.url} alt="" className="h-full w-full object-cover" />
              <span
                className={`absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  on ? 'border-brand bg-brand text-brand-contrast' : 'border-white bg-black/25 text-white'
                }`}
              >
                {on ? at + 1 : ''}
              </span>
              {at === 0 ? (
                <span className="absolute inset-x-0 bottom-0 bg-brand text-center text-xs leading-5 font-bold text-brand-contrast">
                  Main
                </span>
              ) : others.length > 0 ? (
                <span className="absolute inset-x-0 bottom-0 truncate bg-scrim px-1 text-center text-xs leading-5 font-semibold text-white">
                  Also in {others.join(', ')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {full && <p className="mt-3 text-hint text-muted">{MAX_VARIANT_PHOTOS} photos is the most for one {value}.</p>}
      {uploader.error && <p className="mt-2 text-hint text-danger">{uploader.error}</p>}
    </Dialog>
  )
}

// ---- upload --------------------------------------------------------------------

interface Uploader {
  /** "2 of 3" while uploading, else null. */
  busy: { n: number; of: number } | null
  error: string | null
  /** Uploads in order; resolves with the new photo ids. */
  upload: (files: File[], room: number) => Promise<string[]>
}

/** Several photos straight onto the product, one at a time (each reply is the whole product). */
function useUploader(storeId: string, product: StoreProduct, onSaved: (p: StoreProduct) => void): Uploader {
  const [busy, setBusy] = useState<{ n: number; of: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: File[], room: number) => {
    setError(null)
    const take = files.slice(0, Math.max(room, 0))
    if (take.length < files.length) setError(`Only ${take.length} of ${files.length} added — that is the limit here.`)
    const added: string[] = []
    let known = new Set(product.media.map((m) => m.id))
    try {
      const config = await getMediaConfig()
      for (const [i, file] of take.entries()) {
        setBusy({ n: i + 1, of: take.length })
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
        const fresh = updated.media.find((m) => m.type === 'IMAGE' && !known.has(m.id))
        known = new Set(updated.media.map((m) => m.id))
        if (fresh) added.push(fresh.id)
      }
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(null)
    }
    return added
  }

  return { busy, error, upload }
}

/** "Take or upload photos" — a tile in the sheet, a button under the photo list. */
function UploadButton({
  uploader,
  room,
  tile,
  onUploaded,
}: {
  uploader: Uploader
  room: number
  tile: boolean
  onUploaded?: (ids: string[]) => void
}) {
  const blocked = room <= 0 || uploader.busy !== null
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    const ids = await uploader.upload(files, room)
    onUploaded?.(ids)
  }
  const text = uploader.busy
    ? `Uploading ${uploader.busy.n} of ${uploader.busy.of}…`
    : room <= 0
      ? 'Photo limit reached'
      : 'Take or upload photos'
  return (
    <label
      className={`relative flex items-center justify-center gap-1.5 border-2 border-dashed text-center font-semibold transition ${
        tile ? 'aspect-square max-w-full flex-col rounded-xl px-1 text-sm leading-tight' : 'min-h-tap rounded-xl px-4 text-sm'
      } ${blocked ? 'cursor-default border-line text-muted' : 'cursor-pointer border-brand/50 bg-brand-soft/40 text-brand hover:border-brand'}`}
    >
      {uploader.busy ? (
        <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-r-transparent" />
      ) : (
        <PlusIcon className="h-5 w-5 shrink-0" />
      )}
      <span>{text}</span>
      <input type="file" accept="image/*" multiple className="sr-only" disabled={blocked} onChange={(e) => void onPick(e)} />
    </label>
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
 * A value's photos, in order: the list of its first combination on sale that
 * has one (a size added later starts empty and takes it on save), keeping
 * only photos the product still has.
 */
export function valueList(
  rows: VariantDraft[],
  typeKey: string,
  valueKey: string,
  media: StoreProductMediaItem[],
): StoreProductMediaItem[] {
  const row = rows.find((r) => !r.removed && r.valueKeys[typeKey] === valueKey && r.mediaIds.length > 0)
  return (row?.mediaIds ?? []).flatMap((id) => {
    const item = media.find((m) => m.id === id)
    return item ? [item] : []
  })
}

/** The first value on sale still without a photo (Continue stops there). */
export function valueWithoutPhoto(
  type: OptionTypeDraft,
  rows: VariantDraft[],
  media: StoreProductMediaItem[],
): OptionValueDraft | null {
  return valuesOnSale(type, rows).find((v) => valueList(rows, type.key, v.key, media).length === 0) ?? null
}

/**
 * The rows as they are saved: every size of a colour carries that colour's
 * list; "same photos" or "they look the same" clears every list; with no
 * look choice the rows keep theirs. Deleted photos are dropped either way.
 */
export function rowsWithPhotos(
  rows: VariantDraft[],
  type: OptionTypeDraft | null,
  mode: 'lists' | 'none',
  media: StoreProductMediaItem[],
): VariantDraft[] {
  const exists = (id: string) => media.some((m) => m.id === id)
  if (mode === 'none') return rows.map((row) => ({ ...row, mediaIds: [] }))
  if (!type) return rows.map((row) => ({ ...row, mediaIds: row.mediaIds.filter(exists) }))
  return rows.map((row) => {
    const key = row.valueKeys[type.key]
    return { ...row, mediaIds: key ? valueList(rows, type.key, key, media).map((m) => m.id) : [] }
  })
}

/** A saved product whose combinations have no photos of their own already uses the same photos for all. */
export function initiallySame(rows: VariantDraft[], media: StoreProductMediaItem[]): boolean {
  return media.length > 0 && rows.some((row) => row.id) && rows.every((row) => row.removed || row.mediaIds.length === 0)
}
