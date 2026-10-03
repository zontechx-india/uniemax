/**
 * The storage abstraction. Everything above this interface (modules, routes)
 * talks in terms of a logical bucket + object key; everything below it
 * (drivers) knows how bytes are actually stored.
 *
 * Swapping AWS S3 for Cloudflare R2, MinIO, Azure Blob or GCS means writing
 * one new driver implementing these four methods — no database or module
 * changes, because rows only ever hold object keys.
 */

/** Logical buckets — mapped to real bucket names/directories by config. */
export type MediaBucket = "logo" | "media";

export interface StorageDriver {
  /** Stores an object. Overwrites silently if the key exists. */
  put(
    bucket: MediaBucket,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void>;

  /** Reads an object's bytes. `null` (not an error) for a missing key. */
  get(bucket: MediaBucket, key: string): Promise<Buffer | null>;

  /** Deletes an object. MUST be a no-op (not an error) for a missing key. */
  remove(bucket: MediaBucket, key: string): Promise<void>;

  /** Public URL an object is served at — assembled from config, never stored. */
  publicUrl(bucket: MediaBucket, key: string): string;
}
