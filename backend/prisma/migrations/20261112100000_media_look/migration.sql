-- Which look (option + value, e.g. "Colour" / "Pink") a product photo shows,
-- so a colour can have several photos and the product page shows only that
-- colour's photos. Additive; null = shared photo, which is what every
-- existing photo already is.

-- AlterTable
ALTER TABLE "public"."store_product_media" ADD COLUMN "lookOption" TEXT,
ADD COLUMN "lookValue" TEXT;
