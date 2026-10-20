-- CreateEnum
CREATE TYPE "dropship"."ResaleState" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "dropship"."PauseReason" AS ENUM ('COST_ABOVE_PRICE', 'SUPPLY_CLOSED', 'SUPPLIER_INACTIVE', 'LINK_INACTIVE', 'SOURCE_REMOVED');

-- CreateTable
CREATE TABLE "dropship"."resales" (
    "id" TEXT NOT NULL,
    "sellerStoreId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplyProductId" TEXT NOT NULL,
    "followCost" BOOLEAN NOT NULL DEFAULT true,
    "state" "dropship"."ResaleState" NOT NULL DEFAULT 'ACTIVE',
    "pauseReason" "dropship"."PauseReason",
    "resumeOnClear" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."resale_variants" (
    "id" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplyVariantId" TEXT NOT NULL,
    "lastCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "resale_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resales_productId_key" ON "dropship"."resales"("productId");

-- CreateIndex
CREATE INDEX "resales_linkId_idx" ON "dropship"."resales"("linkId");

-- CreateIndex
CREATE INDEX "resales_supplyProductId_idx" ON "dropship"."resales"("supplyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "resales_sellerStoreId_supplyProductId_key" ON "dropship"."resales"("sellerStoreId", "supplyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "resale_variants_variantId_key" ON "dropship"."resale_variants"("variantId");

-- CreateIndex
CREATE INDEX "resale_variants_resaleId_idx" ON "dropship"."resale_variants"("resaleId");

-- CreateIndex
CREATE INDEX "resale_variants_supplyVariantId_idx" ON "dropship"."resale_variants"("supplyVariantId");

-- AddForeignKey
ALTER TABLE "dropship"."resales" ADD CONSTRAINT "resales_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dropship"."supplier_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."resales" ADD CONSTRAINT "resales_supplyProductId_fkey" FOREIGN KEY ("supplyProductId") REFERENCES "dropship"."supply_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."resale_variants" ADD CONSTRAINT "resale_variants_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "dropship"."resales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

