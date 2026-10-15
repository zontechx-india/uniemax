/**
 * Typography tokens.
 *
 * Scale/weights/line-heights come from the skill
 * (`skillui/tokens/typography.json` + `DESIGN.md` §3). The family deviates
 * from the skill by design decision:
 *
 * - Plus Jakarta Sans — the ONE typeface, for every surface: headings,
 *   storefront names and section titles, body and UI text. SIL OFL,
 *   self-hosted (`public/fonts/PlusJakartaSans-*.woff2`, wght 200–800).
 *
 * The Fraunces serif (headings / storefront names) was removed on
 * 15 Oct 2026 — it read as fancy rather than premium. Never introduce a
 * second typeface. Keep these stacks in lockstep with the `--font-*`
 * tokens in `index.css`.
 */

const SANS = '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif'

export const fontFamily = {
  /** Headings / display. */
  heading: SANS,
  /** Body / UI text. */
  body: SANS,
  /** The italic accent (always italic). */
  accent: SANS,
} as const

/** Weights from the DESIGN scale — both faces are variable fonts. */
export const fontWeight = {
  regular: 400,
  medium: 500, // buttons (SKILL.md §Button)
  semibold: 600, // heading-2 / heading-3
  bold: 700, // heading-1
} as const

/** Type scale — px values from the token file. */
export const fontSize = {
  caption: '12px', // 0.75rem
  body: '16px', // 1rem
  h3: '24px', // 1.5rem
  h2: '32px', // 2rem
  h1: '48px', // 3rem
} as const

export const lineHeight = {
  heading: 1.2,
  body: 1.5,
} as const

export const letterSpacing = {
  normal: '0',
  /** Uppercase table headers / eyebrows (SKILL.md §Table). */
  wide: '0.05em',
} as const

/**
 * Ready-to-spread text styles (React inline `style` / styled objects).
 * `maxSizesPerScreen: 4` — do not add new sizes; use color/opacity for hierarchy.
 */
export const textStyles = {
  h1: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.heading,
  },
  h2: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.heading,
  },
  h3: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.heading,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.body,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.body,
  },
} as const

export type TextStyle = (typeof textStyles)[keyof typeof textStyles]
