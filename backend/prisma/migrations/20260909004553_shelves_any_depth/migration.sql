-- One shelf per taxonomy node per store; names are unique among siblings only
-- (enforced in the service), so the same name may appear under two parents.

-- DropIndex
DROP INDEX "store_categories_storeId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "store_categories_storeId_categoryId_key" ON "store_categories"("storeId", "categoryId");
