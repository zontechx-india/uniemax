/**
 * The one content column the whole platform shares.
 *
 * **Full-width backgrounds, centred max-width content.** Bands, bars and
 * footers still paint edge to edge; only what you *read* is capped.
 *
 * ## Why 1440 and not 1920
 *
 * The storefront settled on 1440 for a reason worth repeating here: it is
 * where a five-across product row lands on ~270px cards, and it is roughly the
 * widest a line of text or a row of cards can be before the eye stops
 * scanning it as one thing. The marketplace homepage was capped at **1920**
 * instead, which is not a cap at all on a 1920 monitor — the page was
 * genuinely full-width, the header's logo sat a thousand pixels from its
 * search box, and a 16:5 banner with no frame grew past 700px tall. On a
 * 2560 monitor the same page ran to 1920px of cards in a row.
 *
 * Both surfaces now read the same constant, so `/` and `/store/{slug}` cannot
 * drift apart again — which is the actual bug, more than any single number.
 *
 * The gutters are part of the column: 16px on a phone, 24px from `sm`, 40px
 * from `lg`. They are what stop a card touching the screen edge, so a caller
 * that wants the cap without them is almost always about to introduce that.
 */

/** The cap on its own — for a surface that brings its own gutters. */
export const CONTENT_MAX = 'max-w-[1440px]'

/** Responsive side gutters on their own. */
export const CONTENT_GUTTER = 'px-4 sm:px-6 lg:px-10'

/** Centred, capped, guttered — the column nearly everything sits in. */
export const CONTENT_COLUMN = `mx-auto w-full ${CONTENT_MAX} ${CONTENT_GUTTER}`

/**
 * Vertical rhythm for a full-bleed section band.
 *
 * It keeps growing to `lg` on purpose. Padding that is right at 1280 leaves a
 * 2560 monitor looking like a stack of tight strips, because the bands got
 * wider while the air between their contents did not.
 */
export const SECTION_PADDING = 'py-9 sm:py-11 lg:py-14'
