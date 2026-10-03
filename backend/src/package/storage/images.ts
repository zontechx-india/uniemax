import sharp from "sharp";
import type { MediaBucket } from "./types.js";

/**
 * Image rules — the ONE place that decides what an image we store or serve
 * looks like. Pure functions over bytes; storage I/O lives in the facade.
 *
 * Two outputs:
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
const MAX_EDGE = { image: 1920, logo: 1024 } as const;

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

/**
 * Where an original's share image is stored, in the original's own bucket:
 * `products/a/b/uuid.webp` → `derived/share/products/a/b/uuid.jpg`.
 *
 * Derived from the key, so no database column records it: originals are
 * immutable (a replace mints a new key), hence so is their share image,
 * and both cache forever. `derived/` objects are never referenced by a row —
 * the media audit counts them as belonging to their source key.
 */
export const DERIVED_PREFIX = "derived/";

export function shareImageKey(key: string): string {
  return `${DERIVED_PREFIX}share/${key.replace(/\.[A-Za-z0-9]+$/, "")}.jpg`;
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
 * Keys the share endpoint will render: an ordinary object key (no `derived/`
 * recursion, no `..`, no odd characters) with an image extension.
 */
export const SHAREABLE_KEY = /^(?!derived\/)(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:jpe?g|png|webp|avif)$/;
