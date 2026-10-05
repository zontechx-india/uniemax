import { contrast, readableOn, safeHex, textOn } from '../publicStore/storeTheme'
import type { StoreThemeColors } from '../stores/storesApi'
import type { QrStyle } from './qr'

/**
 * Share-card colours lead with the store's OWN theme (primary, their second
 * colour if they set one), followed by a fixed set of preset colours and
 * plain black — never a free colour picker. Every colour that ends up behind
 * a QR module or under text is passed through a contrast check first, so no
 * choice can produce an unscannable code or unreadable caption.
 */

/** The preset colours offered after the shop's own. */
const PRESETS = [
  { key: 'rose', label: 'Rose', color: '#e11d48' },
  { key: 'pink', label: 'Pink', color: '#db2777' },
  { key: 'orange', label: 'Orange', color: '#ea580c' },
  { key: 'gold', label: 'Gold', color: '#ca8a04' },
  { key: 'green', label: 'Green', color: '#16a34a' },
  { key: 'teal', label: 'Teal', color: '#0d9488' },
  { key: 'blue', label: 'Blue', color: '#2563eb' },
  { key: 'violet', label: 'Violet', color: '#7c3aed' },
] as const

export type AccentKey = 'primary' | 'secondary' | 'ink' | (typeof PRESETS)[number]['key']

/** Every key a saved choice may hold (`shareKitPrefs.ts` validates against it). */
export const ACCENT_KEYS: readonly AccentKey[] = ['primary', 'secondary', 'ink', ...PRESETS.map((p) => p.key)]

const INK = '#111318'
const WHITE = '#ffffff'

export interface AccentOption {
  key: AccentKey
  label: string
  color: string
  /** False for the shop's own colours, true for the fixed presets and black. */
  preset: boolean
}

export function accentOptions(theme: StoreThemeColors): AccentOption[] {
  const primary = safeHex(theme.primaryColor, '#6c3ef4')
  const options: AccentOption[] = [{ key: 'primary', label: 'Shop colour', color: primary, preset: false }]
  const secondary = theme.secondaryColor ? safeHex(theme.secondaryColor, primary) : null
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) {
    options.push({ key: 'secondary', label: 'Second colour', color: secondary, preset: false })
  }
  const taken = new Set(options.map((o) => o.color.toLowerCase()))
  for (const p of PRESETS) {
    if (!taken.has(p.color)) options.push({ ...p, preset: true })
  }
  options.push({ key: 'ink', label: 'Black', color: INK, preset: true })
  return options
}

export interface CardPalette {
  /** The chosen colour as the seller set it — the Brand template's background. */
  accent: string
  /** Text/eyebrow in the accent, nudged to ≥ 4.5:1 on white. */
  accentOnWhite: string
  /** Text drawn ON the accent (white or near-black, whichever reads). */
  onAccent: string
  /**
   * The Gradient template's background: the accent flanked by its hue
   * neighbours, each held to the accent's own contrast with `onAccent` so the
   * text reads as well across the whole card as it does on Brand.
   */
  gradient: string[]
  ink: string
  muted: string
  hairline: string
  /** QR module colour on its white plate. */
  qr: string
}

/**
 * The QR needs more than text contrast: phone cameras in poor light lose
 * mid-tones first, so coloured modules are held to 7:1 against the white
 * plate (black on white is 21:1). A pale brand colour is darkened until it
 * passes — the code stays recognisably theirs and always scans.
 */
const QR_MIN_CONTRAST = 7

export function cardPalette(accent: string, qrStyle: QrStyle): CardPalette {
  const onAccent = textOn(accent)
  const ratio = Math.min(4.5, contrast(accent, onAccent))
  return {
    accent,
    accentOnWhite: readableOn(accent, WHITE, 4.5),
    onAccent,
    gradient: [shiftHue(accent, -28), accent, shiftHue(accent, 42)].map((c) => readableOn(c, onAccent, ratio)),
    ink: INK,
    muted: '#5d6170',
    hairline: '#e6e7ec',
    qr: qrStyle === 'classic' ? INK : readableOn(accent, WHITE, QR_MIN_CONTRAST),
  }
}

/**
 * `hex` with its hue turned by `degrees` (HSL), saturation and lightness
 * kept. A grey (black, white) has no hue, so it gains a little saturation
 * first — otherwise a black Gradient card would be flat black.
 */
export function shiftHue(hex: string, degrees: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!m) return hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 250
  let s = 0.35
  if (d > 0.02) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  }
  // Very dark / very light colours carry no visible hue; lift them a touch.
  const light = Math.min(0.9, Math.max(0.16, l))
  h = (((h + degrees) % 360) + 360) % 360
  const c = (1 - Math.abs(2 * light - 1)) * Math.min(1, s)
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const off = light - c / 2
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return `#${[r1, g1, b1].map((v) => Math.round((v + off) * 255).toString(16).padStart(2, '0')).join('')}`
}
