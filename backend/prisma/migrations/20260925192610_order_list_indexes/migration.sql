-- DropIndex
DROP INDEX "orders_customerId_idx";

-- DropIndex
DROP INDEX "orders_storeId_idx";

-- CreateIndex
CREATE INDEX "orders_storeId_placedAt_idx" ON "orders"("storeId", "placedAt");

-- CreateIndex
CREATE INDEX "orders_customerId_placedAt_idx" ON "orders"("customerId", "placedAt");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_idx" ON "orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "store_products_storeId_isActive_createdAt_idx" ON "store_products"("storeId", "isActive", "createdAt");
