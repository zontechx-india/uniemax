-- Variant photo lists: each variant keeps an ORDERED list of the product's
-- photos (many to many), so one photo can show several colours and a colour
-- can have several photos. Replaces v1.106's one-colour-per-photo tags.
--
-- Order matters: create the table, copy today's data into it, and only then
-- drop the old columns, so no photo link is lost.

-- CreateTable
CREATE TABLE "public"."store_product_variant_media" (
    "variantId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "store_product_variant_media_pkey" PRIMARY KEY ("variantId","mediaId")
);

-- CreateIndex
CREATE INDEX "store_product_variant_media_mediaId_idx" ON "public"."store_product_variant_media"("mediaId");

-- AddForeignKey
ALTER TABLE "public"."store_product_variant_media" ADD CONSTRAINT "store_product_variant_media_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."store_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_variant_media" ADD CONSTRAINT "store_product_variant_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public"."store_product_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: every variant's own photo becomes position 0 (its main photo).
INSERT INTO "public"."store_product_variant_media" ("variantId", "mediaId", "position")
SELECT v."id", v."mediaId", 0
FROM "public"."store_product_variants" v
WHERE v."mediaId" IS NOT NULL;

-- Backfill 2: v1.106 colour tags. A photo tagged "Colour" / "Pink" joins the
-- list of every variant whose Colour is Pink, after its main photo, in
-- gallery order.
INSERT INTO "public"."store_product_variant_media" ("variantId", "mediaId", "position")
SELECT t."variantId", t."mediaId", t."position"
FROM (
  SELECT v."id" AS "variantId",
         m."id" AS "mediaId",
         ROW_NUMBER() OVER (PARTITION BY v."id" ORDER BY m."displayOrder", m."createdAt")::int AS "position"
  FROM "public"."store_product_media" m
  JOIN "public"."store_product_variants" v ON v."productId" = m."productId"
  WHERE m."lookOption" IS NOT NULL
    AND m."lookValue" IS NOT NULL
    AND v."optionValues" ->> m."lookOption" = m."lookValue"
) t
ON CONFLICT ("variantId", "mediaId") DO NOTHING;

-- A variant that got tagged photos but had no main photo: its first becomes main.
UPDATE "public"."store_product_variants" v
SET "mediaId" = first."mediaId"
FROM (
  SELECT DISTINCT ON ("variantId") "variantId", "mediaId"
  FROM "public"."store_product_variant_media"
  ORDER BY "variantId", "position"
) first
WHERE v."id" = first."variantId" AND v."mediaId" IS NULL;

-- AlterTable: the tags now live in the lists.
ALTER TABLE "public"."store_product_media" DROP COLUMN "lookOption",
DROP COLUMN "lookValue";
