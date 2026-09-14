import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { MAX_EDGE, renderToWebp, webpName } from './cropImage'

/**
 * Image editor: crop, rotate and zoom before uploading.
 *
 * For a PRODUCT PHOTO, cropping is a CHOICE, not a toll gate. The photo is
 * uploaded as the seller shot it unless they open this dialog and change
 * something, and even here "Use original" is one click away — forcing every
 * photo into a square is what cuts heads off shoes and bottles. The aspect
 * chips (including **Free** and **Original**) exist so the seller frames the
 * product, rather than the form framing it for them.
 *
 * For an image with a FIXED FRAME it is the opposite, and the caller says so
 * by passing one aspect plus `allowOriginal={false}`: a store logo
 * (`aspects={[1]}`) is displayed in a square everywhere, and a banner
 * (`aspects={[16/5]}`, `maxEdge={1920}`) fills a fixed 16:5 strip. There the
 * image WILL be cropped either way — the dialog exists so the person who
 * made it decides what is lost, instead of `object-cover` quietly taking it
 * off the top and bottom.
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

/**
 * The dialog is a WORKBENCH, not a notice, so it takes most of the viewport:
 * the person is deciding what a crop throws away, and they cannot judge that
 * in a thumbnail. A fixed 512px panel made this worst for the shape that needs
 * the room most — a 16:5 banner ended up a ~130px strip floating in letterbox
 * bars — so the stage is cut to the crop's OWN ratio and the panel is drawn
 * around it.
 */

/** Panoramas (16:5 banners) earn the extra width; boxy crops don't need it. */
const STAGE_CAP_WIDE = 1120
const STAGE_CAP_BOXY = 760
/** Height ceiling, so a square crop can't push the buttons off-screen. */
const STAGE_MAX_VH = 62
/** The backdrop’s own `p-4`, both sides — the panel’s gutter to the screen. */
const BACKDROP_PAD_REM = 2
/** The panel’s `p-5`, both sides — the stage’s gutter inside the panel. */
const PANEL_PAD_REM = 2.5
/** Below this the controls row starts to cramp. */
const PANEL_MIN_PX = 320
/** Assumed stage shape when the ratio is the user's to change (see below). */
const FREEFORM_RATIO = 4 / 3

export function ImageEditDialog({
  file,
  aspects = PRODUCT_ASPECTS,
  title = 'Adjust image',
  confirmLabel = 'Apply',
  allowOriginal = true,
  maxEdge = MAX_EDGE,
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
  /**
   * Longest edge of the rendered blob. Defaults to the product-photo size;
   * banners pass 1920, because a banner is displayed at full page width and
   * 1600 would be upscaled on a large monitor.
   */
  maxEdge?: number
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
      onDone(await renderToWebp(src, { ...options, maxEdge }), webpName(file.name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the image.')
    } finally {
      setProcessing(false)
    }
  }

  /**
   * ONE fixed aspect means the frame is known before the image even loads, so
   * the stage is cut to exactly that shape and the artwork fills it edge to
   * edge. With the chips the ratio is the user's to change, and a dialog that
   * jumps size under the cursor on every tap is worse than a little letterbox,
   * so those keep one steady shape instead.
   */
  const stageRatio = (aspects.length === 1 ? aspects[0]?.value : null) ?? FREEFORM_RATIO
  /** Room for the stage once both gutters are paid for. */
  const stageBudget = `min(calc(100vw - ${BACKDROP_PAD_REM + PANEL_PAD_REM}rem), ${
    stageRatio >= 1.5 ? STAGE_CAP_WIDE : STAGE_CAP_BOXY
  }px)`
  // Height first, so the vh ceiling wins; the width then follows from it and
  // is therefore always inside the budget above.
  const stageHeight = `min(${STAGE_MAX_VH}vh, calc(${stageBudget} / ${stageRatio}))`
  const stageWidth = `calc(${stageHeight} * ${stageRatio})`
  /** The panel hugs the stage, not the other way round. */
  const panelWidth = `min(calc(100vw - ${BACKDROP_PAD_REM}rem), max(${PANEL_MIN_PX}px, calc(${stageWidth} + ${PANEL_PAD_REM}rem)))`

  const working = processing || busy

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[94vh] overflow-y-auto rounded-lg bg-surface p-5 shadow-floating"
        style={{ width: panelWidth }}
      >
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

        <div
          className="relative mx-auto mt-3 overflow-hidden rounded-md bg-black/80"
          style={{ width: stageWidth, height: stageHeight }}
        >
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
