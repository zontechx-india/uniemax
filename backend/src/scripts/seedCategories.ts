// MUST be first — decides which database this script writes to.
import "../config/loadEnv.js";
import { prisma } from "../config/prisma.js";
import { slugify } from "../utils/slug.js";
import {
  GLOBAL_CATEGORIES,
  type SeedCategory,
} from "./data/globalCategories.js";
import { CATEGORY_PRESETS } from "./data/categoryPresets.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * Seed the global category taxonomy (`Category`) from `data/globalCategories.ts`.
 *
 * Idempotent: every node is `upsert`ed **by slug**, so re-running never
 * duplicates a category and never needs a hardcoded id — a child's `parentId`
 * is resolved from the id the parent's own upsert just returned. Parents are
 * always written before their children, at any depth.
 *
 * A re-run realigns `name`, `parentId` and `displayOrder` with this file (it
 * is the source of truth for the tree's shape) but deliberately leaves
 * `isActive`, `description` and `imageUrl` alone — those are admin decisions,
 * and a seed must not silently re-enable a category someone switched off.
 * Categories that exist in the database but not in this file are left
 * untouched: the seed only adds and corrects, it never deletes.
 *
 *   npm run seed-categories
 *   npm run seed-categories -- --dry-run      # report, write nothing
 *   $env:APP_ENV="production"; npm run seed-categories   # against production
 */

type ResolvedCategory = {
  name: string;
  slug: string;
  parentSlug: string | null;
  displayOrder: number;
  depth: number;
};

const tokens = (slug: string) => slug.split("-").filter(Boolean);

/**
 * `Category.slug` is unique platform-wide while names are only unique among
 * siblings ("Men" sits under both Fashion and Shoes & Footwear), so a child
 * slug is namespaced under its parent. Two cases skip the prefix because it
 * would only stutter:
 *   - the name already opens with the parent slug — Fashion > Fashion
 *     Accessories -> `fashion-accessories`;
 *   - the name is built purely from words the parent already carries —
 *     Home & Kitchen > Kitchen -> `kitchen`.
 * Both stay shorter than the parent's own slug or distinct from it, so
 * neither can collide with the parent. The full slug list is checked for
 * duplicates before anything is written.
 */
function deriveSlug(name: string, parentSlug: string | null): string {
  const base = slugify(name);
  if (!parentSlug || !base) return base;
  if (base === parentSlug || base.startsWith(`${parentSlug}-`)) return base;
  const parentTokens = tokens(parentSlug);
  if (tokens(base).every((token) => parentTokens.includes(token))) return base;
  return `${parentSlug}-${base}`;
}

/** Depth-first, parents before children — the order rows must be written in. */
function flatten(
  nodes: SeedCategory[],
  parentSlug: string | null,
  depth: number,
  out: ResolvedCategory[],
): ResolvedCategory[] {
  nodes.forEach((node, index) => {
    const slug = node.slug ?? deriveSlug(node.name, parentSlug);
    out.push({ name: node.name, slug, parentSlug, displayOrder: index, depth });
    if (node.children?.length) flatten(node.children, slug, depth + 1, out);
  });
  return out;
}

/** Fail before touching the database rather than half-way through it. */
function validate(rows: ResolvedCategory[]) {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!row.slug) {
      throw new Error(`"${row.name}" produced an empty slug.`);
    }
    if (slugify(row.slug) !== row.slug) {
      throw new Error(`"${row.name}" has a non URL-safe slug: "${row.slug}".`);
    }
    const owner = seen.get(row.slug);
    if (owner) {
      throw new Error(
        `Slug "${row.slug}" is claimed by both "${owner}" and "${row.name}" — ` +
          `pin a distinct \`slug\` on one of them in data/globalCategories.ts.`,
      );
    }
    seen.set(row.slug, row.name);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const flat = flatten(GLOBAL_CATEGORIES, null, 0, []);
  validate(flat);

  const existing = new Map(
    (
      await prisma.category.findMany({
        where: { slug: { in: flat.map((row) => row.slug) } },
        select: {
          slug: true,
          name: true,
          parentId: true,
          displayOrder: true,
          optionTemplates: true,
          specTemplates: true,
        },
      })
    ).map((row) => [row.slug, row]),
  );

  const idBySlug = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let presetsFilled = 0;
  for (const key of Object.keys(CATEGORY_PRESETS)) {
    if (!flat.some((row) => row.slug === key)) {
      console.warn(`! preset for unknown slug "${key}" — check data/categoryPresets.ts`);
    }
  }

  for (const row of flat) {
    const parentId = row.parentSlug ? idBySlug.get(row.parentSlug)! : null;
    const indent = "  ".repeat(row.depth + 1);
    const before = existing.get(row.slug);

    if (dryRun) {
      // Ids are only known after a write, so a dry run can't resolve a parent
      // id for a category that doesn't exist yet — it reports intent only.
      if (!before) created += 1;
      else if (
        before.name !== row.name ||
        before.parentId !== parentId ||
        before.displayOrder !== row.displayOrder
      )
        updated += 1;
      else unchanged += 1;
      console.log(`${indent}${before ? "=" : "+"} ${row.name}  (${row.slug})`);
      continue;
    }

    const preset = CATEGORY_PRESETS[row.slug];
    const saved = await prisma.category.upsert({
      where: { slug: row.slug },
      create: {
        name: row.name,
        slug: row.slug,
        parentId,
        displayOrder: row.displayOrder,
        isActive: true,
        ...(preset?.options
          ? { optionTemplates: preset.options as unknown as Prisma.InputJsonValue }
          : {}),
        ...(preset?.specs ? { specTemplates: preset.specs } : {}),
      },
      // isActive / description / imageUrl stay as the admin left them.
      update: {
        name: row.name,
        parentId,
        displayOrder: row.displayOrder,
      },
      select: { id: true },
    });
    idBySlug.set(row.slug, saved.id);

    // Presets fill in only where nothing was ever set (null). An admin who
    // wants none saves an empty list, which the seed leaves alone.
    if (before && preset) {
      const fill: Prisma.CategoryUncheckedUpdateInput = {};
      if (before.optionTemplates === null && preset.options) {
        fill.optionTemplates = preset.options as unknown as Prisma.InputJsonValue;
      }
      if (before.specTemplates === null && preset.specs) fill.specTemplates = preset.specs;
      if (Object.keys(fill).length > 0) {
        await prisma.category.update({ where: { id: saved.id }, data: fill });
        presetsFilled += 1;
      }
    }

    if (!before) {
      created += 1;
      console.log(`${indent}+ ${row.name}  (${row.slug})`);
    } else if (
      before.name !== row.name ||
      before.parentId !== parentId ||
      before.displayOrder !== row.displayOrder
    ) {
      updated += 1;
      console.log(`${indent}~ ${row.name}  (${row.slug})`);
    } else {
      unchanged += 1;
    }
  }

  const roots = flat.filter((row) => row.depth === 0).length;
  console.log(
    `\n${dryRun ? "[dry run] " : ""}${flat.length} categories in the taxonomy ` +
      `(${roots} top-level, ${flat.length - roots} sub): ` +
      `${created} created, ${updated} updated, ${unchanged} already current, ` +
      `${presetsFilled} given their preset suggestions.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
