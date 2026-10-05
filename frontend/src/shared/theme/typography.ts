/**
 * Typography tokens.
 *
 * Scale/weights/line-heights come from the skill
 * (`skillui/tokens/typography.json` + `DESIGN.md` §3). The two families
 * deviate from the skill by design decision, adopted from the approved
 * UnieMax prototype (`prototype/index.html`):
 *
 * - Fraunces — headings, product names, prices, and the italic accent
 *   (`font-accent`). Soft editorial serif with an optical-size axis. SIL
 *   OFL, self-hosted (`public/fonts/Fraunces-*.woff2`, wght 100–900).
 * - Plus Jakarta Sans — body/UI text. SIL OFL, self-hosted
 *   (`public/fonts/PlusJakartaSans-*.woff2`, wght 200–800).
 *
 * Chosen in October 2026 ("soft editorial"), replacing Manrope + Inter.
 * Only these two families are allowed — never introduce a third typeface.
 * Keep these stacks in lockstep with the `--font-heading` / `--font-body`
 * tokens in `index.css`.
 */

export const fontFamily = {
  /** Headings / display. */
  heading: '"Fraunces", Georgia, "Times New Roman", serif',
  /** Body / UI text. */
  body: '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  /** The italic accent (always italic). */
  accent: '"Fraunces", Georgia, "Times New Roman", serif',
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
