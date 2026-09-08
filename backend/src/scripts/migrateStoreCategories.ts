// MUST be first — decides which database this script writes to.
import "../config/loadEnv.js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import {
  SHELF_RULES,
  PRODUCT_STORE_DEFAULTS,
  normaliseName,
  type Mapping,
} from "./data/categoryMigrationRules.js";

/**
 * Classifies the seller-typed store catalog against the global taxonomy.
 *
 * What it writes, and nothing else:
 *   StoreCategory.categoryId       — the shelf's taxonomy tag
 *   StoreProduct.globalCategoryId  — the product's own classification
 *
 * Both columns are new and nullable. NOTHING existing is read-modified: shelf
 * names, slugs, parents, products and their `categoryId` links are never
 * touched, so the storefront renders exactly as it did before and the old
 * free-text values remain in place for as long as anyone wants to check the
 * migration against them.
 *
 * Safety properties the brief asks for:
 *   - Non-destructive — only null -> value, never value -> other value. A row
 *     someone has since classified by hand is left alone and counted as
 *     "already classified", which is also what makes re-running a no-op.
 *   - Idempotent — a second run reports 0 writes.
 *   - Transaction-safe — every write goes in one $transaction; a failure
 *     leaves the database exactly as it was.
 *   - Auditable — writes a full markdown report, including every row it
 *     refused to decide.
 *   - Reversible — snapshots both columns for every affected row before
 *     writing, and can restore that snapshot with --rollback.
 *
 * Ambiguity is a first-class outcome. "Bike" is not mapped to anything; nor is
 * a brand shelf ("KTM", "Apple") or a merchandising tier ("Pro Edition") — for
 * those, null IS the answer. Everything undecided is listed in the report.
 *
 *   npm run migrate-store-categories                    # dry run + report
 *   npm run migrate-store-categories -- --apply         # snapshot, then write
 *   npm run migrate-store-categories -- --rollback <snapshot.json>
 */

const BACKUP_DIR = "migration-backups";

type Decision = {
  storeName: string;
  storeSlug: string;
  path: string;
  name: string;
  outcome: "map" | "untagged" | "ambiguous" | "unmatched" | "already";
  // Explicitly `| undefined` rather than optional: the project runs with
  // exactOptionalPropertyTypes, and these are built by spreading.
  targetSlug?: string | undefined;
  targetPath?: string | undefined;
  why?: string | undefined;
  candidates?: string[] | undefined;
  productCount: number;
};

type ProductDecision = {
  storeSlug: string;
  productName: string;
  shelfPath: string;
  outcome: "inherited" | "store-default" | "unclassified" | "already";
  targetSlug?: string | undefined;
  targetPath?: string | undefined;
  why?: string | undefined;
};

type Snapshot = {
  takenAt: string;
  database: string;
  storeCategories: { id: string; categoryId: string | null }[];
  storeProducts: { id: string; globalCategoryId: string | null }[];
};

// ---------------------------------------------------------------------------
// Rule lookup
// ---------------------------------------------------------------------------

/** Store-scoped rules take precedence over generic ones for the same name. */
function buildRuleIndex() {
  const scoped = new Map<string, Mapping>();
  const generic = new Map<string, Mapping>();
  for (const rule of SHELF_RULES) {
    const key = normaliseName(rule.match);
    if (rule.store) scoped.set(`${rule.store}::${key}`, rule.mapping);
    else if (!generic.has(key)) generic.set(key, rule.mapping);
  }
  return (storeSlug: string, name: string): Mapping | null =>
    scoped.get(`${storeSlug}::${normaliseName(name)}`) ??
    generic.get(normaliseName(name)) ??
    null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport(
  shelves: Decision[],
  products: ProductDecision[],
  applied: boolean,
  snapshotPath: string | null,
): string {
  const count = (outcome: Decision["outcome"]) =>
    shelves.filter((d) => d.outcome === outcome).length;
  const pcount = (outcome: ProductDecision["outcome"]) =>
    products.filter((d) => d.outcome === outcome).length;

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`# Store category migration report`);
  push();
  push(`- Run: **${applied ? "APPLIED" : "DRY RUN (nothing written)"}**`);
  push(`- When: ${new Date().toISOString()}`);
  push(`- Database: ${dbLabel()}`);
  if (snapshotPath) push(`- Rollback snapshot: \`${snapshotPath}\``);
  push();

  push(`## Shelves (StoreCategory.categoryId)`);
  push();
  push(`| Outcome | Count | Meaning |`);
  push(`| --- | ---: | --- |`);
  push(`| Mapped | ${count("map")} | Tagged onto a taxonomy node |`);
  push(
    `| Intentionally untagged | ${count("untagged")} | A brand, vehicle model or merchandising tier — null is correct |`,
  );
  push(
    `| Ambiguous | ${count("ambiguous")} | Needs a human; left null |`,
  );
  push(
    `| No rule | ${count("unmatched")} | Nothing in the rule table matches; left null |`,
  );
  push(
    `| Already classified | ${count("already")} | Had a tag already; untouched |`,
  );
  push();

  push(`## Products (StoreProduct.globalCategoryId)`);
  push();
  push(`| Outcome | Count | Meaning |`);
  push(`| --- | ---: | --- |`);
  push(
    `| Inherited from shelf | ${pcount("inherited")} | Took its shelf's taxonomy tag |`,
  );
  push(
    `| Store-context default | ${pcount("store-default")} | Shelf untagged; classified from the store's product context |`,
  );
  push(
    `| Unclassified | ${pcount("unclassified")} | No safe answer; left null |`,
  );
  push(
    `| Already classified | ${pcount("already")} | Had a classification already; untouched |`,
  );
  push();

  section(push, "Mapped shelves", shelves.filter((d) => d.outcome === "map"), (d) =>
    `- **${d.storeSlug}** · ${d.path} → \`${d.targetPath}\` — ${d.why}`,
  );

  section(
    push,
    "Intentionally untagged (brands, vehicle models, merchandising tiers)",
    shelves.filter((d) => d.outcome === "untagged"),
    (d) =>
      `- **${d.storeSlug}** · ${d.path}${d.productCount ? ` (${d.productCount} product(s))` : ""} — ${d.why}`,
  );

  section(
    push,
    "NEEDS MANUAL REVIEW — ambiguous",
    shelves.filter((d) => d.outcome === "ambiguous"),
    (d) =>
      `- **${d.storeSlug}** · ${d.path}${d.productCount ? ` (${d.productCount} product(s))` : ""}\n  - Why: ${d.why}\n  - Candidates: ${(d.candidates ?? []).map((c) => `\`${c}\``).join(", ")}`,
  );

  section(
    push,
    "NEEDS MANUAL REVIEW — no rule matched",
    shelves.filter((d) => d.outcome === "unmatched"),
    (d) =>
      `- **${d.storeSlug}** · ${d.path}${d.productCount ? ` (${d.productCount} product(s))` : ""}`,
  );

  section(
    push,
    "Products classified from store context (shelf had no tag)",
    products.filter((d) => d.outcome === "store-default"),
    (d) =>
      `- **${d.storeSlug}** · ${d.shelfPath} · ${d.productName} → \`${d.targetPath}\``,
  );

  section(
    push,
    "NEEDS MANUAL REVIEW — products left unclassified",
    products.filter((d) => d.outcome === "unclassified"),
    (d) => `- **${d.storeSlug}** · ${d.shelfPath} · ${d.productName}`,
  );

  push(`## Taxonomy gaps noticed while mapping`);
  push();
  push(
    `Real shelves with no good home in the seeded taxonomy. They were mapped to`,
  );
  push(`the nearest ancestor rather than forced into a wrong leaf:`);
  push();
  push(`- **Televisions** (LED / QLED / OLED / Android TV) → \`Electronics\` root`);
  push(`- **Smart Home** as an umbrella → left ambiguous`);
  push(`- **Bakery / cakes** → \`Grocery & Food\` root`);
  push(`- **Smart watches / fitness bands** → left ambiguous`);
  push();
  push(
    `Adding these nodes to the taxonomy and re-running would sharpen those rows;`,
  );
  push(`the migration never overwrites, so a re-run only fills what is still null.`);
  push();

  return lines.join("\n");
}

function section<T>(
  push: (s?: string) => void,
  title: string,
  rows: T[],
  render: (row: T) => string,
) {
  push(`## ${title} (${rows.length})`);
  push();
  if (rows.length === 0) push(`_None._`);
  else for (const row of rows) push(render(row));
  push();
}

const dbLabel = () => {
  try {
    return new URL(env.DATABASE_URL!).host;
  } catch {
    return "unknown";
  }
};

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

async function rollback(file: string) {
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  console.log(
    `Restoring ${snapshot.storeCategories.length} shelf tag(s) and ` +
      `${snapshot.storeProducts.length} product classification(s) ` +
      `from ${snapshot.takenAt} (${snapshot.database}).`,
  );
  if (snapshot.database !== dbLabel()) {
    throw new Error(
      `Snapshot was taken against ${snapshot.database}, but this run targets ` +
        `${dbLabel()}. Refusing to restore across databases.`,
    );
  }

  await prisma.$transaction([
    ...snapshot.storeCategories.map((row) =>
      prisma.storeCategory.update({
        where: { id: row.id },
        data: { categoryId: row.categoryId },
      }),
    ),
    ...snapshot.storeProducts.map((row) =>
      prisma.storeProduct.update({
        where: { id: row.id },
        data: { globalCategoryId: row.globalCategoryId },
      }),
    ),
  ]);
  console.log("Rollback complete — both columns are back to their snapshot values.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply");
  const rollbackIndex = process.argv.indexOf("--rollback");
  if (rollbackIndex !== -1) {
    const file = process.argv[rollbackIndex + 1];
    if (!file) throw new Error("--rollback needs a snapshot file path.");
    return rollback(file);
  }

  // Every rule target must exist, or the run would silently under-migrate.
  const taxonomy = await prisma.category.findMany({
    select: { id: true, slug: true, name: true, parentId: true },
  });
  if (taxonomy.length === 0) {
    throw new Error(
      "The global taxonomy is empty — run `npm run seed-categories` first.",
    );
  }
  const bySlug = new Map(taxonomy.map((row) => [row.slug, row]));
  const byId = new Map(taxonomy.map((row) => [row.id, row]));
  const pathOf = (slug: string): string => {
    const crumbs: string[] = [];
    let cursor = bySlug.get(slug);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      crumbs.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return crumbs.join(" > ");
  };

  const targets = new Set<string>();
  for (const rule of SHELF_RULES) {
    if (rule.mapping.kind === "map") targets.add(rule.mapping.slug);
    if (rule.mapping.kind === "ambiguous")
      rule.mapping.candidates.forEach((c) => targets.add(c));
  }
  PRODUCT_STORE_DEFAULTS.forEach((d) => targets.add(d.slug));
  const missing = [...targets].filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    throw new Error(
      `Rules point at taxonomy slugs that do not exist: ${missing.join(", ")}`,
    );
  }

  // Fallback after the explicit rules: a shelf whose name IS a taxonomy node
  // name is that node — the safest possible mapping, and it leaves the rule
  // table to handle the cases where the words genuinely disagree. Only applied
  // when exactly one node carries the name; "Accessories" exists twice
  // (Electronics and Musical Instruments), so it stays a decision for a human.
  const taxonomyByName = new Map<string, typeof taxonomy>();
  for (const node of taxonomy) {
    const key = normaliseName(node.name);
    const bucket = taxonomyByName.get(key);
    if (bucket) bucket.push(node);
    else taxonomyByName.set(key, [node]);
  }
  const matchByName = (name: string): Mapping | null => {
    const hits = taxonomyByName.get(normaliseName(name));
    if (!hits || hits.length === 0) return null;
    if (hits.length > 1) {
      return {
        kind: "ambiguous",
        why: `Several taxonomy nodes share the name "${name}"`,
        candidates: hits.map((hit) => hit.slug),
      };
    }
    return {
      kind: "map",
      slug: hits[0]!.slug,
      why: "Shelf name matches a taxonomy node name exactly",
    };
  };

  const rules = buildRuleIndex();
  const lookup = (storeSlug: string, name: string): Mapping | null =>
    rules(storeSlug, name) ?? matchByName(name);
  const storeDefaults = new Map(
    PRODUCT_STORE_DEFAULTS.map((d) => [d.store, d]),
  );

  const stores = await prisma.store.findMany({
    select: {
      name: true,
      slug: true,
      categories: {
        select: {
          id: true,
          name: true,
          parentId: true,
          categoryId: true,
          products: {
            select: { id: true, name: true, globalCategoryId: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const shelfDecisions: Decision[] = [];
  const productDecisions: ProductDecision[] = [];
  const shelfWrites: { id: string; categoryId: string }[] = [];
  const productWrites: { id: string; globalCategoryId: string }[] = [];

  for (const store of stores) {
    const byShelfId = new Map(store.categories.map((c) => [c.id, c]));
    const shelfPath = (shelf: (typeof store.categories)[number]) => {
      const parent = shelf.parentId ? byShelfId.get(shelf.parentId) : null;
      return parent ? `${parent.name} > ${shelf.name}` : shelf.name;
    };

    // Resolved taxonomy id per shelf — the shelf's own tag if it has one, or
    // the one this run is about to give it. Products read from this.
    const resolvedShelfTag = new Map<string, string | null>();

    for (const shelf of store.categories) {
      const path = shelfPath(shelf);
      const base = {
        storeName: store.name,
        storeSlug: store.slug,
        path,
        name: shelf.name,
        productCount: shelf.products.length,
      };

      if (shelf.categoryId) {
        // Never overwrite an existing tag — that is what keeps this
        // non-destructive and makes a second run a no-op.
        resolvedShelfTag.set(shelf.id, shelf.categoryId);
        shelfDecisions.push({
          ...base,
          outcome: "already",
          targetSlug: byId.get(shelf.categoryId)?.slug,
          targetPath: byId.get(shelf.categoryId)
            ? pathOf(byId.get(shelf.categoryId)!.slug)
            : undefined,
        });
        continue;
      }

      const mapping = lookup(store.slug, shelf.name);
      if (!mapping) {
        resolvedShelfTag.set(shelf.id, null);
        shelfDecisions.push({ ...base, outcome: "unmatched" });
        continue;
      }

      if (mapping.kind === "map") {
        const target = bySlug.get(mapping.slug)!;
        resolvedShelfTag.set(shelf.id, target.id);
        shelfWrites.push({ id: shelf.id, categoryId: target.id });
        shelfDecisions.push({
          ...base,
          outcome: "map",
          targetSlug: mapping.slug,
          targetPath: pathOf(mapping.slug),
          why: mapping.why,
        });
        continue;
      }

      resolvedShelfTag.set(shelf.id, null);
      shelfDecisions.push({
        ...base,
        outcome: mapping.kind,
        why: mapping.why,
        candidates: mapping.kind === "ambiguous" ? mapping.candidates : undefined,
      });
    }

    // --- products -------------------------------------------------------
    const fallback = storeDefaults.get(store.slug);
    for (const shelf of store.categories) {
      for (const product of shelf.products) {
        const base = {
          storeSlug: store.slug,
          productName: product.name,
          shelfPath: shelfPath(shelf),
        };

        if (product.globalCategoryId) {
          productDecisions.push({ ...base, outcome: "already" });
          continue;
        }

        const inherited = resolvedShelfTag.get(shelf.id) ?? null;
        if (inherited) {
          const slug = byId.get(inherited)!.slug;
          productWrites.push({ id: product.id, globalCategoryId: inherited });
          productDecisions.push({
            ...base,
            outcome: "inherited",
            targetSlug: slug,
            targetPath: pathOf(slug),
          });
          continue;
        }

        // The shelf gave no answer. A store-level rule may still know one,
        // justified by the store's actual product mix.
        if (fallback) {
          const target = bySlug.get(fallback.slug)!;
          productWrites.push({ id: product.id, globalCategoryId: target.id });
          productDecisions.push({
            ...base,
            outcome: "store-default",
            targetSlug: fallback.slug,
            targetPath: pathOf(fallback.slug),
            why: fallback.why,
          });
          continue;
        }

        productDecisions.push({ ...base, outcome: "unclassified" });
      }
    }
  }

  // --- write ------------------------------------------------------------
  let snapshotPath: string | null = null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(BACKUP_DIR, { recursive: true });

  if (apply && (shelfWrites.length > 0 || productWrites.length > 0)) {
    // Snapshot BEFORE the transaction, covering exactly the rows about to
    // change, so --rollback can put both columns back verbatim.
    const snapshot: Snapshot = {
      takenAt: new Date().toISOString(),
      database: dbLabel(),
      storeCategories: shelfWrites.map((w) => ({ id: w.id, categoryId: null })),
      storeProducts: productWrites.map((w) => ({
        id: w.id,
        globalCategoryId: null,
      })),
    };
    snapshotPath = join(BACKUP_DIR, `snapshot-${stamp}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    await prisma.$transaction([
      ...shelfWrites.map((w) =>
        prisma.storeCategory.update({
          where: { id: w.id },
          data: { categoryId: w.categoryId },
        }),
      ),
      ...productWrites.map((w) =>
        prisma.storeProduct.update({
          where: { id: w.id },
          data: { globalCategoryId: w.globalCategoryId },
        }),
      ),
    ]);
  }

  const report = buildReport(
    shelfDecisions,
    productDecisions,
    apply,
    snapshotPath,
  );
  const reportPath = join(
    BACKUP_DIR,
    `report-${apply ? "applied" : "dryrun"}-${stamp}.md`,
  );
  writeFileSync(reportPath, report);

  console.log(report);
  console.log(`\nReport written to ${reportPath}`);
  if (!apply) {
    console.log(
      `\nDRY RUN — nothing was written. ${shelfWrites.length} shelf tag(s) and ` +
        `${productWrites.length} product classification(s) are ready to apply. ` +
        `Re-run with --apply.`,
    );
  } else {
    console.log(
      `\nAPPLIED — ${shelfWrites.length} shelf tag(s), ` +
        `${productWrites.length} product classification(s). ` +
        (snapshotPath
          ? `Undo with: npm run migrate-store-categories -- --rollback ${snapshotPath}`
          : `Nothing needed writing.`),
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
