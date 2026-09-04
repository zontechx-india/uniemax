import { useCallback, useMemo, useRef, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { storeCatalogApi } from '../../../features/stores/storesApi'
import type { StoreProduct } from '../../../features/stores/storesApi'
import type { BoardPhoto, BoardVideo, MediaDriver } from './types'

/** Mirror of the backend limit (also enforced server-side). */
export const MAX_LIVE_PHOTOS = 8

interface Upload {
  id: string
  filename: string
  blob: Blob
  /** Media id being replaced, or null for a new photo. */
  replaceId: string | null
  isVideo: boolean
  progress: number
  error: string | null
}

/**
 * Driver for a product that already exists: every action is an API call, and
 * each one returns the whole product back, so the page swaps one row.
 *
 * Uploads run through a single promise chain — the responses are full product
 * snapshots, so two in flight at once would overwrite each other.
 *
 * `originalFile` always returns null here: a stored photo lives on S3, which
 * serves no CORS headers, so the browser cannot read its pixels back into a
 * canvas to re-crop. The board hides "Cut or turn" for these and offers "Use
 * a different photo" instead — cropping happens on the way in.
 */
export function useLiveMedia(
  storeId: string,
  product: StoreProduct,
  onProductChange: (product: StoreProduct) => void,
) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chain = useRef(Promise.resolve())

  const images = useMemo(
    () => product.media.filter((m) => m.type === 'IMAGE'),
    [product.media],
  )
  const storedVideo = useMemo(
    () => product.media.find((m) => m.type === 'VIDEO') ?? null,
    [product.media],
  )

  const patchUpload = useCallback((id: string, patch: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }, [])

  const run = useCallback(
    (item: Upload) => {
      chain.current = chain.current.then(async () => {
        patchUpload(item.id, { progress: 0, error: null })
        try {
          const updated = item.replaceId
            ? await storeCatalogApi.replaceProductMediaFile(
                storeId,
                product.id,
                item.replaceId,
                item.blob,
                item.filename,
                (fraction) => patchUpload(item.id, { progress: fraction }),
              )
            : await storeCatalogApi.addProductMedia(
                storeId,
                product.id,
                item.blob,
                item.filename,
                (fraction) => patchUpload(item.id, { progress: fraction }),
              )
          onProductChange(updated)
          setUploads((list) => list.filter((u) => u.id !== item.id))
        } catch (err) {
          patchUpload(item.id, { error: toApiError(err).message })
        }
      })
    },
    [onProductChange, patchUpload, product.id, storeId],
  )

  const start = useCallback(
    (blob: Blob, filename: string, replaceId: string | null, isVideo: boolean) => {
      const item: Upload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        filename,
        blob,
        replaceId,
        isVideo,
        progress: 0,
        error: null,
      }
      setUploads((list) => [...list, item])
      run(item)
    },
    [run],
  )

  /** Runs one product mutation, surfacing its failure on the board. */
  const mutate = useCallback(async (call: () => Promise<StoreProduct>) => {
    setBusy(true)
    setError(null)
    try {
      onProductChange(await call())
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
    // onProductChange is stable enough in practice (the page passes a
    // setState-backed callback); listing it keeps the hook honest.
  }, [onProductChange])

  const commitOrder = useCallback(
    (ordered: typeof images) => {
      // Optimistic: paint the new order immediately, put it back on failure.
      const before = product
      onProductChange({
        ...product,
        media: [...ordered, ...(storedVideo ? [storedVideo] : [])],
      })
      void (async () => {
        setError(null)
        try {
          onProductChange(
            await storeCatalogApi.reorderProductMedia(
              storeId,
              product.id,
              ordered.map((m) => m.id),
            ),
          )
        } catch (err) {
          onProductChange(before)
          setError(toApiError(err).message)
        }
      })()
    },
    [onProductChange, product, storeId, storedVideo],
  )

  const photos: BoardPhoto[] = useMemo(() => {
    const stored = images.map(
      (item): BoardPhoto => ({
        id: item.id,
        previewUrl: item.url,
        // A stored photo's shape is not measured — the tile shows the image
        // itself, and "Cover" is the only label that carries meaning here.
        ratioLabel: null,
        edited: false,
        status: 'ready',
        progress: 1,
        error: null,
        altText: item.altText,
      }),
    )
    const pending = uploads
      .filter((u) => !u.isVideo && !u.replaceId)
      .map(
        (u): BoardPhoto => ({
          id: u.id,
          previewUrl: null,
          ratioLabel: null,
          edited: false,
          status: u.error ? 'failed' : 'sending',
          progress: u.progress,
          error: u.error,
          altText: null,
        }),
      )
    return [...stored, ...pending]
  }, [images, uploads])

  const videoUpload = uploads.find((u) => u.isVideo) ?? null
  const video: BoardVideo | null = useMemo(() => {
    if (videoUpload) {
      return {
        id: videoUpload.id,
        previewUrl: null,
        name: videoUpload.filename,
        sizeLabel: null,
        status: videoUpload.error ? 'failed' : 'sending',
        progress: videoUpload.progress,
        error: videoUpload.error,
      }
    }
    if (!storedVideo) return null
    return {
      id: storedVideo.id,
      previewUrl: storedVideo.url,
      name: 'Product video',
      sizeLabel: null,
      status: 'ready',
      progress: 1,
      error: null,
    }
  }, [storedVideo, videoUpload])

  const driver: MediaDriver = useMemo(
    () => ({
      photos,
      video,
      maxPhotos: MAX_LIVE_PHOTOS,
      addPhoto: (blob, filename) => start(blob, filename, null, false),
      replacePhoto: (id, blob, filename) => start(blob, filename, id, false),
      removePhoto: (id) => {
        const upload = uploads.find((u) => u.id === id)
        if (upload) {
          // A failed upload is discarded locally — nothing reached the server.
          return setUploads((list) => list.filter((u) => u.id !== id))
        }
        void mutate(() =>
          storeCatalogApi.deleteProductMedia(storeId, product.id, id),
        )
      },
      makeCover: (id) => {
        const photo = images.find((m) => m.id === id)
        if (!photo) return
        commitOrder([photo, ...images.filter((m) => m.id !== id)])
      },
      movePhoto: (id, delta) => {
        const from = images.findIndex((m) => m.id === id)
        const to = from + delta
        if (from < 0 || to < 0 || to >= images.length) return
        const next = [...images]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item!)
        commitOrder(next)
      },
      // A product takes one video: picking another REPLACES the stored one
      // (adding a second is a 409 from the server).
      addVideo: (file) => start(file, file.name, storedVideo?.id ?? null, true),
      removeVideo: () => {
        if (videoUpload) {
          return setUploads((list) => list.filter((u) => u.id !== videoUpload.id))
        }
        if (!storedVideo) return
        void mutate(() =>
          storeCatalogApi.deleteProductMedia(storeId, product.id, storedVideo.id),
        )
      },
      originalFile: () => null,
      describePhoto: async (id, text) => {
        await mutate(() =>
          storeCatalogApi.updateProductMediaAlt(storeId, product.id, id, text),
        )
      },
      retryPhoto: (id) => {
        const item = uploads.find((u) => u.id === id)
        if (item) run(item)
      },
      busy,
      error,
      clearError: () => setError(null),
    }),
    [
      busy,
      commitOrder,
      error,
      images,
      mutate,
      photos,
      product.id,
      run,
      start,
      storeId,
      storedVideo,
      uploads,
      video,
      videoUpload,
    ],
  )

  return driver
}
