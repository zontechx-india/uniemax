// MUST be first — decides which database this script reads from.
import "../config/loadEnv.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { appEnv } from "../config/loadEnv.js";
import { prisma } from "../config/prisma.js";
import { storageConfig } from "../package/storage/config.js";
import type { MediaBucket } from "../package/storage/types.js";

/**
 * Media audit — which S3 objects does the database still point at, and
 * which are dead weight?
 *
 * The DB stores object KEYS (Store.logoKey, StoreProductMedia.key,
 * OrderItem.imageKey) without the per-bucket folder prefix; the S3 driver
 * adds the prefix on the way out. This script rebuilds the full S3 key the
 * same way, so what it compares is exactly what sits in the bucket. Legacy
 * URL columns (Banner.imageUrl, Category.imageUrl, StoreSetting.logoUrl,
 * Customer.avatarUrl) are also scanned: a URL that points
 * into one of our buckets counts as a reference; external URLs are ignored.
 *
 * Both environments share ONE bucket, so an object is only truly orphaned
 * when NEITHER database references it. Run once per environment and merge:
 *
 *   npm run audit-media
 *   $env:APP_ENV="production"; npm run audit-media -- --merge migration-backups/media-audit-development.json
 *
 * The second run writes the merged report (objects tagged prod / dev / both /
 * NONE) plus a CSV of the NONE rows for manual review. Nothing is deleted
 * unless you pass `--delete-orphans --yes` together with `--merge`, which
 * removes ONLY objects referenced by neither database.
 *
 * Reports land in backend/migration-backups/ (gitignored — they name live
 * stores and products).
 */

interface Reference {
  table: string;
  column: string;
  id: string;
  /** Raw DB value (key or URL) so a row can be found again. */
  value: string;
}

interface S3Object {
  bucket: string;
  key: string;
  size: number;
  lastModified: string | null;
}

interface AuditFile {
  mode: string;
  generatedAt: string;
  /** "bucket/fullKey" → the DB rows pointing at it. */
  referenced: Record<string, Reference[]>;
  s3: S3Object[];
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const mergePath = option("--merge");
const outDir = option("--out") ?? "migration-backups";
const deleteOrphans = flag("--delete-orphans");
const confirmed = flag("--yes");

/** Full S3 key as the driver writes it: "<prefix>/<dbKey>". */
function fullKey(bucket: MediaBucket, dbKey: string): string {
  const prefix = storageConfig.buckets[bucket].keyPrefix;
  const clean = dbKey.replace(/^\/+/, "");
  return prefix ? `${prefix}/${clean}` : clean;
}

function refId(bucketName: string, key: string): string {
  return `${bucketName}/${key}`;
}

/**
 * Maps a legacy URL column to "bucket/fullKey" when it points into one of
 * our buckets (virtual-host or path style, or a configured CDN base).
 * Returns null for external URLs (OAuth avatars, pasted links…).
 */
function keyFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  for (const bucket of Object.values(storageConfig.buckets)) {
    if (bucket.publicBaseUrl) {
      const base = bucket.publicBaseUrl.replace(/\/+$/, "") + "/";
      if (value.startsWith(base)) return refId(bucket.name, value.slice(base.length));
    }
    if (url.hostname.startsWith(`${bucket.name}.s3`)) return refId(bucket.name, pathname);
    if (url.hostname.startsWith("s3.") && pathname.startsWith(`${bucket.name}/`)) {
      return refId(bucket.name, pathname.slice(bucket.name.length + 1));
    }
  }
  return null;
}

async function collectReferences(): Promise<Record<string, Reference[]>> {
  const referenced: Record<string, Reference[]> = {};
  const add = (id: string | null, ref: Reference) => {
    if (!id) return;
    (referenced[id] ??= []).push(ref);
  };

  const logoBucket = storageConfig.buckets.logo.name;
  const mediaBucket = storageConfig.buckets.media.name;

  const stores = await prisma.store.findMany({
    where: { logoKey: { not: null } },
    select: { id: true, name: true, logoKey: true },
  });
  for (const s of stores) {
    add(refId(logoBucket, fullKey("logo", s.logoKey!)), {
      table: "stores",
      column: "logoKey",
      id: `${s.id} (${s.name})`,
      value: s.logoKey!,
    });
  }

  const media = await prisma.storeProductMedia.findMany({
    select: {
      id: true,
      key: true,
      product: { select: { id: true, name: true, storeId: true } },
    },
  });
  for (const m of media) {
    add(refId(mediaBucket, fullKey("media", m.key)), {
      table: "store_product_media",
      column: "key",
      id: `${m.id} → product ${m.product.id} (${m.product.name})`,
      value: m.key,
    });
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { imageKey: { not: null } },
    select: { id: true, orderId: true, imageKey: true, productName: true },
  });
  for (const o of orderItems) {
    add(refId(mediaBucket, fullKey("media", o.imageKey!)), {
      table: "order_items",
      column: "imageKey",
      id: `${o.id} → order ${o.orderId} (${o.productName})`,
      value: o.imageKey!,
    });
  }

  // Legacy URL columns — only bucket-hosted URLs count.
  const urlRows: Array<{ table: string; column: string; id: string; value: string | null }> = [];
  for (const b of await prisma.banner.findMany({ select: { id: true, imageUrl: true } }))
    urlRows.push({ table: "banners", column: "imageUrl", id: b.id, value: b.imageUrl });
  for (const c of await prisma.category.findMany({ select: { id: true, imageUrl: true } }))
    urlRows.push({ table: "categories", column: "imageUrl", id: c.id, value: c.imageUrl });
  for (const s of await prisma.storeSetting.findMany({ select: { id: true, logoUrl: true } }))
    urlRows.push({ table: "store_settings", column: "logoUrl", id: s.id, value: s.logoUrl });
  for (const c of await prisma.customer.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, avatarUrl: true },
  }))
    urlRows.push({ table: "customers", column: "avatarUrl", id: c.id, value: c.avatarUrl });

  for (const row of urlRows) {
    if (!row.value) continue;
    add(keyFromUrl(row.value), { ...row, value: row.value });
  }

  return referenced;
}

function s3Client(): S3Client {
  const { region, accessKeyId, secretAccessKey } = storageConfig.aws;
  return new S3Client({
    ...(region ? { region } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

async function listBucket(client: S3Client, bucket: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key) continue;
      objects.push({
        bucket,
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

function publicUrl(bucket: string, key: string): string {
  const cfg = Object.values(storageConfig.buckets).find((b) => b.name === bucket);
  const base =
    cfg?.publicBaseUrl ??
    `https://${bucket}.s3.${storageConfig.aws.region ?? "us-east-1"}.amazonaws.com`;
  return `${base.replace(/\/+$/, "")}/${key}`;
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

async function main() {
  if (storageConfig.driver !== "s3") {
    throw new Error("STORAGE_DRIVER must be s3 — nothing to audit on local disk");
  }
  if (deleteOrphans && !mergePath) {
    throw new Error(
      "--delete-orphans needs --merge <other-env.json>: both databases must be accounted for before anything is removed",
    );
  }

  console.log(`Auditing media for mode "${appEnv}"…`);

  const referenced = await collectReferences();
  const referencedCount = Object.keys(referenced).length;
  console.log(`  DB references: ${referencedCount} distinct objects`);

  const client = s3Client();
  const bucketNames = [
    ...new Set(Object.values(storageConfig.buckets).map((b) => b.name)),
  ];
  const s3: S3Object[] = [];
  for (const bucket of bucketNames) {
    const objects = await listBucket(client, bucket);
    console.log(`  S3 ${bucket}: ${objects.length} objects`);
    s3.push(...objects);
  }

  mkdirSync(outDir, { recursive: true });
  const thisFile: AuditFile = {
    mode: appEnv,
    generatedAt: new Date().toISOString(),
    referenced,
    s3,
  };
  const jsonPath = path.join(outDir, `media-audit-${appEnv}.json`);
  writeFileSync(jsonPath, JSON.stringify(thisFile, null, 2));

  // Per-environment tagging: which env(s) reference each object.
  const envs: Array<{ mode: string; referenced: Record<string, Reference[]> }> = [
    { mode: appEnv, referenced },
  ];
  if (mergePath) {
    const other = JSON.parse(readFileSync(mergePath, "utf8")) as AuditFile;
    if (other.mode === appEnv) {
      throw new Error(`--merge file is for the same mode (${appEnv}); merge the OTHER environment`);
    }
    envs.push({ mode: other.mode, referenced: other.referenced });
  }

  const referencedBy = (id: string) =>
    envs.filter((e) => id in e.referenced).map((e) => e.mode);

  // Zero-byte "folder/" keys are console-created placeholders, not media —
  // reported separately so they never inflate the orphan count.
  const isFolderMarker = (o: S3Object) => o.key.endsWith("/") && o.size === 0;
  const folderMarkers = s3.filter(isFolderMarker);
  const orphans = s3.filter(
    (o) => !isFolderMarker(o) && referencedBy(refId(o.bucket, o.key)).length === 0,
  );
  const s3Ids = new Set(s3.map((o) => refId(o.bucket, o.key)));
  const broken = envs.flatMap((e) =>
    Object.entries(e.referenced)
      .filter(([id]) => !s3Ids.has(id))
      .map(([id, refs]) => ({ mode: e.mode, id, refs })),
  );

  const orphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);
  const totalBytes = s3.reduce((sum, o) => sum + o.size, 0);

  // Markdown report
  const lines: string[] = [];
  const title = mergePath ? `Media audit — ${envs.map((e) => e.mode).join(" + ")}` : `Media audit — ${appEnv}`;
  lines.push(`# ${title}`, "", `Generated ${thisFile.generatedAt}`, "");
  if (!mergePath) {
    lines.push(
      `> Only the **${appEnv}** database was checked. Both environments share the bucket, so "unreferenced here" does NOT mean deletable — re-run in the other mode with \`--merge ${jsonPath.replace(/\\/g, "/")}\` for the real orphan list.`,
      "",
    );
  }
  lines.push("## Summary", "");
  lines.push(`| Metric | Count | Size |`, `| --- | ---: | ---: |`);
  lines.push(`| Objects in S3 (${bucketNames.join(", ")}) | ${s3.length} | ${mb(totalBytes)} MB |`);
  for (const e of envs) {
    const ids = Object.keys(e.referenced);
    const bytes = s3.filter((o) => ids.includes(refId(o.bucket, o.key))).reduce((s, o) => s + o.size, 0);
    lines.push(`| Referenced by ${e.mode} DB | ${ids.length} | ${mb(bytes)} MB |`);
  }
  lines.push(
    `| ${mergePath ? "Referenced by NEITHER DB (orphans)" : `Not referenced by ${appEnv} DB`} | ${orphans.length} | ${mb(orphanBytes)} MB |`,
  );
  lines.push(`| Referenced in DB but missing from S3 (broken) | ${broken.length} | — |`);
  lines.push(`| Empty folder markers (ignored) | ${folderMarkers.length} | — |`, "");

  lines.push(`## ${mergePath ? "Orphans — safe to delete after manual check" : `Not referenced by ${appEnv}`}`, "");
  lines.push(`| # | Key | Size | Last modified | URL |`, `| ---: | --- | ---: | --- | --- |`);
  orphans
    .sort((a, b) => a.key.localeCompare(b.key))
    .forEach((o, i) =>
      lines.push(
        `| ${i + 1} | \`${o.key}\` | ${mb(o.size)} MB | ${o.lastModified?.slice(0, 10) ?? ""} | ${publicUrl(o.bucket, o.key)} |`,
      ),
    );
  lines.push("");

  lines.push("## Broken references (DB row points at a key that is not in S3)", "");
  if (broken.length === 0) lines.push("None.", "");
  else {
    lines.push(`| Env | Key | Referenced by |`, `| --- | --- | --- |`);
    for (const b of broken) {
      lines.push(
        `| ${b.mode} | \`${b.id}\` | ${b.refs.map((r) => `${r.table}.${r.column} ${r.id}`).join("<br>")} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Every S3 object and who references it", "");
  lines.push(`| Key | Size | Referenced by |`, `| --- | ---: | --- |`);
  for (const o of [...s3].sort((a, b) => a.key.localeCompare(b.key))) {
    const id = refId(o.bucket, o.key);
    const by = referencedBy(id);
    const rows = envs
      .flatMap((e) => (e.referenced[id] ?? []).map((r) => `${e.mode}: ${r.table}.${r.column} ${r.id}`))
      .join("<br>");
    lines.push(`| \`${o.key}\` | ${mb(o.size)} MB | ${by.length ? rows : "**NONE**"} |`);
  }
  lines.push("");

  const suffix = mergePath ? "merged" : appEnv;
  const mdPath = path.join(outDir, `media-audit-${suffix}.md`);
  writeFileSync(mdPath, lines.join("\n"));

  const csvPath = path.join(outDir, `media-audit-${suffix}-orphans.csv`);
  writeFileSync(
    csvPath,
    ["bucket,key,size_bytes,last_modified,url"]
      .concat(
        orphans.map((o) =>
          [o.bucket, o.key, o.size, o.lastModified ?? "", publicUrl(o.bucket, o.key)].join(","),
        ),
      )
      .join("\n"),
  );

  // Every object with its environment tag — filter this in a spreadsheet to
  // review e.g. "dev-only" media before deleting the owning rows in-app.
  const byEnvPath = path.join(outDir, `media-audit-${suffix}-all.csv`);
  writeFileSync(
    byEnvPath,
    ["bucket,key,size_bytes,last_modified,referenced_by,referenced_rows"]
      .concat(
        s3.map((o) => {
          const id = refId(o.bucket, o.key);
          const by = referencedBy(id);
          const rows = envs
            .flatMap((e) => (e.referenced[id] ?? []).map((r) => `${r.table}.${r.column} ${r.id}`))
            .join(" | ")
            .replace(/"/g, "'");
          return [
            o.bucket,
            o.key,
            o.size,
            o.lastModified ?? "",
            isFolderMarker(o) ? "folder-marker" : by.length ? by.join("+") : "NONE",
            `"${rows}"`,
          ].join(",");
        }),
      )
      .join("\n"),
  );

  console.log("");
  console.log(`  Referenced by neither DB / not by this DB: ${orphans.length} (${mb(orphanBytes)} MB)`);
  console.log(`  Wrote ${byEnvPath}`);
  console.log(`  Broken references: ${broken.length}`);
  console.log(`  Wrote ${jsonPath}`);
  console.log(`  Wrote ${mdPath}`);
  console.log(`  Wrote ${csvPath}`);

  if (deleteOrphans) {
    if (!confirmed) {
      console.log("");
      console.log(`  --delete-orphans given without --yes: would delete ${orphans.length} objects. Re-run with --yes to proceed.`);
      return;
    }
    let deleted = 0;
    for (const bucket of bucketNames) {
      const keys = orphans.filter((o) => o.bucket === bucket).map((o) => ({ Key: o.key }));
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }),
        );
        deleted += chunk.length;
      }
    }
    console.log(`  Deleted ${deleted} orphaned objects.`);
  }
}

main()
  .catch((error) => {
    console.error("❌ Media audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
