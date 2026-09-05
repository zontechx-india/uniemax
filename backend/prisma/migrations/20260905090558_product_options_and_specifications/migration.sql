-- AlterTable
ALTER TABLE "store_product_variants" ADD COLUMN     "optionValues" JSONB;

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "optionTypes" JSONB,
ADD COLUMN     "specifications" JSONB;
