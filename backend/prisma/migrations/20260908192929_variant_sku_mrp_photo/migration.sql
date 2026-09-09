-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "store_product_variants" ADD COLUMN     "compareAtPrice" DECIMAL(10,2),
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "sku" TEXT;

-- CreateIndex
CREATE INDEX "store_product_variants_sku_idx" ON "store_product_variants"("sku");

-- CreateIndex
CREATE INDEX "store_product_variants_mediaId_idx" ON "store_product_variants"("mediaId");

-- AddForeignKey
ALTER TABLE "store_product_variants" ADD CONSTRAINT "store_product_variants_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "store_product_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
