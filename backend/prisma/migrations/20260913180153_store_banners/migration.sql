-- CreateEnum
CREATE TYPE "StoreBannerLinkType" AS ENUM ('NONE', 'CATEGORY', 'PRODUCT', 'URL');

-- CreateTable
CREATE TABLE "store_banners" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "mobileImageKey" TEXT,
    "title" TEXT,
    "linkType" "StoreBannerLinkType" NOT NULL DEFAULT 'NONE',
    "linkValue" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_banners_storeId_displayOrder_idx" ON "store_banners"("storeId", "displayOrder");

-- AddForeignKey
ALTER TABLE "store_banners" ADD CONSTRAINT "store_banners_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

