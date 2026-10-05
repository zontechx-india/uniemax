import qrcode from 'qrcode-generator'

/**
 * The store QR code, as GEOMETRY rather than pixels: `qrShapes()` turns the
 * encoded matrix into a list of shapes in module units, and the canvas
 * (`drawQr`) and SVG (`qrSvg`) renderers both draw that one list — so the
 * live preview, the Instagram images and the downloaded QR can never disagree
 * about what was encoded or how it looks.
 *
 * Scannability rules, all enforced here rather than left to callers:
 *  - Error correction is always **H** (≈30% recoverable), which is what pays
 *    for the logo in the middle.
 *  - The logo knockout is a centred square of about a fifth of the side —
 *    roughly 5% of the area, far inside what H recovers — and never touches
 *    the three finder patterns or the timing lines.
 *  - The quiet zone (`QUIET_ZONE` modules of plain white) is part of every
 *    rendering; it is not optional styling.
 *  - Modules are always dark-on-white. Colour is a caller's choice, but
 *    `shareKit/palette.ts` only ever hands in a colour that passes contrast.
 */

export type QrStyle = 'classic' | 'brand' | 'rounded'

/** Plain white border, in modules, around every rendering (spec minimum is 4). */
export const QUIET_ZONE = 4

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  size: number
  isDark: (row: number, col: number) => boolean
}

export function encodeQr(text: string): QrMatrix {
  const qr = qrcode(0, 'H')
  qr.addData(text, 'Byte')
  qr.make()
  return { size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) }
}

/** The centred logo square, in modules — odd, so it sits exactly in the middle. */
export function logoBox(size: number): { start: number; span: number } {
  let span = Math.round(size * 0.22)
  if (span % 2 === 0) span += 1
  return { start: (size - span) / 2, span }
}

/** Corner radii, clockwise from top-left. */
type Radii = number | [number, number, number, number]

export type QrShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: Radii }
  /** A square frame (finder-pattern ring): outer square minus inner square. */
  | { kind: 'ring'; x: number; y: number; size: number; inset: number; r: number; innerR: number }

const FINDER_ORIGINS = (size: number) => [
  [0, 0],
  [0, size - 7],
  [size - 7, 0],
] as const

function inFinder(size: number, row: number, col: number): boolean {
  return FINDER_ORIGINS(size).some(
    ([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7,
  )
}

/**
 * Every dark area of the code, in module units with (0,0) at the top-left
 * module (the quiet zone is the renderer's job). `withLogo` clears the centre.
 */
export function qrShapes(matrix: QrMatrix, style: QrStyle, withLogo: boolean): QrShape[] {
  const { size } = matrix
  const shapes: QrShape[] = []
  const rounded = style === 'rounded'

  // Finder patterns: drawn as whole shapes so the rounded style can round them
  // as eyes instead of 49 separate dots (scanners key on their 1:1:3:1:1 ratio,
  // which a ring + centre keeps exactly).
  for (const [row, col] of FINDER_ORIGINS(size)) {
    shapes.push({
      kind: 'ring',
      x: col,
      y: row,
      size: 7,
      inset: 1,
      r: rounded ? 2.2 : 0,
      innerR: rounded ? 1.4 : 0,
    })
    shapes.push({ kind: 'rect', x: col + 2, y: row + 2, w: 3, h: 3, r: rounded ? 1 : 0 })
  }

  const box = withLogo ? logoBox(size) : null
  // One module of clearance around the logo plate, so no module is half-hidden.
  const cleared = (row: number, col: number) =>
    box !== null &&
    row >= box.start - 1 &&
    row < box.start + box.span + 1 &&
    col >= box.start - 1 &&
    col < box.start + box.span + 1

  const data = (row: number, col: number) =>
    row >= 0 &&
    col >= 0 &&
    row < size &&
    col < size &&
    matrix.isDark(row, col) &&
    !inFinder(size, row, col) &&
    !cleared(row, col)

  for (let row = 0; row < size; row++) {
    if (rounded) {
      for (let col = 0; col < size; col++) {
        if (!data(row, col)) continue
        // Full-size modules that round only their OUTER corners — a corner
        // with no dark neighbour on either side. Neighbours stay joined, so
        // the dark runs decoders measure are unbroken (separate inset dots
        // left white gaps that failed decoding at full resolution), while a
        // lone module still reads as a dot.
        const up = data(row - 1, col)
        const down = data(row + 1, col)
        const left = data(row, col - 1)
        const right = data(row, col + 1)
        const R = 0.5
        shapes.push({
          kind: 'rect',
          x: col,
          y: row,
          w: 1,
          h: 1,
          r: [
            !up && !left ? R : 0,
            !up && !right ? R : 0,
            !down && !right ? R : 0,
            !down && !left ? R : 0,
          ],
        })
      }
      continue
    }
    // Square styles: merge each horizontal run into one rectangle — fewer
    // shapes, and no hairline seams between neighbours when anti-aliased.
    let runStart = -1
    for (let col = 0; col <= size; col++) {
      const dark =
        col < size &&
        matrix.isDark(row, col) &&
        !inFinder(size, row, col) &&
        !cleared(row, col)
      if (dark && runStart < 0) runStart = col
      if (!dark && runStart >= 0) {
        shapes.push({ kind: 'rect', x: runStart, y: row, w: col - runStart, h: 1, r: 0 })
        runStart = -1
      }
    }
  }
  return shapes
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const scaleRadii = (r: Radii, k: number): Radii =>
  typeof r === 'number' ? r * k : [r[0] * k, r[1] * k, r[2] * k, r[3] * k]

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: Radii,
) {
  const cap = Math.min(w / 2, h / 2)
  if (typeof r === 'number') {
    if (r <= 0) ctx.rect(x, y, w, h)
    else ctx.roundRect(x, y, w, h, Math.min(r, cap))
    return
  }
  if (r.every((v) => v <= 0)) ctx.rect(x, y, w, h)
  else ctx.roundRect(x, y, w, h, r.map((v) => Math.min(v, cap)))
}

export interface QrLogo {
  /** Already-loaded image; drawn `contain` inside a white rounded plate. */
  image: CanvasImageSource & { width: number; height: number }
}

/**
 * Draw the code with its quiet zone on a white square at (`x`, `y`), `size`
 * px wide. The module size is snapped to whole pixels (the leftover is added
 * to the quiet zone), so module edges land on pixel boundaries and stay crisp
 * in the PNG — the property that survives Instagram's recompression best.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  matrix: QrMatrix,
  opts: {
    x: number
    y: number
    size: number
    style: QrStyle
    color: string
    logo: QrLogo | null
    /** Corner radius of the white square, px. */
    radius?: number
  },
): void {
  const { size: n } = matrix
  const total = n + QUIET_ZONE * 2
  const cell = Math.max(1, Math.floor(opts.size / total))
  const codePx = cell * n
  const ox = Math.round(opts.x + (opts.size - codePx) / 2)
  const oy = Math.round(opts.y + (opts.size - codePx) / 2)

  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  roundRectPath(ctx, opts.x, opts.y, opts.size, opts.size, opts.radius ?? 0)
  ctx.fill()

  ctx.fillStyle = opts.color
  for (const shape of qrShapes(matrix, opts.style, opts.logo !== null)) {
    ctx.beginPath()
    if (shape.kind === 'rect') {
      roundRectPath(
        ctx,
        ox + shape.x * cell,
        oy + shape.y * cell,
        shape.w * cell,
        shape.h * cell,
        scaleRadii(shape.r, cell),
      )
      ctx.fill()
    } else {
      const s = shape.size * cell
      const inner = (shape.size - shape.inset * 2) * cell
      roundRectPath(ctx, ox + shape.x * cell, oy + shape.y * cell, s, s, shape.r * cell)
      roundRectPath(
        ctx,
        ox + (shape.x + shape.inset) * cell,
        oy + (shape.y + shape.inset) * cell,
        inner,
        inner,
        shape.innerR * cell,
      )
      ctx.fill('evenodd')
    }
  }

  if (opts.logo) {
    const box = logoBox(n)
    const plate = box.span * cell
    const px = ox + box.start * cell
    const py = oy + box.start * cell
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    roundRectPath(ctx, px, py, plate, plate, plate * 0.22)
    ctx.fill()
    const pad = plate * 0.1
    drawContained(ctx, opts.logo.image, px + pad, py + pad, plate - pad * 2, plate - pad * 2, plate * 0.16)
  }
  ctx.restore()
}

/** `object-fit: contain` for canvas, clipped to a rounded box. */
export function drawContained(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
) {
  const scale = Math.min(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.save()
  ctx.beginPath()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

const n2 = (v: number) => Number(v.toFixed(3))

/** A rectangle path, clockwise, with each corner rounded by its own radius. */
function svgRoundRect(x: number, y: number, w: number, h: number, r: Radii): string {
  const cap = Math.min(w / 2, h / 2)
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) =>
    Math.max(0, Math.min(v, cap)),
  ) as [number, number, number, number]
  const arc = (rad: number, dx: number, dy: number) =>
    rad > 0 ? `a${n2(rad)} ${n2(rad)} 0 0 1 ${n2(dx)} ${n2(dy)}` : ''
  return (
    `M${n2(x + tl)} ${n2(y)}h${n2(w - tl - tr)}${arc(tr, tr, tr)}` +
    `v${n2(h - tr - br)}${arc(br, -br, br)}` +
    `h${n2(-(w - br - bl))}${arc(bl, -bl, -bl)}` +
    `v${n2(-(h - bl - tl))}${arc(tl, tl, -tl)}Z`
  )
}

/**
 * A standalone, scalable SVG of the code (quiet zone included). `logoDataUrl`
 * must be a `data:` URL so the file is self-contained once downloaded.
 */
export function qrSvg(
  matrix: QrMatrix,
  style: QrStyle,
  color: string,
  logoDataUrl: string | null,
): string {
  const { size: n } = matrix
  const total = n + QUIET_ZONE * 2
  const q = QUIET_ZONE
  let d = ''
  for (const shape of qrShapes(matrix, style, logoDataUrl !== null)) {
    if (shape.kind === 'rect') {
      d += svgRoundRect(q + shape.x, q + shape.y, shape.w, shape.h, shape.r)
    } else {
      d += svgRoundRect(q + shape.x, q + shape.y, shape.size, shape.size, shape.r)
      const inner = shape.size - shape.inset * 2
      d += svgRoundRect(q + shape.x + shape.inset, q + shape.y + shape.inset, inner, inner, shape.innerR)
    }
  }
  const crisp = style === 'rounded' ? '' : ' shape-rendering="crispEdges"'
  let logo = ''
  if (logoDataUrl) {
    const box = logoBox(n)
    const x = q + box.start
    const pad = box.span * 0.1
    logo =
      `<path fill="#ffffff" d="${svgRoundRect(x, x, box.span, box.span, box.span * 0.22)}"/>` +
      `<image href="${logoDataUrl}" x="${n2(x + pad)}" y="${n2(x + pad)}" width="${n2(box.span - pad * 2)}" height="${n2(box.span - pad * 2)}" preserveAspectRatio="xMidYMid meet"/>`
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="1024" height="1024">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path fill="${color}" fill-rule="evenodd"${crisp} d="${d}"/>` +
    logo +
    `</svg>`
  )
}
