/**
 * Per-store theming for the public storefront.
 *
 * The owner's Appearance settings (background + primary, plus optional
 * secondary and surface colors — null means Auto) drive the page
 * palette: we map them onto the design-system CSS variables (`--bg`,
 * `--surface`, `--fg`, `--brand`, …) on the page root via `storeVars()`, so the
 * SAME semantic utilities used everywhere else (`bg-bg`, `text-fg`,
 * `bg-brand`, `border-line`) resolve to the store's colors. Spacing,
 * typography and radius stay global from the skill — only color is
 * owner-configurable. Neutrals are derived from the background's luminance so
 * light and dark store backgrounds both stay legible.
 *
 * Everything is FLAT (docs/DESIGN_GUIDELINES.md §6): the owner's primary
 * fills the primary button (`--cta`, hover `--cta-pressed`, pressed `--cta-lo`)
 * and tints brand text; there are no gradients or glows. (The old metallic
 * button and card-glow treatment was removed in October 2026.)
 */

type Rgb = [number, number, number]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function hexToRgb(hex: string): Rgb {
  const match = hex.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!match) return [128, 128, 128]
  return [
    parseInt(match.slice(0, 2), 16),
    parseInt(match.slice(2, 4), 16),
    parseInt(match.slice(4, 6), 16),
  ]
}

function toHex([r, g, b]: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Blend a color toward a target by `amount` (0 = unchanged, 1 = target). */
function mix(hex: string, target: Rgb, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const t = clamp01(amount)
  return toHex([
    r + (target[0] - r) * t,
    g + (target[1] - g) * t,
    b + (target[2] - b) * t,
  ])
}

const lighten = (hex: string, amount: number) => mix(hex, [255, 255, 255], amount)
const darken = (hex: string, amount: number) => mix(hex, [0, 0, 0], amount)

/** `rgba()` string from a hex color — used for glows tinted by the brand. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** WCAG relative luminance (0 black … 1 white). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG contrast ratio between two colours (1 … 21). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Black-ish or white text — whichever reads better on `bg` (WCAG). */
function textOn(bg: string): string {
  return contrast('#ffffff', bg) >= contrast('#101010', bg) ? '#ffffff' : '#101010'
}

/**
 * The owner's colour, nudged just far enough to be READABLE as text on
 * `against` (≥ 4.5:1, docs/DESIGN_GUIDELINES.md §12): darker on a light
 * surface, lighter on a dark one. A colour that already passes is returned
 * unchanged, so most shops see their exact brand.
 */
function readableOn(color: string, against: string, ratio = 4.5): string {
  const towardDark = !isDarkColor(against)
  let out = color
  for (let step = 1; step <= 20 && contrast(out, against) < ratio; step++) {
    out = towardDark ? darken(color, step * 0.05) : lighten(color, step * 0.05)
  }
  return out
}

/** Perceived-luminance check so text/surfaces stay readable on any theme. */
function isDarkColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

const HEX6 = /^#[0-9a-fA-F]{6}$/

/**
 * Every derived shade is *computed* from these two colors, so a malformed
 * value would render as flat mid-grey rather than being harmlessly ignored by
 * CSS. The API validates hex on write, so this only guards legacy/hand-edited
 * rows — mirrors DEFAULT_THEME in `stores/storesApi.ts`.
 */
const FALLBACK_BG = '#f9fafb'
const FALLBACK_PRIMARY = '#6c3ef4'

const safeHex = (hex: string, fallback: string) =>
  HEX6.test(hex) ? hex : fallback

/** The Appearance settings `storeVars` consumes (matches `StoreTheme`). */
export interface StoreThemeVars {
  backgroundColor: string
  primaryColor: string
  /** Links, prices & flat highlights. null/absent = Auto (follows primary). */
  secondaryColor?: string | null
  /** Cards & panels. null/absent = Auto (derived from the background). */
  surfaceColor?: string | null
  /** Text on CTA buttons. null/absent = Auto (from the primary's luminance). */
  buttonTextColor?: string | null
}

/**
 * Map the owner's colors onto the design-system CSS variables for this
 * page's subtree, plus the `--cta-*` button stops.
 *
 * Roles: the **primary** color owns everything metallic (CTA chrome, hover
 * glow, brand-mark gradient); the optional **secondary** re-points the FLAT
 * brand usages (`--brand`: prices, links, chips, dots, focus) — on Auto both
 * follow primary, which is the pre-secondary behaviour. The optional
 * **surface** replaces the derived card/panel color; wells and borders then
 * derive from it so card edges stay visible whatever it is.
 */
export function storeVars(theme: StoreThemeVars): React.CSSProperties {
  const bg = safeHex(theme.backgroundColor, FALLBACK_BG)
  const primary = safeHex(theme.primaryColor, FALLBACK_PRIMARY)
  const darkBg = isDarkColor(bg)
  // Auto (null) or malformed → follow primary / derive from background.
  const secondary =
    theme.secondaryColor && HEX6.test(theme.secondaryColor)
      ? theme.secondaryColor
      : primary
  const surface =
    theme.surfaceColor && HEX6.test(theme.surfaceColor)
      ? theme.surfaceColor
      : darkBg
        ? lighten(bg, 0.07)
        : '#ffffff'
  const darkSurface = isDarkColor(surface)
  // Brand-coloured TEXT (prices, links, headings' accent) must read on the
  // surface; a light owner colour (e.g. sky blue) is darkened just enough.
  const brand = readableOn(secondary, surface)
  const onSecondary = textOn(brand)
  // CTA text contrasts the CTA's own background (the PRIMARY color, which
  // paints the metal chrome) — deriving it from secondary painted dark text
  // onto dark buttons whenever the two colors diverged. The owner can also
  // set it explicitly (Appearance → Button text color).
  const ctaText =
    theme.buttonTextColor && HEX6.test(theme.buttonTextColor)
      ? theme.buttonTextColor
      : textOn(primary)

  return {
    // --- design-system semantics (flat surfaces) --------------------------
    '--bg': bg,
    '--surface': surface,
    // Fields (`bg-input`) sit on the surface. Without this they kept the
    // app's white, which on a dark owner theme meant white text on white.
    '--input-bg': surface,
    // Wells/borders derive from the surface they sit on, so a custom surface
    // keeps visible card edges and recessed slots.
    '--surface-alt': darkSurface ? lighten(surface, 0.07) : darken(surface, 0.045),
    // Borders stay visibly distinct from surface-alt, otherwise card edges
    // disappear on light themes.
    '--line': darkSurface ? lighten(surface, 0.14) : darken(surface, 0.18),
    '--fg': darkBg ? '#ffffff' : '#101010',
    // 0.72 keeps small muted text at AA contrast on dark owner themes
    // (0.62 was borderline against near-black backgrounds).
    '--fg-muted': darkBg ? 'rgba(255,255,255,0.72)' : '#5c5c5c',
    '--brand': brand,
    '--brand-hover': lighten(secondary, 0.1),
    '--brand-contrast': onSecondary,
    '--cta-contrast': ctaText,
    '--accent': secondary,

    // Primary button: fill, pressed, hover (`btn-primary`).
    '--cta': primary,
    '--cta-lo': darken(primary, 0.18),
    '--cta-pressed': darken(primary, 0.1),
    // Soft shadow colour used by the seller workspace's frosted accents.
    '--cta-glow': rgba(primary, 0.65),
  } as React.CSSProperties
}

/**
 * Semantic style fragments — bound to the variables set by `storeVars`, so
 * they follow the owner's palette. Flat by default; `cta` is the one shiny
 * slot. Kept as a small object so the section components read cleanly.
 */
export const SKIN = {
  text: 'text-fg',
  muted: 'text-muted',
  /** Flat raised panel: cards, sheets, empty states. */
  surface: 'bg-surface',
  border: 'border-line',
  /** Recessed well: image slots, troughs. */
  well: 'bg-surface-alt text-muted',
  /** Secondary control: chips, selects, ghost buttons. */
  chip: 'bg-surface',
  /** Primary action — flat fill in the shop owner's colour (btn-primary). */
  cta: 'btn-primary',
  /** Supporting action beside a primary — outlined (btn-secondary). */
  ctaSecondary: 'btn-secondary',
} as const

export type Skin = typeof SKIN
