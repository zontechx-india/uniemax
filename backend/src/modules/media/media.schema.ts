import { z } from "zod";
import { SHAREABLE_KEY, SHARE_URL_SUFFIX } from "../../package/storage/index.js";

/**
 * `GET /public/images/share/:bucket/{key}.jpg` — the bucket is a logical
 * storage bucket, the wildcard the original's object key plus the `.jpg`
 * suffix `shareImagePath` adds. Only plain image keys are accepted (no
 * `derived/`, no `..`), so the endpoint can render nothing but an existing
 * original's share image.
 */
export const shareImageParamsSchema = z.object({
  bucket: z.enum(["logo", "media"]),
  "*": z
    .string()
    .refine((path) => path.endsWith(SHARE_URL_SUFFIX), "Share image URLs end in .jpg")
    .transform((path) => path.slice(0, -SHARE_URL_SUFFIX.length))
    .pipe(z.string().regex(SHAREABLE_KEY, "Not an image key")),
});
