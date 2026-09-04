import type { Area } from 'react-easy-crop'

/**
 * Canvas-side of the upload flow: turns a picked file into the WebP blob that
 * is actually uploaded — optionally rotated and cropped first.
 *
 * Cropping is OPTIONAL (see `ImageEditDialog`): an untouched photo still comes
 * through here so it is downscaled and compressed, but it keeps its own aspect
 * ratio and nothing is cut off. The original file never leaves the browser.
 */

/** Longest edge of an uploaded image — plenty for a storefront card/gallery. */
export const MAX_EDGE = 1600
/** WebP quality — visually lossless for product photos at a fraction of the bytes. */
const QUALITY = 0.85
/** Fallbacks tried, in order, when the first encode is still over the limit. */
const FALLBACKS: { maxEdge: number; quality: number }[] = [
  { maxEdge: 1600, quality: 0.7 },
  { maxEdge: 1280, quality: 0.6 },
]

export interface RenderOptions {
  /**
   * Crop rectangle in pixels of the ROTATED image, as react-easy-crop reports
   * it. Omitted/null = no crop: the whole (rotated) image is kept.
   */
  area?: Area | null
  /** Whole-image rotation in degrees (0 / 90 / 180 / 270). */
  rotation?: number
  maxEdge?: number
  quality?: number
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read this image file.'))
    image.src = src
  })
}

/**
 * Renders `src` (an object URL) to a WebP blob: rotate → crop → scale down to
 * `maxEdge` → encode. With no `area` and no `rotation` this is a pure
 * "optimize" pass that preserves the image exactly as the seller picked it.
 */
export async function renderToWebp(
  src: string,
  { area, rotation = 0, maxEdge = MAX_EDGE, quality = QUALITY }: RenderOptions = {},
): Promise<Blob> {
  const image = await loadImage(src)
  const source = rotation ? rotate(image, rotation) : image

  const region: Area = area ?? {
    x: 0,
    y: 0,
    width: sourceWidth(source),
    height: sourceHeight(source),
  }

  // Clamp: a crop box can extend past the image edge when the user zooms out.
  const x = Math.max(0, Math.round(region.x))
  const y = Math.max(0, Math.round(region.y))
  const width = Math.max(1, Math.round(Math.min(region.width, sourceWidth(source) - x)))
  const height = Math.max(1, Math.round(Math.min(region.height, sourceHeight(source) - y)))

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser.')
  ctx.drawImage(source, x, y, width, height, 0, 0, outWidth, outHeight)

  return toWebp(canvas, quality)
}

/**
 * The no-crop path: downscale + encode a picked file as-is, keeping its own
 * aspect ratio. Used the moment a photo is picked, so what is held (and later
 * uploaded) is already storefront-sized.
 *
 * If the result is still over `maxBytes` (a huge, noisy photo), it retries at
 * lower quality/size rather than making the seller go find a smaller file.
 * Returns `null` when even the last attempt is too big.
 */
export async function prepareImage(
  file: File,
  maxBytes: number,
  options: RenderOptions = {},
): Promise<Blob | null> {
  const src = URL.createObjectURL(file)
  try {
    let blob = await renderToWebp(src, options)
    for (const fallback of FALLBACKS) {
      if (blob.size <= maxBytes) break
      blob = await renderToWebp(src, { ...options, ...fallback })
    }
    return blob.size <= maxBytes ? blob : null
  } finally {
    URL.revokeObjectURL(src)
  }
}

/** Pixel size of an image file — shown next to a picked photo. */
export async function imageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  const src = URL.createObjectURL(file)
  try {
    const image = await loadImage(src)
    return { width: image.naturalWidth, height: image.naturalHeight }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(src)
  }
}

/** "16:9"-style label for a width/height pair, for the picked-photo hint. */
export function ratioLabel(width: number, height: number): string {
  const ratio = width / height
  const known: [number, string][] = [
    [1, '1:1'],
    [4 / 5, '4:5'],
    [3 / 4, '3:4'],
    [5 / 4, '5:4'],
    [4 / 3, '4:3'],
    [3 / 2, '3:2'],
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
  ]
  for (const [value, label] of known) {
    if (Math.abs(ratio - value) < 0.03) return label
  }
  return ratio > 1 ? 'Landscape' : 'Portrait'
}

/** "photo.HEIC" → "photo.webp" (the upload is always the WebP render). */
export function webpName(filename: string): string {
  return `${filename.replace(/\.[^.]+$/, '') || 'image'}.webp`
}

// ---- internals -------------------------------------------------------------

/** Draws the image onto its rotated bounding box, ready to be cropped from. */
function rotate(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180
  const { naturalWidth: w, naturalHeight: h } = image
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const boxWidth = Math.round(w * cos + h * sin)
  const boxHeight = Math.round(w * sin + h * cos)

  const canvas = document.createElement('canvas')
  canvas.width = boxWidth
  canvas.height = boxHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser.')
  ctx.translate(boxWidth / 2, boxHeight / 2)
  ctx.rotate(radians)
  ctx.drawImage(image, -w / 2, -h / 2)
  return canvas
}

function sourceWidth(source: HTMLImageElement | HTMLCanvasElement): number {
  return source instanceof HTMLCanvasElement ? source.width : source.naturalWidth
}

function sourceHeight(source: HTMLImageElement | HTMLCanvasElement): number {
  return source instanceof HTMLCanvasElement ? source.height : source.naturalHeight
}

function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not process this image.')),
      'image/webp',
      quality,
    ),
  )
}
