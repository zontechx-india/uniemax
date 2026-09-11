-- DropIndex
DROP INDEX "store_products_storeId_hiddenByGroup_idx";

-- AlterTable
ALTER TABLE "product_group_members" DROP COLUMN "isPrimary";

-- AlterTable
ALTER TABLE "store_products" DROP COLUMN "hiddenByGroup";
