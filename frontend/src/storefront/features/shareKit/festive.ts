import { rgba, rng, tones } from './crystal'
import type { ArtBox } from './crystal'

/**
 * Festive backgrounds — artwork for the seasons Indian shops sell hardest in,
 * drawn like the crystal art: in tints and shades of the shop's own colour
 * plus white light, seeded by the shop name, with the content on the frosted
 * panel (`drawFrostedPanel`) and the QR on its white plate.
 *
 *  - **Lights** — a Diwali-style night of glowing bokeh, two strings of fairy
 *    lights and sparkles. Works for any celebration or sale season.
 *  - **Pookalam** — Onam's flower carpet: concentric rings of petals from two
 *    corners. Reads as rangoli / kolam elsewhere.
 *
 * Deliberately no words in the artwork ("Happy Diwali", "SALE"): the shop
 * decides what it is celebrating or offering, in its caption.
 */

export type FestiveArt = 'lights' | 'pookalam'

/** A soft glowing disc — the building block of bokeh and bulbs. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.45, rgba(color, alpha * 0.55))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** A four-point sparkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
}

/** A string of fairy lights hanging between two points. */
function lightString(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  sag: number,
  bulbs: number,
  bulbR: number,
  wire: string,
  colors: string[],
) {
  const [x0, y0] = from
  const [x1, y1] = to
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2 + sag
  ctx.strokeStyle = wire
  ctx.lineWidth = Math.max(1.5, bulbR * 0.18)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.quadraticCurveTo(cx, cy, x1, y1)
  ctx.stroke()
  for (let i = 1; i < bulbs; i++) {
    const t = i / bulbs
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1
    const c = colors[i % colors.length]!
    glow(ctx, x, y + bulbR, bulbR * 3.2, c, 0.55)
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.ellipse(x, y + bulbR, bulbR * 0.62, bulbR, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.beginPath()
    ctx.arc(x - bulbR * 0.18, y + bulbR * 0.6, bulbR * 0.22, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** One petal: a teardrop from the centre outwards, pointing along `angle`. */
function petal(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number, angle: number, width: number) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const px = (r: number, side: number) => cx + cos * r - sin * side
  const py = (r: number, side: number) => cy + sin * r + cos * side
  const mid = inner + (outer - inner) * 0.55
  ctx.beginPath()
  ctx.moveTo(px(inner, 0), py(inner, 0))
  ctx.quadraticCurveTo(px(mid, width), py(mid, width), px(outer, 0), py(outer, 0))
  ctx.quadraticCurveTo(px(mid, -width), py(mid, -width), px(inner, 0), py(inner, 0))
  ctx.fill()
}

/** A pookalam: rings of petals around a centre, alternating the shop's tones. */
function pookalam(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  colors: string[],
  turn: number,
  /** Small flowers get fewer, bigger petals — dense rings at that size read as gears. */
  small = false,
) {
  const rings = small ? 2 : 5
  for (let k = rings; k >= 1; k--) {
    const outer = (radius * k) / rings
    const inner = outer - radius / rings
    const count = small ? 6 + k * 3 : 8 + k * 6
    const width = ((Math.PI * 2 * outer) / count) * 0.42
    // A full disc behind each ring keeps the gaps between petals coloured.
    ctx.fillStyle = colors[(k + 1) % colors.length]!
    ctx.beginPath()
    ctx.arc(cx, cy, outer * 0.97, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors[k % colors.length]!
    for (let i = 0; i < count; i++) {
      petal(ctx, cx, cy, inner * 0.92, outer, turn + (i / count) * Math.PI * 2 + (k % 2) * (Math.PI / count), width)
    }
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, radius / rings / 2.2, 0, Math.PI * 2)
  ctx.fill()
  // A thin white outline round the whole flower.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = Math.max(2, radius * 0.012)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
}

export function drawFestiveArt(ctx: CanvasRenderingContext2D, art: FestiveArt, b: ArtBox): void {
  const { x, y, w, h } = b
  const t = tones(b.accent, b.onAccent)
  const rand = rng(`${art}:${b.seed}`)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, b.radius)
  ctx.clip()

  if (art === 'lights') {
    // Night-time: the deepest tone on any card, so the lights can glow.
    ctx.fillStyle = b.onAccent ? t.deep : t.mid
    ctx.fillRect(x, y, w, h)
    // Bokeh — out-of-focus lights, bigger and softer towards the edges.
    for (let i = 0; i < 46; i++) {
      const bx = x + rand() * w
      const by = y + rand() * h
      const r = w * (0.02 + rand() * 0.07)
      glow(ctx, bx, by, r, rand() < 0.5 ? '#ffffff' : t.pale, 0.12 + rand() * 0.2)
    }
    // Two strings of fairy lights, top and bottom.
    const bulbR = w * 0.016
    const colors = ['#ffffff', t.pale, t.light]
    lightString(ctx, [x - w * 0.05, y + h * 0.04], [x + w * 1.05, y + h * 0.06], h * 0.07, 13, bulbR, 'rgba(255,255,255,0.45)', colors)
    lightString(ctx, [x - w * 0.05, y + h * 0.95], [x + w * 1.05, y + h * 0.93], h * 0.05, 13, bulbR, 'rgba(255,255,255,0.45)', colors)
    // Sparkles.
    for (let i = 0; i < 18; i++) {
      sparkle(ctx, x + rand() * w, y + rand() * h, w * (0.008 + rand() * 0.018), 0.55 + rand() * 0.4)
    }
  } else {
    ctx.fillStyle = t.base
    ctx.fillRect(x, y, w, h)
    const colors = b.onAccent
      ? [t.pale, t.deep, '#ffffff', t.light, t.mid]
      : [t.mid, t.pale, t.deep, '#ffffff', t.light]
    const big = Math.max(w, h) * 0.34
    pookalam(ctx, x + w * 0.98, y + h * 0.02, big, colors, rand() * Math.PI)
    pookalam(ctx, x + w * 0.02, y + h * 0.98, big, colors, rand() * Math.PI)
    // Small flowers scattered along the edges.
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0
      const fx = x + w * (side ? 0.04 + rand() * 0.1 : 0.86 + rand() * 0.1)
      const fy = y + h * (side ? 0.12 + rand() * 0.35 : 0.5 + rand() * 0.35)
      pookalam(ctx, fx, fy, w * (0.035 + rand() * 0.03), colors, rand() * Math.PI, true)
    }
  }
  ctx.restore()
}
