import { getShareImage, type MediaBucket } from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * The share image of a stored original — rendered and stored on first
 * request by the storage package, read back afterwards. 404 when the
 * original does not exist.
 */
export async function shareImage(bucket: MediaBucket, key: string): Promise<Buffer> {
  const image = await getShareImage(bucket, key);
  if (!image) throw HttpError.notFound("Image not found");
  return image;
}
