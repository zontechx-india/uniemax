-- CreateEnum
CREATE TYPE "BannerLinkType" AS ENUM ('NONE', 'STORE', 'URL');

-- DropIndex
DROP INDEX "banners_isActive_idx";

-- AlterTable
ALTER TABLE "banners" DROP COLUMN "imageUrl",
DROP COLUMN "linkUrl",
ADD COLUMN     "imageKey" TEXT NOT NULL,
ADD COLUMN     "linkType" "BannerLinkType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "linkValue" TEXT;

-- CreateIndex
CREATE INDEX "banners_isActive_displayOrder_idx" ON "banners"("isActive", "displayOrder");

