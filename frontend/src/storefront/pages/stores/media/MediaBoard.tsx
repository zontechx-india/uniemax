import { useEffect, useRef, useState } from 'react'
import { ImageEditDialog } from '../../../../shared/media/ImageEditDialog'
import {
  imageSize,
  prepareImage,
  ratioLabel,
  webpName,
} from '../../../../shared/media/cropImage'
import {
  acceptAttr,
  useMediaConfig,
  validateFile,
  validateImageSource,
} from '../../../../shared/media/mediaConfig'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../../shared/ui/form'
import {
  BoxIcon,
  CheckIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
} from '../../../layout/icons'
import { DescribeDialog } from './DescribeDialog'
import { PhotoSheet } from './PhotoSheet'
import { ReviewQueue } from './ReviewQueue'
import type { ReviewItem } from './ReviewQueue'
import { CameraIcon, VideoIcon } from './icons'
import { media as t } from './strings'
import type { BoardPhoto, MediaDriver } from './types'
import { Button } from '../../../../shared/ui/Button'

/**
 * **Photos & video**, the one screen every seller has to get through.
 *
 * The board owns the whole experience — picking, the "use it / cut it"
 * question, the editor, the grid, the per-photo action sheet, the confirms —
 * and a `MediaDriver` owns only where the finished blob goes. That is why the
 * Add Product form and the product row are now the same screen: one holds
 * blobs in memory until a product id exists, the other uploads immediately,
 * and a seller cannot tell the difference.
 *
 * The shape of it, in order:
 *   1. a status line that says whether the product can go on the shop
 *   2. the photos, in their real shapes, cover first
 *   3. one sheet per photo, in words
 *   4. the optional video
 *   5. the storefront card the cover photo actually produces
 */
export function MediaBoard({
  driver,
  error: externalError = null,
  disabled = false,
  preview,
  className = '',
}: {
  driver: MediaDriver
  /** Form-level complaint, e.g. submitted with no photo. */
  error?: string | null
  disabled?: boolean
  /** Name/price for the storefront preview card under the video. */
  preview?: { name: string; price?: string | null }
  className?: string
}) {
  const config = useMediaConfig()
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [preparing, setPreparing] = useState(0)
  const [editing, setEditing] = useState<ReviewItem | null>(null)
  const [openPhoto, setOpenPhoto] = useState<string | null>(null)
  const [describing, setDescribing] = useState<BoardPhoto | null>(null)
  const [removing, setRemoving] = useState<{ kind: 'photo' | 'video'; id: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Photo being dragged onto another tile (desktop reordering). */
  const [dragId, setDragId] = useState<string | null>(null)
  /** Set while a pick is meant to replace one photo rather than add one. */
  const replaceTarget = useRef<string | null>(null)

  const { photos, video, maxPhotos } = driver
  const ready = photos.filter((p) => p.status === 'ready')
  const room = maxPhotos - photos.length - preparing - queue.length

  /** Phones get the camera first; a desktop has nothing to point at. */
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    setTouch(window.matchMedia?.('(pointer: coarse)').matches ?? false)
  }, [])

  /** Object URLs made for the review queue outlive their render pass. */
  const queueUrls = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const url of queueUrls.current) URL.revokeObjectURL(url)
    },
    [],
  )

  const dropQueueItem = (item: ReviewItem) => {
    URL.revokeObjectURL(item.previewUrl)
    queueUrls.current = queueUrls.current.filter((u) => u !== item.previewUrl)
    setQueue((list) => list.filter((q) => q.id !== item.id))
  }

  // ---- picking --------------------------------------------------------------

  const pick = async (files: FileList | null) => {
    const target = replaceTarget.current
    replaceTarget.current = null
    if (!files || !config || disabled) return
    setError(null)
    driver.clearError?.()

    const picked = [...files]
    // A replacement is always one file and never needs room in the grid.
    const allowed = target ? picked.slice(0, 1) : picked.slice(0, Math.max(room, 0))
    if (!target && room <= 0) {
      return setError(t.add.full(maxPhotos))
    }
    if (!target && picked.length > room) setError(t.add.left(room))

    const accepted: File[] = []
    for (const file of allowed) {
      const problem = validateImageSource(file, config.image)
      if (problem) {
        setError(t.errors.format(file.name))
        continue
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return

    setPreparing((n) => n + accepted.length)
    for (const file of accepted) {
      try {
        const blob = await prepareImage(file, config.image.maxMB * 1024 * 1024)
        if (!blob) {
          setError(t.errors.tooBig(file.name))
          continue
        }
        const size = await imageSize(file)
        const previewUrl = URL.createObjectURL(blob)
        queueUrls.current.push(previewUrl)
        setQueue((list) => [
          ...list,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            original: file,
            blob,
            filename: webpName(file.name),
            previewUrl,
            ratioLabel: size ? ratioLabel(size.width, size.height) : null,
            sizeLabel: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
            replaceId: target,
          },
        ])
      } catch {
        setError(t.errors.unreadable(file.name))
      } finally {
        setPreparing((n) => Math.max(0, n - 1))
      }
    }
  }

  /** Hands one reviewed photo to the driver — as picked, or as edited. */
  const commit = (item: ReviewItem, blob: Blob = item.blob) => {
    if (item.replaceId) {
      driver.replacePhoto(item.replaceId, blob, item.filename, item.original)
    } else {
      driver.addPhoto(blob, item.filename, item.original, blob !== item.blob)
    }
    dropQueueItem(item)
  }

  const pickVideo = (file: File | undefined) => {
    if (!file || !config || disabled) return
    setError(null)
    const problem = validateFile(file, config.video)
    if (problem) {
      return setError(
        file.size > config.video.maxMB * 1024 * 1024
          ? t.errors.videoTooBig(config.video.maxMB)
          : t.errors.videoFormat,
      )
    }
    driver.addVideo(file)
  }

  const openGallery = () => {
    replaceTarget.current = null
    galleryRef.current?.click()
  }

  const openCamera = () => {
    replaceTarget.current = null
    cameraRef.current?.click()
  }

  const startReplace = (id: string) => {
    replaceTarget.current = id
    setOpenPhoto(null)
    galleryRef.current?.click()
  }

  const confirmRemove = () => {
    if (!removing) return
    if (removing.kind === 'photo') driver.removePhoto(removing.id)
    else driver.removeVideo()
    setRemoving(null)
    setOpenPhoto(null)
  }

  const sheetPhoto = photos.find((p) => p.id === openPhoto) ?? null
  const sheetIndex = photos.findIndex((p) => p.id === openPhoto) + 1
  const shownError = externalError ?? error ?? driver.error ?? null

  return (
    <div className={className}>
      {/* 1 — where the seller stands ---------------------------------- */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-fg">
          {t.section}{' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <span className="sr-only">(at least one photo required)</span>
        </span>
        <span className="text-hint font-medium text-muted">
          {t.counter(photos.length, maxPhotos)}
        </span>
      </div>

      <p
        className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
          // Not having a photo YET is the next step, not an error — red on
          // arrival read as "you did something wrong" before any action.
          ready.length > 0
            ? 'bg-success/10 text-success'
            : 'bg-surface-alt text-fg'
        }`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
        {ready.length > 0
          ? t.ready.done(ready.length, video !== null)
          : t.ready.todo}
      </p>

      {/* 2 — the photos ------------------------------------------------ */}
      {photos.length + preparing + queue.length === 0 ? (
        <div className="grid gap-2">
          {touch && (
            <Button
              type="button"
              size="lg"
              full
              onClick={openCamera}
              disabled={!config || disabled}
            >
              <CameraIcon className="h-4.5 w-4.5" />
              {t.add.camera}
            </Button>
          )}
          <button
            type="button"
            onClick={openGallery}
            disabled={!config || disabled}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void pick(e.dataTransfer.files)
            }}
            className={`flex h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold transition disabled:cursor-not-allowed ${
              touch
                ? 'border border-line bg-surface text-fg hover:bg-surface-alt'
                : 'bg-brand-gradient text-brand-contrast shadow-floating hover:opacity-90'
            } ${dragging ? 'outline outline-2 outline-offset-2 outline-accent' : ''}`}
          >
            <ImageIcon className="h-4.5 w-4.5" />
            {t.add.gallery}
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-hint font-medium text-muted">
            {t.grid.tapHint}
          </p>
          <ul
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void pick(e.dataTransfer.files)
            }}
            className={`grid grid-cols-3 gap-2 rounded-md sm:grid-cols-4 md:grid-cols-6 ${
              dragging ? 'outline outline-2 outline-offset-4 outline-accent' : ''
            }`}
          >
            {photos.map((photo, index) => (
              /* Drag reorders for anyone who finds it — it is never the only
                 way, because a phone cannot drag and the sheet's "Move
                 earlier / later" rows do the same job with words. */
              <li
                key={photo.id}
                draggable={!disabled && photo.status === 'ready'}
                onDragStart={() => setDragId(photo.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragging(false)
                  const from = photos.findIndex((p) => p.id === dragId)
                  if (dragId === null || from < 0 || from === index) return
                  driver.movePhoto(dragId, index - from)
                  setDragId(null)
                }}
                className={dragId === photo.id ? 'opacity-50' : undefined}
              >
                <Tile
                  photo={photo}
                  index={index}
                  disabled={disabled}
                  onOpen={() => setOpenPhoto(photo.id)}
                  onRetry={() => driver.retryPhoto?.(photo.id)}
                  onDiscard={() => driver.removePhoto(photo.id)}
                />
              </li>
            ))}

            {Array.from({ length: preparing }, (_, i) => (
              <li
                key={`preparing-${i}`}
                className="flex aspect-square animate-pulse items-center justify-center rounded-xl border border-line bg-surface-alt px-1 text-center text-[12px] font-semibold text-muted"
              >
                {t.grid.optimizing}
              </li>
            ))}

            {room > 0 && (
              <li className="grid gap-1">
                <button
                  type="button"
                  onClick={openGallery}
                  disabled={!config || disabled}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand/40 text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed"
                >
                  <PlusIcon className="h-6 w-6" />
                  <span className="text-[13px] font-semibold">{t.add.more}</span>
                </button>
                {touch && (
                  <button
                    type="button"
                    onClick={openCamera}
                    disabled={!config || disabled}
                    className="flex min-h-tap items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[13px] font-semibold text-fg transition hover:bg-fg/5 disabled:cursor-not-allowed"
                  >
                    <CameraIcon className="h-4 w-4" />
                    {t.add.camera}
                  </button>
                )}
              </li>
            )}
          </ul>
          <p className="mt-2 text-hint text-muted">
            {t.grid.coverExplainer} {t.add.hint}
          </p>
        </>
      )}

      {photos.length + preparing + queue.length === 0 && (
        <p className="mt-2 text-hint text-muted">
          {t.add.hint}
        </p>
      )}

      {/* 4 — the optional video ---------------------------------------- */}
      <div className="mt-4 rounded-md border border-line bg-surface p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-muted">
            {t.video.label}{' '}
            <span className="font-normal">({t.video.optional})</span>
          </span>
          <span className="text-hint text-muted">{t.video.slot(video ? 1 : 0)}</span>
        </div>

        {video ? (
          <div className="flex flex-wrap items-center gap-3">
            {video.previewUrl ? (
              <video
                src={video.previewUrl}
                controls
                preload="metadata"
                className="h-20 rounded-md border border-line bg-black"
              />
            ) : (
              <div className="flex h-20 w-28 items-center justify-center rounded-md border border-line bg-surface-alt text-muted">
                <VideoIcon className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">{video.name}</p>
              <p className="text-hint text-muted">
                {video.status === 'sending'
                  ? t.video.sending
                  : (video.sizeLabel ?? t.video.hint)}
              </p>
              {video.status === 'sending' && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-pill bg-surface-alt">
                  <div
                    className="h-full rounded-pill bg-brand transition-[width]"
                    style={{ width: `${Math.round(video.progress * 100)}%` }}
                  />
                </div>
              )}
              {video.error && (
                <p className="mt-1 text-hint text-danger">{video.error}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => videoRef.current?.click()}
                  disabled={disabled}
                  className="min-h-tap rounded-xl border border-line bg-surface px-4 text-[14px] font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
                >
                  {t.video.replace}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving({ kind: 'video', id: video.id })}
                  disabled={disabled}
                  className="min-h-tap rounded-xl px-3 text-[14px] font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:text-muted"
                >
                  {t.video.remove}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              disabled={!config || disabled}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line text-xs font-semibold text-muted transition hover:border-accent hover:text-fg disabled:cursor-not-allowed"
            >
              <VideoIcon className="h-4 w-4" />
              {t.video.add}
            </button>
            <p className="mt-2 text-hint text-muted">{t.video.hint}</p>
          </>
        )}
      </div>

      {/* 5 — proof: the card this cover photo makes --------------------- */}
      {preview && ready[0]?.previewUrl && (
        <div className="mt-4">
          <p className="mb-2 text-[14px] font-semibold text-fg">
            {t.preview.title}
          </p>
          <div className="w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
            <div className="flex aspect-square items-center justify-center bg-surface-alt">
              <img
                src={ready[0].previewUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
            <div className="px-2.5 py-2">
              <p className="truncate text-xs font-semibold text-fg">
                {preview.name || 'Your product'}
              </p>
              <p className="text-xs text-muted">
                {preview.price || t.preview.noPrice}
              </p>
            </div>
          </div>
        </div>
      )}

      {shownError && (
        <div className="mt-3">
          <ErrorNote>{shownError}</ErrorNote>
        </div>
      )}

      {/* hidden pickers */}
      <input
        ref={galleryRef}
        type="file"
        accept={config ? acceptAttr(config.image) : 'image/*'}
        multiple
        hidden
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={config ? acceptAttr(config.image) : 'image/*'}
        capture="environment"
        hidden
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept={config ? acceptAttr(config.video) : 'video/*'}
        hidden
        onChange={(e) => {
          pickVideo(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* 3 — the questions and the sheet -------------------------------- */}
      {queue.length > 0 && !editing && (
        <ReviewQueue
          items={queue}
          onUse={(item) => commit(item)}
          onEdit={(item) => setEditing(item)}
          onUseAll={() => {
            for (const item of queue) commit(item)
          }}
          onSkip={dropQueueItem}
        />
      )}

      {editing && (
        <ImageEditDialog
          file={editing.original}
          title={t.editor.title}
          confirmLabel={t.editor.done}
          onCancel={() => setEditing(null)}
          onDone={(blob) => {
            commit(editing, blob)
            setEditing(null)
          }}
        />
      )}

      {sheetPhoto && sheetPhoto.status === 'ready' && (
        <PhotoSheet
          photo={sheetPhoto}
          index={sheetIndex}
          total={photos.length}
          canEdit={driver.originalFile(sheetPhoto.id) !== null}
          canDescribe={driver.describePhoto !== undefined}
          busy={driver.busy}
          onMakeCover={() => {
            driver.makeCover(sheetPhoto.id)
            setOpenPhoto(null)
          }}
          onEdit={() => {
            const original = driver.originalFile(sheetPhoto.id)
            if (!original) return
            setOpenPhoto(null)
            const previewUrl = URL.createObjectURL(original)
            queueUrls.current.push(previewUrl)
            setEditing({
              id: `edit-${sheetPhoto.id}`,
              original,
              blob: new Blob(),
              filename: webpName(original.name),
              previewUrl,
              ratioLabel: null,
              sizeLabel: '',
              replaceId: sheetPhoto.id,
            })
          }}
          onReplace={() => startReplace(sheetPhoto.id)}
          onDescribe={() => {
            setDescribing(sheetPhoto)
            setOpenPhoto(null)
          }}
          onMove={(delta) => {
            driver.movePhoto(sheetPhoto.id, delta)
            setOpenPhoto(null)
          }}
          onRemove={() => setRemoving({ kind: 'photo', id: sheetPhoto.id })}
          onClose={() => setOpenPhoto(null)}
        />
      )}

      {describing && driver.describePhoto && (
        <DescribeDialog
          photo={describing}
          onSave={(text) => driver.describePhoto!(describing.id, text)}
          onClose={() => setDescribing(null)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={
          removing?.kind === 'video' ? t.confirm.videoTitle : t.confirm.photoTitle
        }
        description={
          removing?.kind === 'video' ? t.confirm.videoBody : t.confirm.photoBody
        }
        confirmLabel={t.confirm.remove}
        cancelLabel={t.confirm.keep}
        busy={driver.busy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

/** One photo in the grid: the photo, its role, and its upload state. */
function Tile({
  photo,
  index,
  disabled,
  onOpen,
  onRetry,
  onDiscard,
}: {
  photo: BoardPhoto
  index: number
  disabled: boolean
  onOpen: () => void
  onRetry: () => void
  onDiscard: () => void
}) {
  if (photo.status === 'failed') {
    return (
      // The tile is small, so its two actions split it top/bottom and each
      // takes the full width — far bigger targets than the old 20px links.
      <div className="flex aspect-square flex-col items-stretch justify-center gap-1 rounded-xl border-2 border-danger bg-danger/5 p-1 text-center">
        <span className="text-[12px] font-bold text-danger">{t.grid.failed}</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-9 w-full flex-1 rounded-lg bg-danger text-[13px] font-bold text-brand-contrast transition hover:opacity-90"
        >
          {t.grid.retry}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-8 w-full rounded-lg text-[12px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
        >
          {t.grid.discard}
        </button>
      </div>
    )
  }

  if (photo.status === 'sending') {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-alt p-2">
        <span className="text-[12px] font-semibold text-muted">
          {t.grid.sending}
        </span>
        <div className="h-1 w-full overflow-hidden rounded-pill bg-line">
          <div
            className="h-full rounded-pill bg-brand transition-[width]"
            style={{ width: `${Math.round(photo.progress * 100)}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={t.sheet.photoLabel(index + 1)}
      className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-line bg-surface transition hover:border-accent disabled:cursor-not-allowed"
    >
      {photo.previewUrl ? (
        // `contain`, not `cover`: the tile is a true preview of the file being
        // uploaded, so a tall or wide photo reads as tall or wide.
        <img
          src={photo.previewUrl}
          alt=""
          loading="lazy"
          className="h-full w-full bg-surface-alt object-contain"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted">
          <BoxIcon className="h-6 w-6" />
        </span>
      )}

      {index === 0 && (
        <span className="absolute top-1 left-1 flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-brand-contrast">
          <CheckIcon className="h-3 w-3" />
          {t.grid.cover}
        </span>
      )}
      {(photo.edited || photo.ratioLabel) && (
        <span className="absolute bottom-1 left-1 rounded-md bg-scrim px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {photo.edited ? 'Edited' : photo.ratioLabel}
        </span>
      )}
      {/* A visible affordance that the tile is the way in — the sheet holds
          every action, so the tile needs no toolbar of its own. */}
      <span className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-scrim text-white transition group-hover:bg-accent">
        <PencilIcon className="h-4 w-4" />
      </span>
    </button>
  )
}
