// MUST be first — decides which database this script reads from.
import "../config/loadEnv.js";
import path from "node:path";
import { appEnv } from "../config/loadEnv.js";
import { prisma } from "../config/prisma.js";
import {
  getShareImage,
  newObjectKey,
  normalizeImage,
  sniffContentType,
  storage,
  type MediaBucket,
} from "../package/storage/index.js";

/**
 * Brings images uploaded before server-side normalization up to today's
 * rules (`package/storage/images.ts`), and pre-renders link-preview share
 * images so the first WhatsApp share of an old product is not the one that
 * waits.
 *
 * For every stored image — product photos, store logos, store banners,
 * marketplace banners:
 *
 *  1. The original is run through `normalizeImage`, the exact function new
 *     uploads go through. One that already meets the rules (what the
 *     browser editor produces) is left alone.
 *  2. One that does not (an oversized PNG/JPEG, a sideways phone photo) is
 *     stored under a NEW key and the row is switched to it — only if the row
 *     still holds the key that was read, so a seller editing at the same
 *     moment always wins. The old object is kept: order history snapshots
 *     (`OrderItem.imageKey`) and browser caches may still point at it;
 *     `npm run audit-media` reports it once nothing does.
 *  3. Product covers and store logos get their share image (small JPEG for
 *     `og:image`) rendered and stored, if it is not already there.
 *
 * Dry run by default — it reads and measures, writes nothing:
 *
 *   npm run optimize-media                       # report only
 *   npm run optimize-media -- --apply            # do it
 *   npm run optimize-media -- --apply --only=products,logos --limit=50
 *
 * Runs against the database of the current mode (like every script). Both
 * environments share one bucket but not their rows, so run it once per
 * environment: `$env:APP_ENV="production"; npm run optimize-media -- --apply`.
 * Safe to re-run: finished images are skipped.
 */

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((kind) => kind.trim());
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;

/** Images processed at once — each can decode a 50 MP photo, so keep it small. */
const CONCURRENCY = 3;

interface Item {
  /** Row id, shown in the report. */
  id: string;
  key: string;
  bucket: MediaBucket;
  rule: "image" | "logo";
  /** Render this image's share image (product covers, logos). */
  share: boolean;
  /** Switches the row to a new key iff it still holds `from`. Returns false if it had changed. */
  swap: (from: string, to: string) => Promise<boolean>;
}

interface Kind {
  name: string;
  load: () => Promise<Item[]>;
}

const KINDS: Kind[] = [
  {
    name: "products",
    async load() {
      const rows = await prisma.storeProductMedia.findMany({
        where: { type: "IMAGE" },
        orderBy: [{ productId: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, key: true, productId: true },
      });
      // The cover — first image by display order — is what og:image uses.
      const covers = new Set<string>();
      const seen = new Set<string>();
      for (const row of rows) {
        if (!seen.has(row.productId)) covers.add(row.id);
        seen.add(row.productId);
      }
      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        bucket: "media" as const,
        rule: "image" as const,
        share: covers.has(row.id),
        swap: async (from, to) =>
          (await prisma.storeProductMedia.updateMany({
            where: { id: row.id, key: from },
            data: { key: to },
          })).count === 1,
      }));
    },
  },
  {
    name: "logos",
    async load() {
      const rows = await prisma.store.findMany({
        where: { logoKey: { not: null } },
        select: { id: true, logoKey: true },
      });
      return rows.map((row) => ({
        id: row.id,
        key: row.logoKey!,
        bucket: "logo" as const,
        rule: "logo" as const,
        share: true,
        swap: async (from, to) =>
          (await prisma.store.updateMany({
            where: { id: row.id, logoKey: from },
            data: { logoKey: to },
          })).count === 1,
      }));
    },
  },
  {
    name: "store-banners",
    async load() {
      const rows = await prisma.storeBanner.findMany({ select: { id: true, imageKey: true } });
      return rows.map((row) => ({
        id: row.id,
        key: row.imageKey,
        bucket: "media" as const,
        rule: "image" as const,
        share: false,
        swap: async (from, to) =>
          (await prisma.storeBanner.updateMany({
            where: { id: row.id, imageKey: from },
            data: { imageKey: to },
          })).count === 1,
      }));
    },
  },
  {
    name: "marketplace-banners",
    async load() {
      const rows = await prisma.banner.findMany({ select: { id: true, imageKey: true } });
      return rows.map((row) => ({
        id: row.id,
        key: row.imageKey,
        bucket: "media" as const,
        rule: "image" as const,
        share: false,
        swap: async (from, to) =>
          (await prisma.banner.updateMany({
            where: { id: row.id, imageKey: from },
            data: { imageKey: to },
          })).count === 1,
      }));
    },
  },
];

interface Tally {
  checked: number;
  alreadyFine: number;
  optimized: number;
  bytesBefore: number;
  bytesAfter: number;
  shareImages: number;
  missing: string[];
  changedMeanwhile: string[];
  failed: string[];
}

async function processItem(item: Item, tally: Tally) {
  const original = await storage.get(item.bucket, item.key);
  if (!original) {
    tally.missing.push(`${item.id} → ${item.key}`);
    return;
  }
  const contentType = sniffContentType(original);
  if (!contentType?.startsWith("image/")) {
    tally.failed.push(`${item.id} → ${item.key} (not an image we can read)`);
    return;
  }

  let finalKey = item.key;
  const normalized = await normalizeImage(original, contentType, item.rule);
  if (!normalized.changed) {
    tally.alreadyFine += 1;
  } else {
    tally.optimized += 1;
    tally.bytesBefore += original.length;
    tally.bytesAfter += normalized.buffer.length;
    console.log(
      `  ${apply ? "optimize" : "would optimize"} ${item.key}  ${kb(original.length)} → ${kb(normalized.buffer.length)}`,
    );
    if (apply) {
      const newKey = newObjectKey(path.posix.dirname(item.key), normalized.contentType);
      await storage.put(item.bucket, newKey, normalized.buffer, normalized.contentType);
      if (await item.swap(item.key, newKey)) {
        finalKey = newKey;
      } else {
        // The row moved on while we worked; the new object is unreferenced
        // and `audit-media` will list it. Nothing else to undo.
        tally.changedMeanwhile.push(`${item.id} → ${item.key}`);
        return;
      }
    }
  }

  if (item.share) {
    if (apply) await getShareImage(item.bucket, finalKey);
    tally.shareImages += 1;
  }
}

async function main() {
  console.log(`optimize-media — mode=${appEnv} ${apply ? "APPLY" : "dry run (pass --apply to write)"}`);
  const kinds = only ? KINDS.filter((kind) => only.includes(kind.name)) : KINDS;
  if (only && kinds.length !== only.length) {
    throw new Error(`--only takes: ${KINDS.map((kind) => kind.name).join(", ")}`);
  }

  for (const kind of kinds) {
    const items = (await kind.load()).slice(0, limit);
    console.log(`\n${kind.name}: ${items.length} image(s)`);
    const tally: Tally = {
      checked: 0,
      alreadyFine: 0,
      optimized: 0,
      bytesBefore: 0,
      bytesAfter: 0,
      shareImages: 0,
      missing: [],
      changedMeanwhile: [],
      failed: [],
    };

    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const item = items[next++]!;
        tally.checked += 1;
        try {
          await processItem(item, tally);
        } catch (error) {
          tally.failed.push(`${item.id} → ${item.key} (${(error as Error).message})`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(
      [
        `  checked ${tally.checked} · already fine ${tally.alreadyFine}`,
        `${apply ? "optimized" : "to optimize"} ${tally.optimized} (${kb(tally.bytesBefore)} → ${kb(tally.bytesAfter)})`,
        `share images ${apply ? "ensured" : "to ensure"} ${tally.shareImages}`,
      ].join(" · "),
    );
    for (const [label, list] of [
      ["missing in storage", tally.missing],
      ["changed during the run (left as is)", tally.changedMeanwhile],
      ["failed", tally.failed],
    ] as const) {
      if (list.length) console.log(`  ${label}:\n    ${list.join("\n    ")}`);
    }
  }
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
