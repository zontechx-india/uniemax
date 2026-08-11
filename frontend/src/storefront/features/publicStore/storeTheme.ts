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
 * **Metal accents are deliberately scarce.** Surfaces, bars, chips and wells
 * are FLAT — the metallic treatment (chrome gradient + glow) is reserved for
 * the places that should shine: primary CTAs (`metal-cta`) and the card hover
 * elevation (`metal-lift`), both cut from the owner's own colors. An earlier
 * iteration brushed every surface with gradients; it read as noise, so the
 * shine now marks importance instead of texture.
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
 * page's subtree, plus the two metal-accent tokens (`--brand-metal*` for CTAs,
 * `--metal-glow` for hover elevation).
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
  const onSecondary = isDarkColor(secondary) ? '#ffffff' : '#101010'
  // CTA text contrasts the CTA's own background (the PRIMARY color, which
  // paints the metal chrome) — deriving it from secondary painted dark text
  // onto dark buttons whenever the two colors diverged. The owner can also
  // set it explicitly (Appearance → Button text color).
  const ctaText =
    theme.buttonTextColor && HEX6.test(theme.buttonTextColor)
      ? theme.buttonTextColor
      : isDarkColor(primary)
        ? '#ffffff'
        : '#101010'

  return {
    // --- design-system semantics (flat surfaces) --------------------------
    '--bg': bg,
    '--surface': surface,
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
    '--brand': secondary,
    '--brand-hover': lighten(secondary, 0.1),
    '--brand-contrast': onSecondary,
    '--cta-contrast': ctaText,
    '--accent': secondary,

    // --- metal accents (CTAs + hover glow ONLY) ---------------------------
    // Chrome CTA cut from the owner's primary color.
    '--brand-metal': `linear-gradient(180deg, ${lighten(primary, 0.28)} 0%, ${primary} 48%, ${darken(primary, 0.2)} 100%)`,
    '--brand-metal-hover': `linear-gradient(180deg, ${lighten(primary, 0.38)} 0%, ${lighten(primary, 0.08)} 48%, ${darken(primary, 0.12)} 100%)`,
    '--brand-metal-edge': isDarkColor(primary)
      ? 'rgba(255,255,255,0.34)'
      : 'rgba(255,255,255,0.6)',
    '--brand-glow': `0 6px 18px -8px ${rgba(primary, 0.65)}`,

    // Hover elevation. Zero x/y offset on purpose: the halo spreads EQUALLY
    // on all four sides instead of pooling under the card (the same principle
    // as the skill's `--shadow-floating`). Tinted with the owner's brand.
    '--metal-glow': `0 0 30px 2px ${rgba(primary, darkBg ? 0.3 : 0.22)}, 0 0 0 1px ${rgba(primary, darkBg ? 0.35 : 0.25)}`,
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
  /** Primary call to action — the one place the metal shines. Text color
   *  contrasts the CTA background (owner-overridable), NOT the flat brand. */
  cta: 'metal-cta text-cta-contrast',
} as const

export type Skin = typeof SKIN
