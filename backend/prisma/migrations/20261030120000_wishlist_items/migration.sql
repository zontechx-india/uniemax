-- Wishlist: products a customer saved with the heart button. One row per
-- customer per product; deleting either deletes the row.
-- CreateTable
CREATE TABLE "public"."wishlist_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wishlist_items_productId_idx" ON "public"."wishlist_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_customerId_productId_key" ON "public"."wishlist_items"("customerId", "productId");

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
