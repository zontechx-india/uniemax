import { mkdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { storageConfig } from "../config.js";
import type { MediaBucket, StorageDriver } from "../types.js";

/**
 * Local-disk driver — the dev default, so uploads work end-to-end before any
 * AWS credentials exist. Objects live at {STORAGE_LOCAL_DIR}/{bucket}/{key}
 * and are served by @fastify/static at /uploads/{bucket}/{key} (registered in
 * the package facade). Switching to S3 is one env var; the object keys in the
 * database stay exactly the same.
 */

export const localRoot = resolve(process.cwd(), storageConfig.localDir);

/** Resolves and confines a key to the driver root (defense-in-depth). */
function filePath(bucket: MediaBucket, key: string): string {
  const path = resolve(join(localRoot, bucket, key));
  if (!path.startsWith(localRoot + sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return path;
}

export function createLocalDriver(): StorageDriver {
  // @fastify/static requires its root to exist at registration time.
  mkdirSync(localRoot, { recursive: true });
  return {
    async put(bucket, key, body) {
      const path = filePath(bucket, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },

    async get(bucket, key) {
      try {
        return await readFile(filePath(bucket, key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async remove(bucket, key) {
      await rm(filePath(bucket, key), { force: true });
    },

    publicUrl(bucket, key) {
      // Relative URL — same origin as the API. In dev the Vite proxy forwards
      // /uploads to the backend exactly like /api.
      return `/uploads/${bucket}/${key}`;
    },
  };
}
