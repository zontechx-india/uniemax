-- AlterTable
ALTER TABLE "store_categories" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "globalCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "store_categories_categoryId_idx" ON "store_categories"("categoryId");

-- CreateIndex
CREATE INDEX "store_products_globalCategoryId_idx" ON "store_products"("globalCategoryId");

-- AddForeignKey
ALTER TABLE "store_categories" ADD CONSTRAINT "store_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_globalCategoryId_fkey" FOREIGN KEY ("globalCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
