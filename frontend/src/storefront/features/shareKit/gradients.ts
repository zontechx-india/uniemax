import { rgba, rng } from './crystal'
import type { ArtBox } from './crystal'
import { shiftHue } from './palette'

/**
 * Gradient backgrounds — soft "mesh" colour fields for the share card: a
 * diagonal base gradient with large blurred colour pools laid over it and a
 * little white light, so it reads as a glowing poster rather than a flat
 * two-stop fade.
 *
 *  - **Blend** — the shop's own colour and its hue neighbours.
 *  - **Sunset / Ocean / Aurora / Rainbow** — fixed multicolour palettes, the
 *    same for every shop (the seller picks one for its look).
 *
 * Like the crystal and festive art these are SOLID, so the card puts its
 * content on the frosted panel and the QR keeps its own white plate. Pool
 * positions are seeded by the shop name: stable per shop.
 */

export type GradientArt = 'blend' | 'sunset' | 'ocean' | 'aurora' | 'rainbow'

const PALETTES: Record<Exclude<GradientArt, 'blend'>, string[]> = {
  sunset: ['#ffb347', '#ff6f61', '#e64980', '#8e3bd8'],
  ocean: ['#36d1dc', '#2f80ed', '#5b4ef0', '#1fc8a0'],
  aurora: ['#22d3a6', '#3b82f6', '#a855f7', '#f472b6'],
  rainbow: ['#ff6b9d', '#ffc35b', '#4ade80', '#38bdf8', '#a78bfa'],
}

function colorsFor(art: GradientArt, accent: string): string[] {
  if (art !== 'blend') return PALETTES[art]
  return [shiftHue(accent, -36), accent, shiftHue(accent, 40), shiftHue(accent, 90)]
}

export function drawGradientArt(ctx: CanvasRenderingContext2D, art: GradientArt, b: ArtBox): void {
  const { x, y, w, h } = b
  const colors = colorsFor(art, b.accent)
  const rand = rng(`${art}:${b.seed}`)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, b.radius)
  ctx.clip()

  // Base: a diagonal fade through every colour.
  const base = ctx.createLinearGradient(x, y, x + w, y + h)
  colors.forEach((c, i) => base.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = base
  ctx.fillRect(x, y, w, h)

  // Colour pools — big soft radial glows near the corners and edges, each in
  // one of the palette's colours, so the field has depth and movement.
  const spots: [number, number, number][] = [
    [0.08, 0.1, 0.75],
    [0.95, 0.22, 0.65],
    [0.12, 0.8, 0.7],
    [0.9, 0.92, 0.8],
    [0.5, 0.5, 0.55],
  ]
  const size = Math.max(w, h)
  spots.forEach(([sx, sy, sr], i) => {
    const cx = x + (sx + (rand() - 0.5) * 0.16) * w
    const cy = y + (sy + (rand() - 0.5) * 0.12) * h
    const r = sr * size * (0.85 + rand() * 0.3)
    const color = colors[(i + Math.floor(rand() * colors.length)) % colors.length]!
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, rgba(color, 0.85))
    g.addColorStop(0.5, rgba(color, 0.4))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  })

  // White light from the top-left, and a soft sheen across the lower right.
  const light = ctx.createRadialGradient(x + w * 0.2, y + h * 0.12, 0, x + w * 0.2, y + h * 0.12, size * 0.55)
  light.addColorStop(0, 'rgba(255,255,255,0.35)')
  light.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = light
  ctx.fillRect(x, y, w, h)

  ctx.save()
  ctx.translate(x + w * 0.7, y + h * 0.7)
  ctx.rotate(-Math.PI / 3.2)
  const band = w * 0.08
  const sheen = ctx.createLinearGradient(0, -band, 0, band)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.16)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(-size * 2, -band, size * 4, band * 2)
  ctx.restore()

  ctx.restore()
}
