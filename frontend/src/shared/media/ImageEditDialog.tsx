import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { renderToWebp, webpName } from './cropImage'

/**
 * Optional image editor: crop, rotate and zoom before uploading.
 *
 * Cropping is a CHOICE, not a toll gate. A product photo is uploaded as the
 * seller shot it unless they open this dialog and change something, and even
 * here "Use original" is one click away — forcing every photo into a square
 * is what cuts heads off shoes and bottles. The aspect chips (including
 * **Free** and **Original**) exist so the seller frames the product, rather
 * than the form framing it for them.
 *
 * Store logos are the exception and pass `aspects={[1]}`: a logo is displayed
 * in a square everywhere, so its own frame is fixed.
 */

export interface AspectOption {
  label: string
  /** width / height, or null for "keep the image's own ratio". */
  value: number | null
}

const PRODUCT_ASPECTS: AspectOption[] = [
  { label: 'Original', value: null },
  { label: 'Square', value: 1 },
  { label: 'Portrait', value: 4 / 5 },
  { label: 'Landscape', value: 16 / 9 },
]

export function ImageEditDialog({
  file,
  aspects = PRODUCT_ASPECTS,
  title = 'Adjust image',
  confirmLabel = 'Apply',
  allowOriginal = true,
  busy = false,
  onCancel,
  onDone,
}: {
  /** The picked file (already checked for type). Never mutated. */
  file: File
  /** Framing choices. A single fixed entry hides the chips (logos). */
  aspects?: AspectOption[]
  title?: string
  confirmLabel?: string
  /** Shows "Use original" — off for logos, which must be square. */
  allowOriginal?: boolean
  /** True while the caller is uploading the previous confirmation. */
  busy?: boolean
  onCancel: () => void
  /** Receives the rendered WebP blob + a filename for the multipart part. */
  onDone: (blob: Blob, filename: string) => void
}) {
  // The object URL is created INSIDE the effect (not useMemo) so that
  // StrictMode's mount → cleanup → mount cycle recreates it after the
  // cleanup revokes it — a memoized URL would stay revoked and the cropper
  // would render a black box.
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const [aspect, setAspect] = useState<number | null>(aspects[0]?.value ?? null)
  /**
   * The image's own width/height, learned when the cropper loads it. It backs
   * the "Original" chip: react-easy-crop always needs a concrete ratio, so
   * "keep this image's shape" means "use exactly its own ratio" — at zoom 1
   * the crop box is then the whole photo and applying it changes nothing.
   */
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  /** Anything the user actually changed — drives the "untouched" wording. */
  const touched = zoom !== 1 || rotation !== 0 || aspect !== (aspects[0]?.value ?? null)

  /** A quarter turn swaps the image's own ratio, so "Original" follows it. */
  const originalRatio =
    naturalRatio === null
      ? null
      : rotation % 180 === 0
        ? naturalRatio
        : 1 / naturalRatio

  const reset = () => {
    setAspect(aspects[0]?.value ?? null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setError(null)
  }

  const render = async (options: { area: Area | null; rotation: number }) => {
    if (!src) return
    setError(null)
    setProcessing(true)
    try {
      onDone(await renderToWebp(src, options), webpName(file.name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the image.')
    } finally {
      setProcessing(false)
    }
  }

  const working = processing || busy

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-lg rounded-lg bg-surface p-5 shadow-floating">
        <h3 className="text-base font-bold text-fg">{title}</h3>
        <p className="mt-1 text-xs text-muted">
          Drag to position, pinch or use the slider to zoom. Nothing outside
          the frame is uploaded.
        </p>

        {aspects.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {aspects.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setAspect(option.value)}
                aria-pressed={aspect === option.value}
                className={`h-8 rounded-md border px-3 text-xs font-semibold transition ${
                  aspect === option.value
                    ? 'border-accent bg-accent/10 text-fg'
                    : 'border-line bg-surface text-muted hover:text-fg'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative mt-3 h-72 overflow-hidden rounded-md bg-black/80 sm:h-80">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect ?? originalRatio ?? 1}
              onMediaLoaded={({ naturalWidth, naturalHeight }) =>
                setNaturalRatio(naturalWidth / naturalHeight)
              }
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-[180px] flex-1 items-center gap-3">
            <span className="text-xs font-medium text-muted">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
              aria-label="Zoom"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 270) % 360)}
              disabled={working}
              className="h-8 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              ⟲ Rotate
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={working}
              className="h-8 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              ⟳ Rotate
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={working || !touched}
              className="h-8 rounded-md px-2.5 text-xs font-semibold text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            Cancel
          </button>
          {allowOriginal && (
            <button
              type="button"
              onClick={() => void render({ area: null, rotation: 0 })}
              disabled={working}
              className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              Use original
            </button>
          )}
          <button
            type="button"
            onClick={() => void render({ area, rotation })}
            disabled={working || !area}
            className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
          >
            {working ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
