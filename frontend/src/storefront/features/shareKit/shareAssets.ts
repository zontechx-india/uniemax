import { http } from '../../../shared/auth/http'
import { getMediaConfig } from '../../../shared/media/mediaConfig'

/**
 * Getting stored images onto a canvas that can still be EXPORTED.
 *
 * A canvas that has drawn a cross-origin image without CORS is "tainted" and
 * `toBlob()` throws — the S3 originals are exactly that. The API's sized
 * copies (`/api/v1/public/images/w/{width}/{bucket}/{key}`, the same ones
 * every `srcset` uses) are served through `/api`, i.e. same-origin in every
 * environment, so the Share Kit draws those. Anything the server does not
 * store (an outside URL) is tried with CORS and, failing that, treated as
 * missing — the card falls back to the letter tile or the brand panel
 * rather than producing an image the seller cannot download.
 */

/** The canvas-safe URL of a stored image at `width` px (or the URL itself). */
async function canvasSafeUrl(url: string, width: 640 | 1280): Promise<string> {
  const { images } = await getMediaConfig()
  const source = images.sources.find((s) => url.startsWith(s.root))
  if (!source) return url
  const key = url.slice(source.root.length)
  if (!new RegExp(images.keyPattern).test(key)) return url
  // A logo is never wider than its bucket's cap; ask for the copy that fits.
  const w = images.widths.includes(width) ? width : (images.widths.at(-1) ?? width)
  return `${http.defaults.baseURL ?? ''}/api/v1/public/images/w/${w}/${source.bucket}/${key}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

/** A stored image ready for the canvas, or null when it cannot be used. */
export async function loadCanvasImage(
  url: string | null | undefined,
  width: 640 | 1280,
): Promise<HTMLImageElement | null> {
  if (!url) return null
  try {
    return await loadImage(await canvasSafeUrl(url, width))
  } catch {
    return null
  }
}

/** An image as a `data:` URL — embedded in the SVG download so it stands alone. */
export function imageToDataUrl(img: HTMLImageElement, max = 256): string | null {
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('empty image'))),
        // PNG, not JPEG: hard module edges survive Instagram's own
        // recompression far better when they arrive lossless.
        'image/png',
      )
    } catch (err) {
      reject(err instanceof Error ? err : new Error('image export failed'))
    }
  })
}

/** Save a blob as a file (a temporary object URL + a download link). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Some browsers start the download asynchronously; give them a moment.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Can this browser hand an IMAGE FILE to the system share sheet (Web Share
 * Level 2)? True on Android Chrome and iOS/macOS Safari; false on Firefox
 * and older browsers, which keep the download buttons only.
 */
export function canShareImages(): boolean {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}
