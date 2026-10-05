/**
 * Background patterns for the share cards — drawn on the canvas by the same
 * renderer as everything else, so the preview, the Instagram images and the
 * picker's own swatches are all one function (`drawPattern`).
 *
 * Rules every pattern follows, so none can cost the card its job:
 *  - **One colour** — the card's own accent (on white cards) or the text
 *    colour (on the Brand card), never a new colour.
 *  - **Low contrast** — each pattern carries its own opacity, tuned so the
 *    shop name and caption stay readable on top of it.
 *  - **Never under the QR** — the code sits on its own opaque white plate
 *    (quiet zone included), so a pattern cannot reach a module.
 *  - Patterns that would sit behind text are fine-grained (dots, grid,
 *    waves); the bolder ones (Rings, Confetti) keep to the corners and edges.
 */

import { drawCrystalArt } from './crystal'
import type { CrystalArt } from './crystal'
import { drawFestiveArt } from './festive'
import type { FestiveArt } from './festive'

export type SharePattern =
  | 'none'
  | CrystalArt
  | FestiveArt
  | 'dots'
  | 'grid'
  | 'stripes'
  | 'waves'
  | 'rings'
  | 'confetti'

/**
 * Bold crystal artwork (`crystal.ts`) rather than a faint texture — the card
 * renderer puts its content on a frosted panel when one of these is chosen.
 */
export function isCrystalArt(pattern: SharePattern): pattern is CrystalArt {
  return pattern === 'liquid' || pattern === 'prism' || pattern === 'orbs'
}

export function isFestiveArt(pattern: SharePattern): pattern is FestiveArt {
  return pattern === 'lights' || pattern === 'pookalam'
}

/** Solid artwork (crystal or festive) — the content goes on a frosted panel. */
export function isArtPattern(pattern: SharePattern): pattern is CrystalArt | FestiveArt {
  return isCrystalArt(pattern) || isFestiveArt(pattern)
}

export const PATTERNS: { value: SharePattern; label: string }[] = [
  { value: 'none', label: 'Plain' },
  { value: 'liquid', label: 'Glass' },
  { value: 'prism', label: 'Prism' },
  { value: 'orbs', label: 'Orbs' },
  { value: 'lights', label: 'Lights' },
  { value: 'pookalam', label: 'Pookalam' },
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'waves', label: 'Waves' },
  { value: 'rings', label: 'Rings' },
  { value: 'confetti', label: 'Confetti' },
]

/** Opacity per pattern — denser patterns are fainter. */
const ALPHA: Record<Exclude<SharePattern, 'none' | CrystalArt | FestiveArt>, number> = {
  dots: 0.2,
  grid: 0.12,
  stripes: 0.08,
  waves: 0.16,
  rings: 0.16,
  confetti: 0.45,
}

export interface PatternBox {
  x: number
  y: number
  w: number
  h: number
  /** Corner radius of the clip (the Minimal card's frame). */
  radius?: number
  /** 1 on a 1080px-wide card; smaller for a swatch. */
  unit: number
  color: string
  /**
   * Opacity multiplier. 1 on the card; the picker's swatches pass more,
   * because opacity tuned to sit quietly behind text on a 1080px card all
   * but vanishes in a thumbnail.
   */
  emphasis?: number
  /** Seeds Confetti and the crystal art, so each shop gets its own (stable) layout. */
  seed: string
  /** The card's accent — what the crystal art is painted in. */
  accent: string
  /** True on the Brand card, whose background is the accent. */
  onAccent: boolean
}

/** Tiny deterministic PRNG (mulberry32) — same seed, same pattern, every time. */
function rng(seed: string): () => number {
  let a = 0
  for (const ch of seed) a = (Math.imul(a, 31) + ch.codePointAt(0)!) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function drawPattern(ctx: CanvasRenderingContext2D, pattern: SharePattern, box: PatternBox): void {
  if (pattern === 'none') return
  if (isCrystalArt(pattern)) {
    drawCrystalArt(ctx, pattern, { ...box, radius: box.radius ?? 0 })
    return
  }
  if (isFestiveArt(pattern)) {
    drawFestiveArt(ctx, pattern, { ...box, radius: box.radius ?? 0 })
    return
  }
  const { x, y, w, h, unit: u, color } = box
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, box.radius ?? 0)
  ctx.clip()
  ctx.globalAlpha = Math.min(1, ALPHA[pattern] * (box.emphasis ?? 1))
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (pattern) {
    case 'dots': {
      const gap = 40 * u
      const r = 4.5 * u
      ctx.beginPath()
      for (let row = 0, py = y + gap / 2; py < y + h + gap; row++, py += gap) {
        // Every other row shifted half a step: a woven look, not a spreadsheet.
        for (let px = x + (row % 2 ? gap : gap / 2); px < x + w + gap; px += gap) {
          ctx.moveTo(px + r, py)
          ctx.arc(px, py, r, 0, Math.PI * 2)
        }
      }
      ctx.fill()
      break
    }
    case 'grid': {
      const gap = 54 * u
      ctx.lineWidth = 2 * u
      ctx.beginPath()
      for (let px = x + gap / 2; px < x + w; px += gap) {
        ctx.moveTo(px, y)
        ctx.lineTo(px, y + h)
      }
      for (let py = y + gap / 2; py < y + h; py += gap) {
        ctx.moveTo(x, py)
        ctx.lineTo(x + w, py)
      }
      ctx.stroke()
      break
    }
    case 'stripes': {
      const gap = 44 * u
      ctx.lineWidth = 12 * u
      ctx.lineCap = 'butt'
      ctx.beginPath()
      for (let d = -h; d < w + h; d += gap) {
        ctx.moveTo(x + d, y + h)
        ctx.lineTo(x + d + h, y)
      }
      ctx.stroke()
      break
    }
    case 'waves': {
      const gap = 64 * u
      const amp = 12 * u
      const len = 180 * u
      ctx.lineWidth = 3 * u
      ctx.beginPath()
      for (let py = y + gap / 2; py < y + h + amp; py += gap) {
        ctx.moveTo(x, py)
        for (let px = 0; px <= w + 8 * u; px += 8 * u) {
          ctx.lineTo(x + px, py + Math.sin((px / len) * Math.PI * 2) * amp)
        }
      }
      ctx.stroke()
      break
    }
    case 'rings': {
      // Concentric arcs from two opposite corners — they frame the card and
      // stop well short of the centre, where the text and code are.
      const step = 42 * u
      const max = Math.min(w, h) * 0.56
      ctx.lineWidth = 3 * u
      for (const [cx, cy] of [
        [x + w, y],
        [x, y + h],
      ] as const) {
        ctx.beginPath()
        for (let r = step; r <= max; r += step) {
          ctx.moveTo(cx + r, cy)
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
        }
        ctx.stroke()
      }
      break
    }
    case 'confetti': {
      // Shapes scattered along the left and right edges and the top and
      // bottom bands only — the middle column stays clear for the content.
      const rand = rng(box.seed)
      const count = Math.round((w * h) / (1080 * 1350) * 34) + 6
      ctx.lineWidth = 5 * u
      for (let i = 0; i < count; i++) {
        let px: number
        let py: number
        if (i % 3 === 2) {
          px = x + rand() * w
          py = rand() < 0.5 ? y + rand() * h * 0.07 : y + h - rand() * h * 0.07
        } else {
          px = rand() < 0.5 ? x + w * (0.02 + rand() * 0.13) : x + w * (0.85 + rand() * 0.13)
          py = y + rand() * h
        }
        const size = (10 + rand() * 14) * u
        const kind = Math.floor(rand() * 4)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rand() * Math.PI)
        ctx.beginPath()
        if (kind === 0) {
          ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2)
          ctx.fill()
        } else if (kind === 1) {
          ctx.arc(0, 0, size, 0, Math.PI * 2)
          ctx.stroke()
        } else if (kind === 2) {
          ctx.moveTo(-size, 0)
          ctx.lineTo(size, 0)
          ctx.moveTo(0, -size)
          ctx.lineTo(0, size)
          ctx.stroke()
        } else {
          ctx.moveTo(0, -size)
          ctx.lineTo(size * 0.87, size * 0.5)
          ctx.lineTo(-size * 0.87, size * 0.5)
          ctx.closePath()
          ctx.stroke()
        }
        ctx.restore()
      }
      break
    }
  }
  ctx.restore()
}
