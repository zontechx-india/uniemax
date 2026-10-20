import { useEffect, useRef, useState } from 'react'
import { prepareImage } from '../../../../shared/media/cropImage'
import {
  acceptAttr,
  getMediaConfig,
  validateImageSource,
} from '../../../../shared/media/mediaConfig'
import type { MediaConfig } from '../../../../shared/media/mediaConfig'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { FIELD_LABEL } from '../../../../shared/ui/field'
import { ErrorNote } from '../../../../shared/ui/form'
import { ImageIcon, TrashIcon } from '../../../layout/icons'

/**
 * "Mark as delivered" — with an optional proof-of-delivery photo (the
 * courier's proof, or a screenshot of it). The photo is shrunk to WebP in the
 * browser first, like every product photo, so a 12 MB phone picture uploads
 * as a small file. Only the seller and UnieMax support ever see it.
 */

export interface PickedPhoto {
  blob: Blob
  filename: string
}

export function DeliveredDialog({
  open,
  cod,
  busy,
  progress,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  /** A cash-on-delivery order — it is marked paid on delivery. */
  cod: boolean
  busy: boolean
  /** Upload progress 0–1 while the photo is sending. */
  progress: number | null
  error: string | null
  onSubmit: (photo: PickedPhoto | null) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [config, setConfig] = useState<MediaConfig | null>(null)
  const [photo, setPhoto] = useState<(PickedPhoto & { previewUrl: string }) | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPhotoError(null)
    getMediaConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [open])

  // Let go of the preview URL whenever the photo changes or the sheet unmounts.
  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  // A closed sheet forgets its photo, so the next open starts clean.
  useEffect(() => {
    if (!open) setPhoto(null)
  }, [open])

  const pick = async (file: File | undefined) => {
    if (!file || !config) return
    setPhotoError(null)
    const problem = validateImageSource(file, config.image)
    if (problem) {
      setPhotoError(problem)
      return
    }
    setPreparing(true)
    try {
      const blob = await prepareImage(file, config.image.maxMB * 1024 * 1024)
      if (!blob) {
        setPhotoError(`This photo is too large even after shrinking — try a smaller one.`)
        return
      }
      setPhoto({
        blob,
        filename: `${file.name.replace(/\.[^.]+$/, '') || 'proof'}.webp`,
        previewUrl: URL.createObjectURL(blob),
      })
    } catch {
      setPhotoError('This photo could not be read — try another one.')
    } finally {
      setPreparing(false)
    }
  }

  const submitLabel = busy
    ? progress !== null && photo
      ? `Uploading… ${Math.round(progress * 100)}%`
      : 'Please wait…'
    : 'Mark as delivered'

  return (
    <Dialog
      open={open}
      title="Mark as delivered?"
      subtitle="The customer sees this straight away."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            Go back
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={busy}
            disabled={preparing}
            onClick={() => onSubmit(photo ? { blob: photo.blob, filename: photo.filename } : null)}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-base text-fg">
          The parcel reached the customer.
          {cod && <> This cash-on-delivery order is marked paid.</>}
        </p>

        <div>
          <span className={FIELD_LABEL}>Proof of delivery (optional)</span>
          {photo ? (
            <div className="space-y-2">
              {/* A local blob: preview — not a stored image, so a bare <img> is right. */}
              <img
                src={photo.previewUrl}
                alt="Proof of delivery you picked"
                className="h-48 w-full rounded-md border border-line object-contain bg-fg/5"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setPhoto(null)}
              >
                <TrashIcon className="h-4 w-4" />
                Remove photo
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={!config || preparing || busy}
              onClick={() => inputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
              {preparing ? 'Preparing photo…' : 'Add a photo'}
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={config ? acceptAttr(config.image) : 'image/*'}
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="mt-1.5 text-sm text-muted">
            A photo or screenshot of the courier&apos;s delivery proof. Only you and
            UnieMax support can see it.
          </p>
          {photoError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {photoError}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
