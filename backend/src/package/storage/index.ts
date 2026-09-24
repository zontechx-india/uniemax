import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { HttpError } from "../../utils/httpError.js";
import { mediaRules, storageConfig } from "./config.js";
import type { MediaKind } from "./config.js";
import { createLocalDriver, localRoot } from "./drivers/local.js";
import { createS3Driver } from "./drivers/s3.js";
import type { MediaBucket, StorageDriver } from "./types.js";

/**
 * PUBLIC facade of the storage package — the only file the app imports.
 *
 * Provides:
 *   - `storage` — the active driver (S3 or local disk, per STORAGE_DRIVER)
 *   - `registerStoragePlugins(app)` — multipart parsing (+ /uploads static
 *     serving when the local driver is active)
 *   - `readUpload(request, kind)` — reads ONE multipart file, enforcing the
 *     configured size/type rules for that media kind
 *   - `newObjectKey(prefix, contentType)` — collision-free key generation
 *   - `mediaRules` — the configured limits (also served to clients via the
 *     public /media-config endpoint, so UI hints always match the server)
 *
 * The abstraction boundary is `StorageDriver` (types.ts): the app deals in
 * logical buckets + object keys only. The DB stores keys, never URLs.
 */

export { mediaRules } from "./config.js";
export type { MediaKind } from "./config.js";
export type { MediaBucket, StorageDriver } from "./types.js";

export const storage: StorageDriver =
  storageConfig.driver === "s3" ? createS3Driver() : createLocalDriver();

/** Public URL for a stored object — null-safe convenience for shaping rows. */
export function mediaUrl(bucket: MediaBucket, key: string | null): string | null {
  return key ? storage.publicUrl(bucket, key) : null;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** "products/abc" + "image/webp" → "products/abc/9f3c….webp". */
export function newObjectKey(prefix: string, contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType] ?? "bin";
  return `${prefix}/${randomUUID()}.${ext}`;
}

export interface UploadedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
  /** The rule the file was validated against ("image" | "video" | "logo"). */
  kind: MediaKind;
  /**
   * The plain TEXT fields sent alongside the file, by field name. Lets one
   * endpoint take a file together with its metadata (e.g. POST /stores —
   * name + logo in a single request). Collected after the file stream is
   * drained, so fields on either side of the file part are seen.
   */
  fields: Record<string, string>;
}

/**
 * Reads the single multipart file of a request, enforcing the configured
 * rules (max size, allowed content types) for `kind`. Pass `"auto"` to pick
 * the image or video rule from the file's own content type — used by the
 * product-media endpoint, which accepts both.
 *
 * The multipart parser streams under the global ceiling registered in
 * `registerStoragePlugins` (so an oversized body is cut off, never fully
 * buffered); the precise per-kind limit is enforced against the buffer here.
 */
export async function readUpload(
  request: FastifyRequest,
  kind: MediaKind | "auto",
): Promise<UploadedFile> {
  const file = await request.file().catch(() => null);
  if (!file) throw HttpError.badRequest("Attach a file to upload");

  const contentType = file.mimetype.toLowerCase();
  const resolvedKind: MediaKind =
    kind === "auto"
      ? contentType.startsWith("video/")
        ? "video"
        : "image"
      : kind;
  const rule = mediaRules[resolvedKind];

  if (!rule.contentTypes.includes(contentType)) {
    throw HttpError.badRequest(
      `Unsupported file type "${file.mimetype}". Allowed: ${rule.contentTypes.join(", ")}`,
    );
  }

  const tooLarge = () =>
    new HttpError(413, `File is too large — the maximum is ${rule.maxMB} MB`);

  const buffer = await file.toBuffer().catch(() => {
    throw tooLarge();
  });
  if (file.file.truncated || buffer.length > rule.maxBytes) {
    throw tooLarge();
  }

  // The declared mimetype is the client's word; check the bytes. Anything
  // that is not a real image/video of an allowed type is refused (an HTML or
  // SVG file renamed to .png would otherwise be stored and served from our
  // bucket), and a mislabelled one is stored under the type it really is.
  const sniffed = sniffContentType(buffer);
  if (!sniffed || !rule.contentTypes.includes(sniffed)) {
    throw HttpError.badRequest(
      `The file is not a valid ${rule.contentTypes
        .map((t) => t.split("/")[1]?.toUpperCase())
        .join(", ")} — it may be corrupted or renamed`,
    );
  }

  return {
    buffer,
    contentType: sniffed,
    filename: file.filename,
    kind: resolvedKind,
    fields: textFields(file.fields),
  };
}

/**
 * The media type a buffer really is, from its leading magic bytes — only the
 * formats the upload rules can allow (JPEG, PNG, WebP, AVIF, MP4, QuickTime,
 * WebM). `null` for anything else. Dependency-free on purpose: these
 * signatures are fixed by the formats themselves.
 */
export function sniffContentType(buf: Buffer): string | null {
  const ascii = (start: number, end: number) =>
    buf.length >= end ? buf.toString("latin1", start, end) : "";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  if (ascii(4, 8) === "ftyp") {
    // ISO-BMFF: major brand at 8..12, compatible brands after the version.
    const boxSize = Math.min(buf.readUInt32BE(0), buf.length, 256);
    const brands = [ascii(8, 12)];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(i, i + 4));
    if (brands.some((b) => b === "avif" || b === "avis")) return "image/avif";
    if (brands[0] === "qt  ") return "video/quicktime";
    if (brands.some((b) => /^(isom|iso[2-9]|mp41|mp42|avc1|dash|M4V |M4A |mmp4|msnv)$/.test(b))) {
      return "video/mp4";
    }
  }
  return null;
}

/** Picks the plain text fields out of a multipart part's `fields` bag. */
function textFields(fields: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields || typeof fields !== "object") return out;
  for (const [name, entry] of Object.entries(fields as Record<string, unknown>)) {
    const part = Array.isArray(entry) ? entry[0] : entry;
    const value = (part as { value?: unknown } | null)?.value;
    if (typeof value === "string") out[name] = value;
  }
  return out;
}

/**
 * Registers multipart parsing and, for the local driver, static serving of
 * the uploads directory at /uploads/{bucket}/{key} (mirrors what S3/CDN does
 * in production). Call once from buildApp().
 */
export async function registerStoragePlugins(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      // Global ceiling; per-kind limits are enforced in readUpload().
      fileSize:
        Math.max(...Object.values(mediaRules).map((rule) => rule.maxBytes)) +
        1024,
      files: 1,
    },
  });

  if (storageConfig.driver === "local") {
    await app.register(fastifyStatic, {
      root: localRoot,
      prefix: "/uploads/",
      // Same immutable-cache stance as the S3 driver: keys are never reused.
      maxAge: "365d",
      immutable: true,
    });
  }
}
