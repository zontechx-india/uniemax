-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "dropship";

-- CreateEnum
CREATE TYPE "dropship"."SupplierStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "dropship"."SupplierVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "dropship"."InviteStatus" AS ENUM ('SENT', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "dropship"."LinkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "dropship"."ReturnFeePayer" AS ENUM ('SELLER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "dropship"."DropshipActor" AS ENUM ('SUPPLIER', 'SELLER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "dropship"."suppliers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplyOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "dropship"."SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "dropship"."SupplierVisibility" NOT NULL DEFAULT 'PRIVATE',
    "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shipWithinDays" INTEGER NOT NULL,
    "returnDays" INTEGER NOT NULL,
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supplier_invites" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sellerStoreId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "codAllowed" BOOLEAN NOT NULL,
    "returnFeePayer" "dropship"."ReturnFeePayer" NOT NULL,
    "status" "dropship"."InviteStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "linkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supplier_links" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sellerStoreId" TEXT NOT NULL,
    "codAllowed" BOOLEAN NOT NULL,
    "returnFeePayer" "dropship"."ReturnFeePayer" NOT NULL,
    "status" "dropship"."LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusBy" "dropship"."DropshipActor",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supply_products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supply_variants" (
    "id" TEXT NOT NULL,
    "supplyProductId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "supply_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."terms_changes" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "linkId" TEXT,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAs" "dropship"."DropshipActor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_storeId_key" ON "dropship"."suppliers"("storeId");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "dropship"."suppliers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invites_tokenHash_key" ON "dropship"."supplier_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "supplier_invites_sellerStoreId_status_idx" ON "dropship"."supplier_invites"("sellerStoreId", "status");

-- CreateIndex
CREATE INDEX "supplier_links_sellerStoreId_status_idx" ON "dropship"."supplier_links"("sellerStoreId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_links_supplierId_sellerStoreId_key" ON "dropship"."supplier_links"("supplierId", "sellerStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "supply_products_productId_key" ON "dropship"."supply_products"("productId");

-- CreateIndex
CREATE INDEX "supply_products_supplierId_isOpen_idx" ON "dropship"."supply_products"("supplierId", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "supply_variants_variantId_key" ON "dropship"."supply_variants"("variantId");

-- CreateIndex
CREATE INDEX "supply_variants_supplyProductId_idx" ON "dropship"."supply_variants"("supplyProductId");

-- CreateIndex
CREATE INDEX "terms_changes_supplierId_createdAt_idx" ON "dropship"."terms_changes"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "terms_changes_linkId_createdAt_idx" ON "dropship"."terms_changes"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "dropship"."supplier_links" ADD CONSTRAINT "supplier_links_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "dropship"."suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."supply_products" ADD CONSTRAINT "supply_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "dropship"."suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."supply_variants" ADD CONSTRAINT "supply_variants_supplyProductId_fkey" FOREIGN KEY ("supplyProductId") REFERENCES "dropship"."supply_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

