/**
 * The "crystal" backgrounds — bold abstract artwork that reads as crystal: every
 * shape has a gradient body (light falling across it), a bright rim on the
 * edge that faces the light, and a specular streak; long reflection sweeps
 * run across the whole card on top.
 *
 * These are artwork for the seller's Instagram image, not app UI — the
 * no-gradients rule in docs/DESIGN_GUIDELINES.md governs the dashboard, and
 * the dashboard itself stays flat. Because they are SOLID, the card renderer
 * puts its content on a frosted panel whenever one is chosen (see
 * `drawFrostedPanel`), and the QR keeps its own opaque white plate.
 *
 * Colours are the card's accent only — tints and shades of it, plus white
 * light. Layouts are seeded by the shop name: every shop gets its own
 * composition, and the same one every time.
 */

export type CrystalArt = 'liquid' | 'prism' | 'orbs'

export interface ArtBox {
  x: number
  y: number
  w: number
  h: number
  radius: number
  /** The card's accent colour. */
  accent: string
  /** True on the Brand card (the background IS the accent). */
  onAccent: boolean
  seed: string
}

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const m = hex.match(/^#([0-9a-f]{6})$/i)?.[1] ?? '808080'
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as Rgb
}

function mix(hex: string, target: Rgb, t: number): string {
  const [r, g, b] = rgb(hex)
  const c = (a: number, z: number) => Math.round(a + (z - a) * t)
  return `#${[c(r, target[0]), c(g, target[1]), c(b, target[2])].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function rng(seed: string): () => number {
  let a = 0x9e3779b9
  for (const ch of seed) a = (Math.imul(a ^ ch.codePointAt(0)!, 0x85ebca6b) + 0x2545f491) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The four tones a composition is painted in, plus its base. */
function tones(accent: string, onAccent: boolean) {
  return onAccent
    ? {
        base: accent,
        deep: mix(accent, BLACK, 0.38),
        mid: mix(accent, BLACK, 0.16),
        light: mix(accent, WHITE, 0.32),
        pale: mix(accent, WHITE, 0.6),
      }
    : {
        base: mix(accent, WHITE, 0.9),
        deep: mix(accent, BLACK, 0.12),
        mid: accent,
        light: mix(accent, WHITE, 0.45),
        pale: mix(accent, WHITE, 0.75),
      }
}

/** Bounding box of a polygon / sample points — for the gradients. */
function bounds(points: [number, number][]) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * One crystal shape: gradient body, specular streak (clipped to the shape) and
 * a rim lit from the top-left.
 */
function glassShape(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: { x0: number; y0: number; x1: number; y1: number },
  light: string,
  dark: string,
  rim: number,
) {
  const { x0, y0, x1, y1 } = box
  const size = Math.max(x1 - x0, y1 - y0)

  const body = ctx.createLinearGradient(x0, y0, x1, y1)
  body.addColorStop(0, rgba(light, 0.95))
  body.addColorStop(1, rgba(dark, 0.82))
  ctx.fillStyle = body
  ctx.fill(path)

  // Specular streak: a soft white band across the shape, clipped to it.
  ctx.save()
  ctx.clip(path)
  const cx = x0 + (x1 - x0) * 0.38
  const cy = y0 + (y1 - y0) * 0.38
  ctx.translate(cx, cy)
  ctx.rotate(-Math.PI / 4)
  const band = size * 0.16
  const streak = ctx.createLinearGradient(0, -band, 0, band)
  streak.addColorStop(0, 'rgba(255,255,255,0)')
  streak.addColorStop(0.5, 'rgba(255,255,255,0.42)')
  streak.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = streak
  ctx.fillRect(-size * 2, -band, size * 4, band * 2)
  // A thinner second glint just below.
  const glint = ctx.createLinearGradient(0, band * 1.4, 0, band * 1.9)
  glint.addColorStop(0, 'rgba(255,255,255,0)')
  glint.addColorStop(0.5, 'rgba(255,255,255,0.3)')
  glint.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glint
  ctx.fillRect(-size * 2, band * 1.4, size * 4, band * 0.5)
  ctx.restore()

  // Rim: bright where the light hits (top-left), fading, a second catch-light
  // on the far edge.
  const edge = ctx.createLinearGradient(x0, y0, x1, y1)
  edge.addColorStop(0, 'rgba(255,255,255,0.95)')
  edge.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  edge.addColorStop(1, 'rgba(255,255,255,0.45)')
  ctx.strokeStyle = edge
  ctx.lineWidth = rim
  ctx.stroke(path)
}

/** Long diagonal light sweeps across the whole card — the "reflection". */
function reflections(ctx: CanvasRenderingContext2D, b: ArtBox, strength: number) {
  const { x, y, w, h } = b
  const diag = Math.hypot(w, h)
  for (const [at, width, alpha] of [
    [0.32, 0.11, 0.2],
    [0.42, 0.035, 0.26],
    [0.74, 0.07, 0.14],
  ] as const) {
    ctx.save()
    ctx.translate(x + w * at, y + h * (1 - at))
    ctx.rotate(-Math.PI / 3.2)
    const half = (w * width) / 2
    const g = ctx.createLinearGradient(0, -half, 0, half)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(255,255,255,${alpha * strength})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-diag, -half, diag * 2, half * 2)
    ctx.restore()
  }
}

/** A smooth closed blob through `n` jittered points around a centre. */
function blob(cx: number, cy: number, r: number, rand: () => number, n = 7) {
  const pts: [number, number][] = []
  const turn = rand() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2
    const rr = r * (0.78 + rand() * 0.36)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  const path = new Path2D()
  const mid = (i: number) => {
    const p = pts[i % n]!
    const q = pts[(i + 1) % n]!
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const
  }
  const start = mid(0)
  path.moveTo(start[0], start[1])
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]!
    const m = mid(i)
    path.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  path.closePath()
  return { path, box: bounds(pts) }
}

export function drawCrystalArt(ctx: CanvasRenderingContext2D, art: CrystalArt, b: ArtBox): void {
  const { x, y, w, h } = b
  const t = tones(b.accent, b.onAccent)
  const rand = rng(`${art}:${b.seed}`)
  const j = (v: number, amount: number) => v + (rand() - 0.5) * amount
  const rim = Math.max(1.5, w * 0.0035)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, b.radius)
  ctx.clip()
  ctx.fillStyle = t.base
  ctx.fillRect(x, y, w, h)
  ctx.lineJoin = 'round'

  const pairs: [string, string][] = [
    [t.light, t.deep],
    [t.pale, t.mid],
    [t.light, t.mid],
    [t.pale, t.deep],
  ]

  if (art === 'liquid') {
    // Big liquid shapes off the corners, smaller ones on the edges.
    const spots: [number, number, number][] = [
      [0.92, 0.08, 0.5],
      [0.06, 0.94, 0.52],
      [0.98, 0.72, 0.26],
      [0.02, 0.32, 0.22],
      [0.7, 0.98, 0.18],
      [0.32, 0.02, 0.16],
    ]
    spots.forEach(([sx, sy, sr], i) => {
      const s = blob(x + j(sx, 0.08) * w, y + j(sy, 0.06) * h, sr * w, rand)
      const [light, dark] = pairs[i % pairs.length]!
      glassShape(ctx, s.path, s.box, light, dark, rim)
    })
  } else if (art === 'prism') {
    // Cut-crystal shards pointing in from the edges.
    const shards: [number, number][][] = [
      [[0, 0], [0.72, 0], [0, 0.4]],
      [[0.28, 0], [0.8, 0], [0.55, 0.28]],
      [[1, 0], [1, 0.52], [0.58, 0]],
      [[1, 0.36], [1, 1], [0.68, 0.76]],
      [[0, 0.58], [0, 1], [0.6, 1]],
      [[0.18, 1], [0.8, 1], [0.48, 0.74]],
      [[0, 0.22], [0.3, 0.52], [0, 0.78]],
      [[1, 0.6], [0.82, 0.48], [1, 0.2]],
    ]
    shards.forEach((shard, i) => {
      const pts = shard.map(([px, py]) => [
        x + Math.min(1.02, Math.max(-0.02, j(px, 0.08))) * w,
        y + Math.min(1.02, Math.max(-0.02, j(py, 0.06))) * h,
      ]) as [number, number][]
      const path = new Path2D()
      path.moveTo(pts[0]![0], pts[0]![1])
      for (const p of pts.slice(1)) path.lineTo(p[0], p[1])
      path.closePath()
      const [light, dark] = pairs[i % pairs.length]!
      glassShape(ctx, path, bounds(pts), light, dark, rim)
    })
  } else {
    // Glossy spheres: a lit body, a hot highlight, and reflected light at
    // the bottom rim.
    const orbs: [number, number, number][] = [
      [0.14, 0.1, 0.22],
      [0.88, 0.16, 0.3],
      [0.94, 0.62, 0.14],
      [0.06, 0.55, 0.13],
      [0.18, 0.92, 0.26],
      [0.8, 0.94, 0.21],
      [0.52, 0.03, 0.09],
      [0.56, 0.98, 0.08],
    ]
    orbs.forEach(([sx, sy, sr], i) => {
      const r = sr * w * (0.85 + rand() * 0.3)
      const cx = x + j(sx, 0.06) * w
      const cy = y + j(sy, 0.05) * h
      const [light, dark] = pairs[i % pairs.length]!
      const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05)
      body.addColorStop(0, 'rgba(255,255,255,0.95)')
      body.addColorStop(0.22, rgba(light, 0.95))
      body.addColorStop(0.72, rgba(dark, 0.88))
      body.addColorStop(1, rgba(dark, 0.95))
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      // Reflected light along the lower rim.
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = rim * 1.4
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.84, Math.PI * 0.15, Math.PI * 0.62)
      ctx.stroke()
      // Thin rim.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = rim
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    })
  }

  reflections(ctx, b, b.onAccent ? 1 : 1.3)
  ctx.restore()
}

/**
 * The frosted panel the content sits on over crystal art: translucent fill,
 * a soft drop shadow for depth, and a rim lit from the top-left — so text
 * keeps its contrast however bold the artwork behind it is.
 */
export function drawFrostedPanel(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number; radius: number },
  accent: string,
  onAccent: boolean,
): void {
  const { x, y, w, h, radius } = rect
  ctx.save()
  ctx.shadowColor = onAccent ? 'rgba(0,0,0,0.28)' : rgba(mix(accent, BLACK, 0.4), 0.22)
  ctx.shadowBlur = w * 0.06
  ctx.shadowOffsetY = w * 0.02
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.fillStyle = onAccent ? rgba(accent, 0.8) : 'rgba(255,255,255,0.84)'
  ctx.fill()
  ctx.restore()

  ctx.save()
  // A faint top sheen inside the panel.
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()
  const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.35)
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(x, y, w, h * 0.35)
  ctx.restore()

  ctx.save()
  const edge = ctx.createLinearGradient(x, y, x + w, y + h)
  edge.addColorStop(0, 'rgba(255,255,255,0.95)')
  edge.addColorStop(0.5, 'rgba(255,255,255,0.25)')
  edge.addColorStop(1, 'rgba(255,255,255,0.6)')
  ctx.strokeStyle = edge
  ctx.lineWidth = Math.max(1.5, w * 0.003)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.stroke()
  ctx.restore()
}
