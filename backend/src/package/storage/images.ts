import sharp from "sharp";
import type { MediaBucket } from "./types.js";

/**
 * Image rules — the ONE place that decides what an image we store or serve
 * looks like. Pure functions over bytes; storage I/O lives in the facade.
 *
 * Three outputs:
 *
 *  - **Originals** (`normalizeImage`) — what an upload is stored as. The
 *    browser editor already crops and compresses to WebP, but the server
 *    used to store whatever arrived (up to the upload limit), so anything
 *    that skipped the editor — an older upload, another client, a direct API
 *    call — went in at full size: a 2.2 MB phone PNG on a product page, and
 *    phone EXIF (GPS included) served publicly. Now every image upload is
 *    rotated upright, capped in size and re-encoded on the server, whatever
 *    sent it.
 *
 *  - **Share images** (`renderShareImage`) — the copy link previews use
 *    (`og:image`). WhatsApp builds a preview on the sender's phone and
 *    drops images it cannot fetch quickly (roughly 300 KB+), while
 *    Instagram/Facebook accept large ones — so a big photo previewed on one
 *    and not the other. A small baseline JPEG is the one format every
 *    preview service renders.
 *
 *  - **Sized copies** (`renderSizedImage`) — the same photo at a few fixed
 *    widths, offered to browsers as `srcset` candidates so a product grid on
 *    a phone downloads a 320 px copy, not the 1920 px original.
 *
 * Share images and sized copies are both *derived images*: made from an
 * original on first request, stored beside it, cached forever (see
 * `DERIVATIVES` below).
 */

// One-off images: libvips' operation cache would only hold memory.
sharp.cache(false);

/**
 * Decompression-bomb guard. 50 MP covers any phone photo (a 200 MP sensor
 * still writes ~12 MP files by default) while refusing a tiny file that
 * claims to be gigapixels.
 */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Longest edge a stored original may have. Mirrors the browser editor so
 * the server never shrinks below what the UI produces: product photos 1600
 * (`MAX_EDGE` in `frontend/src/shared/media/cropImage.ts`) and banners 1920
 * (`BANNER_FORMAT.width`) share the "image" rule, so it takes the larger.
 * Logos are shown at most a few hundred pixels wide.
 */
export const MAX_EDGE = { image: 1920, logo: 1024 } as const;

/** Visually lossless for photos at a fraction of PNG/JPEG size. */
const WEBP_QUALITY = 82;

export type ImageRule = keyof typeof MAX_EDGE;

export interface NormalizedImage {
  buffer: Buffer;
  contentType: string;
  /** False when the input already met the rules and is stored untouched. */
  changed: boolean;
}

function decode(buffer: Buffer) {
  return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
}

/**
 * The bytes to store for an uploaded (or existing) image.
 *
 * Left untouched when it already meets every rule — WebP or AVIF, upright,
 * within the size cap, single frame — which is what the browser editor
 * produces, so the common path costs one metadata read and never
 * re-compresses an already-compressed image. Otherwise: EXIF orientation
 * applied, longest edge capped, metadata stripped, WebP. An image that was
 * only re-encoded (not shrunk or rotated) is kept as-is if WebP came out
 * larger. Animated images are never touched: re-encoding would keep only
 * the first frame.
 *
 * Throws when the bytes cannot be decoded — callers report a bad file.
 */
export async function normalizeImage(
  buffer: Buffer,
  contentType: string,
  rule: ImageRule,
): Promise<NormalizedImage> {
  const meta = await decode(buffer).metadata();
  const unchanged = { buffer, contentType, changed: false };
  if ((meta.pages ?? 1) > 1) return unchanged;

  const maxEdge = MAX_EDGE[rule];
  const oversized = Math.max(meta.width ?? 0, meta.height ?? 0) > maxEdge;
  const upright = (meta.orientation ?? 1) === 1;
  const modern = contentType === "image/webp" || contentType === "image/avif";
  if (modern && upright && !oversized) return unchanged;

  const output = await decode(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  if (upright && !oversized && output.length >= buffer.length) return unchanged;
  return { buffer: output, contentType: "image/webp", changed: true };
}

// ---------------------------------------------------------------------------
// Share images (link previews)
// ---------------------------------------------------------------------------

/** WhatsApp's practical ceiling; every attempt below aims under it. */
const SHARE_MAX_BYTES = 300 * 1024;

/** Tried in order until one fits — the first almost always does. */
const SHARE_ATTEMPTS = [
  { edge: 1200, quality: 82 },
  { edge: 1200, quality: 70 },
  { edge: 960, quality: 70 },
  { edge: 800, quality: 60 },
] as const;

/**
 * A preview-safe JPEG of an image: upright, longest edge ≤ 1200 px,
 * transparency flattened onto white (JPEG has no alpha — a transparent logo
 * would otherwise turn black), under ~300 KB. Animated inputs use their
 * first frame.
 */
export async function renderShareImage(buffer: Buffer): Promise<Buffer> {
  let output: Buffer | null = null;
  for (const { edge, quality } of SHARE_ATTEMPTS) {
    output = await decode(buffer)
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (output.length <= SHARE_MAX_BYTES) break;
  }
  return output!;
}

// ---------------------------------------------------------------------------
// Sized copies (responsive images)
// ---------------------------------------------------------------------------

/**
 * Widths browsers may ask for, as `srcset` candidates. A fixed set, never an
 * arbitrary number: each width is one stored copy per photo, and an
 * open-ended size parameter would let anyone fill the bucket. The original
 * (≤ `MAX_EDGE`) is the largest candidate, so the set stops below it.
 */
export const IMAGE_WIDTHS = [320, 640, 960, 1280] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/**
 * The image `width` px wide (never enlarged), upright, as WebP. Animated
 * inputs use their first frame.
 */
export function renderSizedImage(buffer: Buffer, width: ImageWidth): Promise<Buffer> {
  return decode(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Derived images — where every copy lives and how it is made
// ---------------------------------------------------------------------------

/**
 * A copy made FROM an original lives beside it, in the original's own
 * bucket, at `derived/<name>/<original key minus extension>.<ext>`:
 * `products/a/b/uuid.webp` → `derived/w640/products/a/b/uuid.webp`.
 *
 * Derived from the key, so no database column records it: originals are
 * immutable (a replace mints a new key), hence so are their copies, and all
 * of them cache forever. `derived/` objects are never referenced by a row —
 * the media audit counts them as belonging to their source key.
 */
export const DERIVED_PREFIX = "derived/";

interface Derivative {
  ext: string;
  contentType: string;
  render: (original: Buffer) => Promise<Buffer>;
}

const sized = (width: ImageWidth): Derivative => ({
  ext: "webp",
  contentType: "image/webp",
  render: (original) => renderSizedImage(original, width),
});

/** Every kind of derived image. A new preset is one entry here. */
const DERIVATIVES = {
  share: { ext: "jpg", contentType: "image/jpeg", render: renderShareImage },
  w320: sized(320),
  w640: sized(640),
  w960: sized(960),
  w1280: sized(1280),
} satisfies Record<string, Derivative>;

export type DerivativeName = keyof typeof DERIVATIVES;

/** The sized copies, smallest first. */
export const SIZED_DERIVATIVES: readonly DerivativeName[] = IMAGE_WIDTHS.map(
  (width) => `w${width}` as const,
);

/** Every derived image — what a stored image gets on upload. */
export const ALL_DERIVATIVES = Object.keys(DERIVATIVES) as DerivativeName[];

export function derivative(name: DerivativeName): Derivative {
  return DERIVATIVES[name];
}

export function derivedKey(name: DerivativeName, key: string): string {
  return `${DERIVED_PREFIX}${name}/${key.replace(/\.[A-Za-z0-9]+$/, "")}.${DERIVATIVES[name].ext}`;
}

/**
 * The public URL path that serves an original's share image
 * (`GET /api/v1/public/images/share/{bucket}/{key}.jpg`, generated on first
 * request). The `.jpg` suffix makes the URL say what it serves — some
 * preview scrapers judge an image by its extension, and the original's may
 * be `.webp`. Relative — callers make it absolute against the site origin.
 */
export function shareImagePath(bucket: MediaBucket, key: string): string {
  return `/api/v1/public/images/share/${bucket}/${key}${SHARE_URL_SUFFIX}`;
}

export const SHARE_URL_SUFFIX = ".jpg";

/**
 * Keys the image endpoints derive from: an ordinary object key (no
 * `derived/` recursion, no `..`, no odd characters) with an image extension.
 * Its source is also published in `/public/media-config`, so the storefront
 * asks for sized copies of exactly the keys the server accepts.
 */
export const SOURCE_IMAGE_KEY = /^(?!derived\/)(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:jpe?g|png|webp|avif)$/;
