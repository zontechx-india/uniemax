import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { storageConfig } from "../config.js";
import type { MediaBucket, StorageDriver } from "../types.js";

/**
 * AWS S3 driver. Bucket names, region, credentials and optional public base
 * URLs (CloudFront) all come from configuration — nothing is hardcoded.
 *
 * Credentials: uses the explicit AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * pair when provided; otherwise falls back to the SDK's default provider
 * chain (IAM role, shared config…), which is what production on EC2/ECS
 * should use.
 */
export function createS3Driver(): StorageDriver {
  const { region, accessKeyId, secretAccessKey } = storageConfig.aws;

  const client = new S3Client({
    ...(region ? { region } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  const bucketName = (bucket: MediaBucket) =>
    storageConfig.buckets[bucket].name;

  // Optional per-bucket folder — lets both logical buckets live in ONE
  // physical bucket (e.g. uniemax/store_logo + uniemax/product_media).
  // Applied here only: DB keys never contain the prefix.
  const objectKey = (bucket: MediaBucket, key: string) => {
    const prefix = storageConfig.buckets[bucket].keyPrefix;
    return prefix ? `${prefix}/${key}` : key;
  };

  return {
    async put(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName(bucket),
          Key: objectKey(bucket, key),
          Body: body,
          ContentType: contentType,
          // Immutable keys (a replace mints a new key), so long cache is safe.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    },

    async get(bucket, key) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucketName(bucket),
            Key: objectKey(bucket, key),
          }),
        );
        return response.Body
          ? Buffer.from(await response.Body.transformToByteArray())
          : null;
      } catch (error) {
        // NoSuchKey (404) means "not there". Anything else — AccessDenied,
        // network — is a real failure and must not pass for a missing file.
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if ((error as Error).name === "NoSuchKey" || status === 404) return null;
        throw error;
      }
    },

    async remove(bucket, key) {
      // S3 DeleteObject is already a no-op for missing keys.
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucketName(bucket),
          Key: objectKey(bucket, key),
        }),
      );
    },

    publicUrl(bucket, key) {
      const { name, publicBaseUrl } = storageConfig.buckets[bucket];
      const base =
        publicBaseUrl ?? `https://${name}.s3.${region}.amazonaws.com`;
      return `${base.replace(/\/+$/, "")}/${objectKey(bucket, key)}`;
    },
  };
}
