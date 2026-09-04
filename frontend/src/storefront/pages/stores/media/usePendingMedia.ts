import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { imageSize, ratioLabel } from '../../../../shared/media/cropImage'
import type { BoardPhoto, BoardVideo, MediaDriver } from './types'

/** Mirror of the backend limit (also enforced server-side). */
export const MAX_PENDING_PHOTOS = 8

/** One photo held in memory, waiting for a product id to upload to. */
export interface PendingPhoto {
  id: string
  /** The file as picked. Kept so every edit re-renders from the ORIGINAL. */
  file: File
  /** WebP render that will actually be uploaded. */
  blob: Blob
  filename: string
  previewUrl: string
  ratioLabel: string | null
  edited: boolean
}

export interface PendingVideo {
  file: File
  previewUrl: string
}

/**
 * Driver for the **Add Product** form: media uploads address a product by id
 * (`POST …/products/:productId/media`), so at add time there is nothing to
 * upload to. Everything is held here and the form uploads it the moment the
 * product exists.
 *
 * Returns the raw pending items too — the form needs the blobs, not the
 * board's display shape.
 */
export function usePendingMedia() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [video, setVideo] = useState<PendingVideo | null>(null)

  /**
   * Revoke every preview URL when the form goes away (submitted or
   * cancelled). Refs, because the cleanup must see the LAST state, not the
   * one captured when the effect first ran.
   */
  const latestPhotos = useRef(photos)
  latestPhotos.current = photos
  const latestVideo = useRef(video)
  latestVideo.current = video
  useEffect(
    () => () => {
      for (const photo of latestPhotos.current) {
        URL.revokeObjectURL(photo.previewUrl)
      }
      if (latestVideo.current) URL.revokeObjectURL(latestVideo.current.previewUrl)
    },
    [],
  )

  /** Measures the render so the tile can show what shape it is. */
  const describeShape = useCallback(async (blob: Blob) => {
    const size = await imageSize(new File([blob], 'render.webp', { type: blob.type }))
    return size ? ratioLabel(size.width, size.height) : null
  }, [])

  const addPhoto = useCallback(
    (blob: Blob, filename: string, original: File, edited = false) => {
      const photo: PendingPhoto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: original,
        blob,
        filename,
        previewUrl: URL.createObjectURL(blob),
        ratioLabel: null,
        edited,
      }
      setPhotos((list) =>
        list.length >= MAX_PENDING_PHOTOS ? list : [...list, photo],
      )
      void describeShape(blob).then((label) =>
        setPhotos((list) =>
          list.map((p) => (p.id === photo.id ? { ...p, ratioLabel: label } : p)),
        ),
      )
    },
    [describeShape],
  )

  const replacePhoto = useCallback(
    (id: string, blob: Blob, filename: string, original: File) => {
      const previewUrl = URL.createObjectURL(blob)
      setPhotos((list) =>
        list.map((p) => {
          if (p.id !== id) return p
          URL.revokeObjectURL(p.previewUrl)
          return {
            ...p,
            file: original,
            blob,
            filename,
            // Same source file back = the seller cut or turned this photo;
            // a different file = they swapped the photo entirely.
            previewUrl,
            edited: original === p.file,
          }
        }),
      )
      void describeShape(blob).then((label) =>
        setPhotos((list) =>
          list.map((p) => (p.id === id ? { ...p, ratioLabel: label } : p)),
        ),
      )
    },
    [describeShape],
  )

  const removePhoto = useCallback((id: string) => {
    setPhotos((list) => {
      const going = list.find((p) => p.id === id)
      if (going) URL.revokeObjectURL(going.previewUrl)
      return list.filter((p) => p.id !== id)
    })
  }, [])

  const makeCover = useCallback((id: string) => {
    setPhotos((list) => {
      const photo = list.find((p) => p.id === id)
      return photo ? [photo, ...list.filter((p) => p.id !== id)] : list
    })
  }, [])

  const movePhoto = useCallback((id: string, delta: number) => {
    setPhotos((list) => {
      const from = list.findIndex((p) => p.id === id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= list.length) return list
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      return next
    })
  }, [])

  const addVideo = useCallback((file: File) => {
    setVideo((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }, [])

  const removeVideo = useCallback(() => {
    setVideo((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }, [])

  const originalFile = useCallback(
    (id: string) => photos.find((p) => p.id === id)?.file ?? null,
    [photos],
  )

  const driver: MediaDriver = useMemo(
    () => ({
      photos: photos.map(
        (p): BoardPhoto => ({
          id: p.id,
          previewUrl: p.previewUrl,
          ratioLabel: p.ratioLabel,
          edited: p.edited,
          status: 'ready',
          progress: 1,
          error: null,
          altText: null,
        }),
      ),
      video: video
        ? ({
            id: 'pending-video',
            previewUrl: video.previewUrl,
            name: video.file.name,
            sizeLabel: `${(video.file.size / (1024 * 1024)).toFixed(1)} MB`,
            status: 'ready',
            progress: 1,
            error: null,
          } satisfies BoardVideo)
        : null,
      maxPhotos: MAX_PENDING_PHOTOS,
      addPhoto,
      replacePhoto,
      removePhoto,
      makeCover,
      movePhoto,
      addVideo,
      removeVideo,
      originalFile,
    }),
    [
      photos,
      video,
      addPhoto,
      replacePhoto,
      removePhoto,
      makeCover,
      movePhoto,
      addVideo,
      removeVideo,
      originalFile,
    ],
  )

  return { driver, photos, video }
}
