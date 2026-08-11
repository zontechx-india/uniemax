/**
 * Color tokens — anydesk design system (skillui) with the approved UnieMax
 * brand palette.
 *
 * ⚠️ **This file is a documentation mirror, not the runtime source.** Nothing
 * renders from it — every color on screen comes from the CSS variables in
 * `src/index.css`. Change a value here and the app does not move; change both,
 * or change `index.css` alone. It exists so JS-side consumers (canvas, chart
 * libraries, inline SVG) have typed constants to reach for.
 *
 * Structure, spacing, radius, shadows and typography still come from the skill
 * unchanged (`skillui/DESIGN.md`, `skillui/SKILL.md`). **Color is the one
 * deliberate deviation**: the brand is the purple `#6c3ef4` (not the skill's
 * red), on a light-first neutral ramp. Blue `#1863dc` — the skill's own accent
 * — is still reserved for focus rings and active states.
 */

/** Raw palette — the approved brand hexes plus the skill's status colors. */
export const palette = {
  white: '#ffffff', // surface — cards, panels, modals
  canvas: '#f8f8f8', // page background (light)
  well: '#f1f1f1', // extended — recessed wells / hover tracks (light)
  border: '#e8e8e8', // dividers, card borders, outlines (light)
  ink: '#1a1a1a', // primary text (light)
  muted: '#707070', // secondary text (light)

  dark: '#121212', // page background (dark)
  darkSurface: '#1e1e1e', // extended — cards/panels (dark)
  darkWell: '#0c0c0c', // extended — recessed wells (dark)
  darkInput: '#1a1a1a', // extended — input fields (dark)
  darkBorder: '#2a2a2a', // extended — dividers/borders (dark)
  darkInk: '#f8f8f8', // primary text (dark)
  darkMuted: '#9a9a9a', // secondary text (dark) — #707070 fails AA on #121212

  blue: '#1863dc', // accent — focus rings, active states
  info: '#0000ee', // informational highlights

  purple: '#6c3ef4', // brand primary (Primary Purple)
  purpleDark: '#5428d9', // link/CTA hover + brand gradient end (Dark Purple)
  purpleLight: '#9574f7', // derived lighten(purple, .28) — the dark scheme's brand step
  purpleSoft: '#f3f0ff', // Light Purple — brand tint (selected rows, chips)
  black: '#111111', // brand Black — the label ON the dark scheme's brand step

  red: '#ef443b', // danger (no longer the brand color)
  green: '#008000', // success
  amber: '#856404', // warning
} as const

/** Semantic roles (default = light scheme) — reference these, not the raw palette. */
export const colors = {
  /** Page / app background. */
  background: palette.canvas,
  /** Card and panel surfaces. */
  surface: palette.white,
  /** Recessed layer (wells, hover tracks). */
  surfaceDeep: palette.well,
  /** Dividers, card borders, outlines. */
  border: palette.border,

  text: {
    primary: palette.ink,
    muted: palette.muted,
    /** For text placed on a dark surface. */
    inverse: palette.darkInk,
  },

  /** Brand accent — CTAs, primary buttons, links. */
  brand: {
    primary: palette.purple,
    primaryHover: palette.purpleDark,
    /** Text ON the brand color — the purple is dark, so white, never ink. */
    contrast: palette.white,
    /** Light Purple tint — selected rows, brand chips, soft wells. */
    soft: palette.purpleSoft,
  },

  /** Blue accent — focus rings, active nav, secondary emphasis. */
  accent: palette.blue,
  focusRing: palette.blue,

  status: {
    success: palette.green,
    warning: palette.amber,
    danger: palette.red,
    info: palette.info,
  },

  overlay: {
    /** Modal / dialog backdrop. */
    backdrop: 'rgba(0, 0, 0, 0.6)',
    /** Brand glow (metal CTA elevation). */
    glowBrand: 'rgba(108, 62, 244, 0.65)',
  },
} as const

/**
 * Theme-flippable color schemes. Colors are the ONLY themeable axis —
 * spacing, typography, radius and shadows come from the skill and never change.
 *
 * `light` is the default (the brand palette is light-first). `dark` is derived
 * from the palette's single dark value #121212; its secondary text is lifted to
 * #9a9a9a because the light scheme's #707070 fails AA on that canvas.
 *
 * Accent blue and the status colors are identical across both themes. The
 * **brand is not**: see `brandByScheme` below — the purple is a dark color, so
 * it steps up to #9574f7 on the dark canvas (3:1 → 5:1) and its label flips
 * from white to the palette's Black.
 */
export const schemes = {
  light: {
    bg: palette.canvas, //  #f8f8f8 page canvas
    surface: palette.white, //  #ffffff cards / panels / modals
    surfaceAlt: palette.well, //  #f1f1f1 wells / hover tracks
    inputBg: palette.white, //  inputs sit on the card color
    line: palette.border, //  #e8e8e8 dividers / borders
    fg: palette.ink, //  #1a1a1a primary text
    fgMuted: palette.muted, //  #707070 secondary text
  },
  dark: {
    bg: palette.dark, //  #121212 page canvas
    surface: palette.darkSurface, //  #1e1e1e cards / panels / modals
    surfaceAlt: palette.darkWell, //  #0c0c0c wells / hover tracks
    inputBg: palette.darkInput, //  #1a1a1a input fields
    line: palette.darkBorder, //  #2a2a2a dividers / borders
    fg: palette.darkInk, //  #f8f8f8 primary text
    fgMuted: palette.darkMuted, //  #9a9a9a secondary text
  },
} as const

/**
 * The brand step per scheme — the ONE non-neutral that flips.
 *
 * Light: the Primary Purple, 5.8:1 on white, carrying a white label.
 * Dark: its lightened step, 5.0:1 on #121212, carrying a Black label —
 * the same fill/text swap the light gold made in reverse.
 */
export const brandByScheme = {
  light: {
    brand: palette.purple,
    brandHover: palette.purpleDark,
    brandContrast: palette.white,
    brandSoft: palette.purpleSoft,
    brandGradient: `linear-gradient(135deg, ${palette.purple} 0%, ${palette.purpleDark} 100%)`,
  },
  dark: {
    brand: palette.purpleLight,
    brandHover: '#aa90f9',
    brandContrast: palette.black,
    brandSoft: 'rgba(149, 116, 247, 0.16)',
    brandGradient: `linear-gradient(135deg, #aa90f9 0%, ${palette.purpleLight} 100%)`,
  },
} as const

/** Colors shared by both themes (accent, status, overlays, metal CTA chrome). */
export const invariants = {
  /** Text on the metal CTA chrome, which does NOT flip — always white. */
  ctaContrast: palette.white,
  /** Display text on a permanently dark surface (the auth heroes). */
  brandGradientOnDark: `linear-gradient(135deg, ${palette.purpleSoft} 0%, ${palette.purpleLight} 100%)`,
  accent: palette.blue,
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  info: palette.info,
  backdrop: 'rgba(0, 0, 0, 0.6)',
} as const

export type ThemeMode = keyof typeof schemes
export type Palette = typeof palette
export type Colors = typeof colors
