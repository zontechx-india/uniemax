/**
 * The contract between the Media Board (all of the UI) and whatever is
 * holding the media (memory, before the product exists — or the server, once
 * it does).
 *
 * The board owns every step a seller sees: picking, the "use it / cut it"
 * question, the editor, the grid, the action sheet, the confirms. A driver
 * owns only what happens to the finished blob. That split is why the Add
 * Product form and the product row can look and behave identically while one
 * uploads immediately and the other waits for a product id.
 */

export type MediaStatus = 'ready' | 'sending' | 'failed'

export interface BoardPhoto {
  id: string
  /** Object URL (pending) or the stored URL (live). */
  previewUrl: string | null
  /** "4:5", "Portrait"… — null while unknown. */
  ratioLabel: string | null
  /** True once the seller cut or turned it — shown instead of the ratio. */
  edited: boolean
  status: MediaStatus
  /** 0–1 while `status` is "sending". */
  progress: number
  /** Set when `status` is "failed". */
  error: string | null
  altText: string | null
}

export interface BoardVideo {
  id: string
  previewUrl: string | null
  name: string
  /** "18 MB" — null when the size is not known (already on the server). */
  sizeLabel: string | null
  status: MediaStatus
  progress: number
  error: string | null
}

export interface MediaDriver {
  photos: BoardPhoto[]
  video: BoardVideo | null
  maxPhotos: number

  /** Store or upload a finished photo render. `edited` = the seller cut or turned it. */
  addPhoto: (
    blob: Blob,
    filename: string,
    original: File,
    edited?: boolean,
  ) => void
  /** Swap one photo's file, keeping its place in the order. */
  replacePhoto: (id: string, blob: Blob, filename: string, original: File) => void
  removePhoto: (id: string) => void
  makeCover: (id: string) => void
  movePhoto: (id: string, delta: number) => void

  addVideo: (file: File) => void
  removeVideo: () => void

  /**
   * The file the seller originally picked, when it is still around. Present
   * for photos waiting to be uploaded; null once a photo lives on the server,
   * because the stored image is on another origin and the browser cannot read
   * its pixels back into a canvas. Null hides "Cut or turn" from the sheet.
   */
  originalFile: (id: string) => File | null

  /** Alt text — only where there is a media row on the server to attach it to. */
  describePhoto?: (id: string, text: string | null) => Promise<void>
  /** Re-run a failed upload. */
  retryPhoto?: (id: string) => void
  /** True while a driver-level write is in flight (blocks the sheet's actions). */
  busy?: boolean
  /** Driver-level failure (a reorder that the server rejected, say). */
  error?: string | null
  clearError?: () => void
}
