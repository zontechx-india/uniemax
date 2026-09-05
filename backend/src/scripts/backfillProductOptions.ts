// MUST be first — decides which database this script writes to.
import "../config/loadEnv.js";
import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { LEGACY_OPTION_NAME } from "../modules/stores/productOptions.js";

/**
 * One-off migration helper: gives every product that predates structured
 * options the single implicit option type it always had.
 *
 * Before option types existed a variant was free text ("Red / 128 GB"). Under
 * the structured model every variant is a combination of option values, so
 * each legacy product gets one type named "Option" whose values are its old
 * variant names, and each variant gets `{ Option: <name> }`. The derived label
 * is the old name unchanged, so `@@unique([productId, name])`, order
 * snapshots and cart lines are all untouched. The seller renames "Option" to
 * "Size" (or whatever it really was) from the product editor.
 *
 * `deriveProductOptions()` performs this same synthesis at read time, so the
 * app is correct before AND after this runs; the script simply makes the data
 * explicit so the read-time net can one day be retired.
 *
 * Safe to re-run — products that already have option types are skipped.
 * Simple products (only the implicit Default) are left alone.
 *
 *   npm run backfill-product-options            # writes
 *   npm run backfill-product-options -- --dry-run   # prints the plan only
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  let migrated = 0;
  let skippedSimple = 0;
  let skippedMixed = 0;

  const products = await prisma.storeProduct.findMany({
    where: { optionTypes: { equals: Prisma.DbNull } },
    select: {
      id: true,
      name: true,
      variants: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, isDefault: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const product of products) {
    const real = product.variants.filter((variant) => !variant.isDefault);

    if (real.length === 0) {
      skippedSimple += 1;
      continue;
    }
    // A Default alongside real variants should be impossible (every path that
    // creates real variants deletes it); refuse to guess rather than bake the
    // anomaly in.
    if (real.length !== product.variants.length) {
      console.warn(
        `SKIP  ${product.id} "${product.name}" — Default coexists with ${real.length} real variant(s)`,
      );
      skippedMixed += 1;
      continue;
    }

    const optionTypes = [
      { name: LEGACY_OPTION_NAME, values: real.map((variant) => variant.name) },
    ];
    console.log(
      `${dryRun ? "PLAN " : "WRITE"} ${product.id} "${product.name}" → ` +
        `${LEGACY_OPTION_NAME}: [${optionTypes[0]!.values.join(", ")}]`,
    );

    if (!dryRun) {
      await prisma.$transaction([
        prisma.storeProduct.update({
          where: { id: product.id },
          data: { optionTypes: optionTypes as unknown as Prisma.InputJsonValue },
        }),
        ...real.map((variant) =>
          prisma.storeProductVariant.update({
            where: { id: variant.id },
            data: {
              optionValues: {
                [LEGACY_OPTION_NAME]: variant.name,
              } as unknown as Prisma.InputJsonValue,
            },
          }),
        ),
      ]);
    }
    migrated += 1;
  }

  console.log(
    `${dryRun ? "Dry run" : "Backfill"} complete: ${migrated} product(s) ` +
      `${dryRun ? "would be " : ""}given an "${LEGACY_OPTION_NAME}" type, ` +
      `${skippedSimple} simple product(s) untouched, ${skippedMixed} skipped as anomalous.`,
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
