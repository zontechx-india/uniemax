import {
  getDerivedImage,
  type DerivativeName,
  type ImageWidth,
  type MediaBucket,
} from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * A derived image of a stored original — rendered and stored on first
 * request by the storage package, read back afterwards. 404 when the
 * original does not exist.
 */
async function derived(bucket: MediaBucket, key: string, name: DerivativeName): Promise<Buffer> {
  const image = await getDerivedImage(bucket, key, name);
  if (!image) throw HttpError.notFound("Image not found");
  return image;
}

export function shareImage(bucket: MediaBucket, key: string): Promise<Buffer> {
  return derived(bucket, key, "share");
}

export function cardImage(bucket: MediaBucket, key: string): Promise<Buffer> {
  return derived(bucket, key, "card");
}

export function sizedImage(bucket: MediaBucket, key: string, width: ImageWidth): Promise<Buffer> {
  return derived(bucket, key, `w${width}`);
}
