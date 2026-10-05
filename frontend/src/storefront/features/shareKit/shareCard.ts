import { initialsOf } from '../../../shared/media/letterLogo'
import type { CardPalette } from './palette'
import { drawFrostedPanel } from './crystal'
import { drawPattern, isArtPattern } from './patterns'
import type { SharePattern } from './patterns'
import { drawContained, drawQr } from './qr'
import type { QrMatrix, QrStyle } from './qr'

/**
 * The Store Share Kit's one renderer. `drawShareCard()` paints a finished
 * share card onto a 2D context at its real pixel size; the live preview, the
 * Instagram Post and the Instagram Story are all this function — the preview
 * is simply the same canvas scaled down by CSS — so what the seller sees is
 * byte-for-byte what they download.
 *
 * Layout is a vertical STACK of rows centred in a safe box, with the QR as
 * the one flexible row: it takes whatever height the text leaves, between a
 * floor that keeps it scannable from a phone screen and a ceiling that keeps
 * the card from becoming a bare QR. So a long two-line shop name shrinks the
 * code a little rather than pushing the URL off the bottom.
 */

export type ShareTemplate = 'minimal' | 'brand' | 'product'
export type ShareFormat = 'post' | 'story'

type Img = CanvasImageSource & { width: number; height: number }

interface FormatSpec {
  width: number
  height: number
  /** Content box. The story's keeps clear of Instagram's own top/bottom UI. */
  safe: { top: number; bottom: number; side: number }
  /** Product template: height of the photo across the top. */
  photo: number
  qr: { min: number; max: number; productMax: number }
  scale: number
}

export const FORMATS: Record<ShareFormat, FormatSpec> = {
  post: {
    width: 1080,
    height: 1350,
    safe: { top: 96, bottom: 96, side: 104 },
    photo: 500,
    qr: { min: 340, max: 540, productMax: 400 },
    scale: 1,
  },
  story: {
    width: 1080,
    height: 1920,
    // Instagram draws the progress bar, avatar and reply box over roughly the
    // top 250px and bottom 280px of a 1920px story.
    safe: { top: 270, bottom: 300, side: 104 },
    photo: 720,
    qr: { min: 400, max: 640, productMax: 500 },
    scale: 1.12,
  },
}

export interface ShareCardSpec {
  template: ShareTemplate
  format: ShareFormat
  qrStyle: QrStyle
  palette: CardPalette
  storeName: string
  tagline: string
  caption: string
  /** Shown under the code — the URL without its scheme. */
  displayUrl: string
  /** Product template only: the eyebrow over the shop name. */
  eyebrow: string
  showLogoInQr: boolean
  /** Background pattern (`patterns.ts`); 'none' = flat. */
  pattern: SharePattern
}

/**
 * The card's background and the colour its pattern is drawn in — shared with
 * the page's pattern swatches so a swatch is exactly what the card gets.
 */
export function cardBackground(template: ShareTemplate, palette: CardPalette): { bg: string; ink: string } {
  return template === 'brand'
    ? { bg: palette.accent, ink: palette.onAccent }
    : { bg: '#ffffff', ink: palette.accentOnWhite }
}

export interface ShareCardAssets {
  matrix: QrMatrix
  /** Store logo, or null → a letter tile in the accent colour. */
  logo: Img | null
  /** Product template photo, or null → the brand panel with the logo. */
  product: Img | null
}

const SERIF = `'Fraunces', Georgia, 'Times New Roman', serif`
const SANS = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`

/** Fonts the renderer uses — awaited once before the first draw. */
export function loadShareFonts(): Promise<unknown> {
  if (!('fonts' in document)) return Promise.resolve()
  return Promise.all([
    document.fonts.load(`600 64px ${SERIF}`),
    document.fonts.load(`500 32px ${SANS}`),
    document.fonts.load(`700 32px ${SANS}`),
    document.fonts.load(`800 32px ${SANS}`),
  ]).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * The text as user-perceived characters (grapheme clusters). Malayalam,
 * Tamil, Devanagari and emoji are built from several code points per visible
 * letter; splitting between them (`Array.from`) strands a vowel sign and
 * the browser draws it on a dotted circle. Falls back to code points where
 * `Intl.Segmenter` is missing (very old browsers).
 */
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text)
}

/** Word-wrap `text` to `maxWidth`; a single over-long word is broken between letters. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    if (line) lines.push(line)
    if (ctx.measureText(word).width <= maxWidth) {
      line = word
      continue
    }
    // Break the long word itself (a long slug-like name, a URL) — after a
    // "-" or "/" when there is one in the back half, so a URL splits between
    // its words rather than through one.
    line = ''
    for (const ch of graphemes(word)) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        const cut = Math.max(line.lastIndexOf('-'), line.lastIndexOf('/'))
        if (cut >= line.length / 2) {
          lines.push(line.slice(0, cut + 1))
          line = line.slice(cut + 1) + ch
        } else {
          lines.push(line)
          line = ch
        }
      } else line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  const chars = graphemes(text)
  while (chars.length > 1 && ctx.measureText(`${chars.join('').trimEnd()}…`).width > maxWidth) {
    chars.pop()
  }
  return `${chars.join('').trimEnd()}…`
}

interface TextBlock {
  lines: string[]
  font: string
  lineHeight: number
}

/**
 * The largest of `sizes` at which `text` fits in `maxLines`; at the smallest
 * size the last line is cut with an ellipsis rather than overflowing.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { weight: number; family: string; sizes: number[]; maxWidth: number; maxLines: number; leading: number },
): TextBlock {
  let lines: string[] = []
  let font = ''
  let size = opts.sizes[0]!
  for (size of opts.sizes) {
    font = `${opts.weight} ${size}px ${opts.family}`
    ctx.font = font
    lines = wrap(ctx, text, opts.maxWidth)
    if (lines.length <= opts.maxLines) break
  }
  if (lines.length > opts.maxLines) {
    const kept = lines.slice(0, opts.maxLines)
    kept[kept.length - 1] = ellipsize(ctx, `${kept[kept.length - 1]} ${lines.slice(opts.maxLines).join(' ')}`, opts.maxWidth)
    lines = kept
  }
  return { lines, font, lineHeight: Math.round(size * opts.leading) }
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  centerX: number,
  top: number,
  color: string,
  letterSpacing = '0px',
) {
  ctx.save()
  ctx.font = block.font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Older Safari ignores canvas letterSpacing; the text simply sets tighter.
  if ('letterSpacing' in ctx) ctx.letterSpacing = letterSpacing
  block.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, top + block.lineHeight * (index + 0.5))
  })
  ctx.restore()
}

const blockHeight = (block: TextBlock) => block.lines.length * block.lineHeight

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** The letter tile used when a shop has no (loadable) logo. */
function drawLetterTile(ctx: CanvasRenderingContext2D, name: string, color: string, onColor: string, x: number, y: number, size: number, radius: number) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, radius)
  ctx.fill()
  const text = initialsOf(name)
  ctx.fillStyle = onColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(size * (text.length > 1 ? 0.36 : 0.46))}px ${SANS}`
  ctx.fillText(text, x + size / 2, y + size / 2 + size * 0.02)
  ctx.restore()
}

/** A logo tile: white rounded square, hairline edge, logo contained inside. */
function drawLogoTile(
  ctx: CanvasRenderingContext2D,
  spec: ShareCardSpec,
  logo: Img | null,
  cx: number,
  y: number,
  size: number,
  bordered: boolean,
) {
  const x = cx - size / 2
  const radius = size * 0.24
  if (!logo) {
    // On the Brand template the card IS the accent, so the tile turns white.
    if (spec.template === 'brand') {
      drawLetterTile(ctx, spec.storeName, '#ffffff', spec.palette.accentOnWhite, x, y, size, radius)
    } else {
      drawLetterTile(ctx, spec.storeName, spec.palette.accent, spec.palette.onAccent, x, y, size, radius)
    }
    return
  }
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, radius)
  ctx.fill()
  if (bordered) {
    ctx.strokeStyle = spec.palette.hairline
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
  const pad = size * 0.12
  drawContained(ctx, logo, x + pad, y + pad, size - pad * 2, size - pad * 2, radius * 0.6)
}

/** The logo the QR centre uses — the real logo, or a letter tile drawn to a canvas. */
export function qrCenterImage(spec: Pick<ShareCardSpec, 'showLogoInQr' | 'storeName' | 'palette'>, logo: Img | null): Img | null {
  if (!spec.showLogoInQr) return null
  if (logo) return logo
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawLetterTile(ctx, spec.storeName, spec.palette.qr, '#ffffff', 0, 0, 256, 56)
  return canvas
}

/** `object-fit: cover` into a rect. */
function drawCover(ctx: CanvasRenderingContext2D, image: Img, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h)
}

// ---------------------------------------------------------------------------
// The stack
// ---------------------------------------------------------------------------

interface Row {
  height: number
  /** Space ABOVE this row (ignored for the first). */
  gap: number
  draw: (top: number) => void
}

/**
 * Centre the rows vertically in [top, bottom]. The QR row's height is
 * `flex(available)` — computed after every fixed row is measured.
 */
function layoutStack(
  top: number,
  bottom: number,
  rows: Row[],
  qrIndex: number,
  qrRange: { min: number; max: number },
  /** Called with the stack's final top and height before any row draws. */
  beforeDraw?: (top: number, height: number) => void,
) {
  const fixed = rows.reduce((sum, row, i) => sum + (i === qrIndex ? 0 : row.height) + (i > 0 ? row.gap : 0), 0)
  const qr = Math.max(qrRange.min, Math.min(qrRange.max, bottom - top - fixed))
  rows[qrIndex]!.height = qr
  const total = fixed + qr
  let y = top + Math.max(0, (bottom - top - total) / 2)
  beforeDraw?.(y, total)
  rows.forEach((row, i) => {
    if (i > 0) y += row.gap
    row.draw(y)
    y += row.height
  })
}

export function drawShareCard(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, assets: ShareCardAssets): void {
  const f = FORMATS[spec.format]
  const { width: W, height: H } = f
  const s = f.scale
  const cx = W / 2
  const textWidth = W - f.safe.side * 2
  const p = spec.palette
  const onBrand = spec.template === 'brand'

  // Colours by template.
  const { bg, ink: patternInk } = cardBackground(spec.template, p)
  const titleColor = onBrand ? p.onAccent : p.ink
  const bodyColor = onBrand ? withAlpha(p.onAccent, 0.82) : p.muted
  const captionColor = onBrand ? p.onAccent : spec.template === 'minimal' ? p.accentOnWhite : p.ink

  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Pattern first, so everything else — photo, plates, text — sits on top.
  // On Minimal it stays inside the printed frame.
  const framed = spec.template === 'minimal'
  drawPattern(ctx, spec.pattern, {
    x: framed ? 40 : 0,
    y: framed ? 40 : 0,
    w: framed ? W - 80 : W,
    h: framed ? H - 80 : H,
    radius: framed ? 44 : 0,
    unit: s,
    color: patternInk,
    seed: spec.storeName,
    accent: p.accent,
    onAccent: onBrand,
  })

  if (spec.template === 'minimal') {
    // A hairline frame — the "printed card" edge that keeps a white image
    // from dissolving into a white feed.
    ctx.strokeStyle = p.hairline
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(40, 40, W - 80, H - 80, 44)
    ctx.stroke()
  }

  let contentTop = f.safe.top
  if (spec.template === 'product') {
    const photoH = f.photo
    if (assets.product) {
      drawCover(ctx, assets.product, 0, 0, W, photoH)
    } else {
      // No photo chosen: a soft brand panel carrying the logo instead.
      ctx.fillStyle = withAlpha(p.accent, 0.1)
      ctx.fillRect(0, 0, W, photoH)
      const tile = Math.round(220 * s)
      drawLogoTile(ctx, spec, assets.logo, cx, (photoH - tile) / 2 + (spec.format === 'story' ? f.safe.top / 3 : 0), tile, true)
    }
    // Over crystal art the frosted panel needs clear space under the photo.
    contentTop = photoH + Math.round((isArtPattern(spec.pattern) ? 100 : 56) * s)
  }

  const rows: Row[] = []
  let qrIndex = 0

  if (spec.template !== 'product') {
    const tile = Math.round(128 * s)
    rows.push({
      height: tile,
      gap: 0,
      draw: (y) => drawLogoTile(ctx, spec, assets.logo, cx, y, tile, !onBrand),
    })
  } else {
    const eyebrow = fitText(ctx, spec.eyebrow.toUpperCase(), {
      weight: 800, family: SANS, sizes: [Math.round(26 * s)], maxWidth: textWidth, maxLines: 1, leading: 1.3,
    })
    rows.push({ height: blockHeight(eyebrow), gap: 0, draw: (y) => drawLines(ctx, eyebrow, cx, y, p.accentOnWhite, '0.2em') })
  }

  const nameSizes = (spec.template === 'product' ? [60, 52, 46, 40] : [74, 64, 56, 48]).map((n) => Math.round(n * s))
  const name = fitText(ctx, spec.storeName, {
    // A story has the height for a third line; a post would lose QR size.
    weight: 600, family: SERIF, sizes: nameSizes, maxWidth: textWidth, maxLines: spec.format === 'story' ? 3 : 2, leading: 1.12,
  })
  rows.push({
    height: blockHeight(name),
    gap: Math.round((spec.template === 'product' ? 14 : 36) * s),
    draw: (y) => drawLines(ctx, name, cx, y, titleColor),
  })

  if (spec.template !== 'product' && spec.tagline) {
    const tagline = fitText(ctx, spec.tagline, {
      weight: 500, family: SANS, sizes: [Math.round(32 * s), Math.round(28 * s)], maxWidth: textWidth * 0.9, maxLines: 2, leading: 1.35,
    })
    rows.push({ height: blockHeight(tagline), gap: Math.round(14 * s), draw: (y) => drawLines(ctx, tagline, cx, y, bodyColor) })
  }

  qrIndex = rows.length
  const logoForQr = qrCenterImage(spec, assets.logo)
  rows.push({
    height: 0,
    gap: Math.round(44 * s),
    draw: (y) => {
      const size = rows[qrIndex]!.height
      const x = cx - size / 2
      drawQr(ctx, assets.matrix, {
        x, y, size, style: spec.qrStyle, color: p.qr,
        logo: logoForQr ? { image: logoForQr } : null,
        radius: size * 0.06,
      })
      if (!onBrand) {
        ctx.save()
        ctx.strokeStyle = p.hairline
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(x, y, size, size, size * 0.06)
        ctx.stroke()
        ctx.restore()
      }
    },
  })

  const caption = fitText(ctx, spec.caption.toUpperCase(), {
    weight: 800, family: SANS, sizes: [Math.round(36 * s), Math.round(30 * s)], maxWidth: textWidth, maxLines: 1, leading: 1.25,
  })
  rows.push({ height: blockHeight(caption), gap: Math.round(36 * s), draw: (y) => drawLines(ctx, caption, cx, y, captionColor, '0.14em') })

  const url = fitText(ctx, spec.displayUrl, {
    weight: 500, family: SANS, sizes: [Math.round(28 * s), Math.round(24 * s), Math.round(21 * s)], maxWidth: textWidth, maxLines: 2, leading: 1.3,
  })
  rows.push({ height: blockHeight(url), gap: Math.round(12 * s), draw: (y) => drawLines(ctx, url, cx, y, bodyColor) })

  const qrRange =
    spec.template === 'product'
      ? { min: f.qr.min * 0.85, max: f.qr.productMax }
      : // On a Post with crystal art the code stops at 460px (43% of the card,
        // far above scannable) so the artwork shows round the frosted panel.
        isArtPattern(spec.pattern) && spec.format === 'post'
        ? { min: f.qr.min, max: 460 }
        : f.qr
  // Over crystal art the content sits on a frosted panel, so the text keeps
  // its contrast however bold the artwork behind it is.
  const art = isArtPattern(spec.pattern)
  // With art, the stack gets a slightly smaller box so the artwork shows
  // around the panel rather than as a sliver at the edge (the QR flexes down
  // a little, staying well above its scannable floor).
  const artInset = art && spec.template !== 'product' ? Math.round(56 * s) : 0
  const panel = art
    ? (top: number, height: number) => {
        const padX = Math.round(40 * s)
        const padY = Math.round(52 * s)
        drawFrostedPanel(
          ctx,
          {
            x: f.safe.side - padX,
            y: top - padY,
            w: W - (f.safe.side - padX) * 2,
            h: height + padY * 2,
            radius: Math.round(44 * s),
          },
          p.accent,
          onBrand,
        )
      }
    : undefined
  layoutStack(contentTop + artInset, H - f.safe.bottom - artInset, rows, qrIndex, qrRange, panel)
  ctx.restore()
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!m) return hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
