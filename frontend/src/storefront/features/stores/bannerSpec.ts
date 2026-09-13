/**
 * The banner size contract — ONE definition, read by both the storefront
 * carousel that renders banners and the admin screen that tells sellers what
 * to upload. If these two ever disagreed, every seller's artwork would be
 * cropped in a way nothing in the product explained.
 *
 * **One image, one ratio, every screen.** A banner is always 16:5 and is
 * scaled by WIDTH at every breakpoint, so its height falls out of the screen
 * size: 1920px → 600px, 1440 → 450, 1024 → 320, 768 → 240, 390 → 122. Nothing
 * is ever cropped or letterboxed, and the whole artwork is visible on a phone
 * exactly as it is on a monitor.
 *
 * An earlier revision also took a portrait phone image and swapped it in under
 * `sm`. It was dropped: sellers export one asset, and a second optional one
 * that most would skip only meant the *fallback* (a hard centre-crop of the
 * wide image) became the common case on phones — the worst outcome of the
 * three.
 */

export interface BannerFormat {
  /** Tailwind `aspect-[...]` value — one ratio, no responsive variant. */
  aspect: string
  /** Human ratio, e.g. "16:5". */
  ratio: string
  /** What a seller should export; 1920 wide covers the largest common screen. */
  width: number
  height: number
  /** Below this the image is upscaled and looks soft. */
  minWidth: number
}

/** The only banner format. */
export const BANNER_FORMAT: BannerFormat = {
  aspect: 'aspect-[16/5]',
  ratio: '16:5',
  width: 1920,
  height: 600,
  minWidth: 1280,
}

/**
 * How far from 16:5 an upload may be before it must be cropped. Tight on
 * purpose: this is "is it already the right shape?", not the advisory
 * tolerance below. Real exports land within rounding of their target, so 1%
 * passes 1920×600 and 2172×679 while catching 3:1 (6.25% off) and everything
 * looser.
 */
const CROP_TOLERANCE = 0.01

/**
 * Must this image be cropped before it can be uploaded?
 *
 * A banner fills the page edge to edge at a FIXED ratio, so an off-ratio
 * upload has to lose something. The only question is who decides what: left
 * to `object-cover` the browser silently takes it off the top and bottom,
 * which is how a logo ends up half-eaten. Answering "yes" here sends the
 * uploader to the crop dialog instead, where they frame it themselves.
 *
 * Returns false for an undecodable file (0×0) — that is the server's call to
 * reject, not something to block the UI on.
 */
export function needsBannerCrop(
  width: number,
  height: number,
  format: BannerFormat = BANNER_FORMAT,
): boolean {
  if (!width || !height) return false
  const actual = width / height
  const wanted = format.width / format.height
  return Math.abs(actual - wanted) / wanted > CROP_TOLERANCE
}

/** The crop frame the banner dialog locks to. */
export const BANNER_ASPECT = BANNER_FORMAT.width / BANNER_FORMAT.height

/** "1920 × 600 (16:5)" — the one phrasing used everywhere a size is quoted. */
export function bannerSizeLabel(format: BannerFormat = BANNER_FORMAT): string {
  return `${format.width} × ${format.height} (${format.ratio})`
}

/**
 * Is this upload usable at the size it will be displayed? Returns a warning
 * the seller can act on, or null. Deliberately advisory — a slightly-off image
 * is cropped to fit, never rejected, because a seller mid-campaign is better
 * served by a soft banner than by no banner.
 */
export function checkBannerImage(
  width: number,
  height: number,
  format: BannerFormat = BANNER_FORMAT,
): string | null {
  if (!width) return null
  // Shape is no longer a warning: an off-ratio file goes through the crop
  // dialog, so by the time it uploads it IS 16:5. What remains is resolution,
  // which cropping can only make worse — a crop out of a small image is
  // smaller still.
  if (width < format.minWidth) {
    // Cropping only makes a small image smaller, so say so when one is coming.
    const after = needsBannerCrop(width, height, format) ? ', and cropping will take it lower' : ''
    return `This image is only ${width}px wide${after} — it may look soft on large screens. Export at ${format.width}px for the sharpest result.`
  }
  return null
}
