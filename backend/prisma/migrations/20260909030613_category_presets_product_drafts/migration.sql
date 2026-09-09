-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "optionTemplates" JSONB,
ADD COLUMN     "specTemplates" JSONB;

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Every product that exists today was created through the old one-shot form
-- and is therefore not a draft: stamp it as published when it was created.
UPDATE "store_products" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
