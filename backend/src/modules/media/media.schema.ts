import { z } from "zod";
import {
  IMAGE_WIDTHS,
  SHARE_URL_SUFFIX,
  SOURCE_IMAGE_KEY,
} from "../../package/storage/index.js";

/**
 * Both image endpoints take a logical storage bucket and, as the wildcard,
 * the original's object key. Only plain image keys are accepted (no
 * `derived/`, no `..`), so they can derive from nothing but an existing
 * original.
 */
const bucket = z.enum(["logo", "media"]);
const sourceKey = z.string().regex(SOURCE_IMAGE_KEY, "Not an image key");

/** `{key}.jpg` — `shareImagePath` adds the `.jpg` to every preview URL. */
const previewKey = z
  .string()
  .refine((path) => path.endsWith(SHARE_URL_SUFFIX), "Preview image URLs end in .jpg")
  .transform((path) => path.slice(0, -SHARE_URL_SUFFIX.length))
  .pipe(sourceKey);

/**
 * `GET /public/images/share/:bucket/{key}.jpg`. Logos are accepted too:
 * their previews moved to store cards, but links shared before then still
 * carry share-image URLs, and preview caches re-fetch them.
 */
export const shareImageParamsSchema = z.object({ bucket, "*": previewKey });

/** `GET /public/images/card/logo/{key}.jpg` — store cards exist for logos only. */
export const cardImageParamsSchema = z.object({ bucket: z.literal("logo"), "*": previewKey });

/** `GET /public/images/w/:width/:bucket/{key}` — only the published widths. */
export const sizedImageParamsSchema = z.object({
  width: z.coerce
    .number()
    .refine(
      (width): width is (typeof IMAGE_WIDTHS)[number] =>
        (IMAGE_WIDTHS as readonly number[]).includes(width),
      `Width must be one of ${IMAGE_WIDTHS.join(", ")}`,
    ),
  bucket,
  "*": sourceKey,
});
