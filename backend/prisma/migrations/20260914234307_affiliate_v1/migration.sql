-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "affiliate";

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateCommissionType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "affiliate"."StoreAffiliateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REMOVED');

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateChannel" AS ENUM ('YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'WHATSAPP', 'TELEGRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'REVERSED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'AFFILIATE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "affiliateRef" TEXT;

-- CreateTable
CREATE TABLE "affiliate"."affiliate_programs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionType" "affiliate"."AffiliateCommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionRate" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "attributionDays" INTEGER NOT NULL DEFAULT 30,
    "holdDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_product_rules" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "commissionType" "affiliate"."AffiliateCommissionType",
    "commissionRate" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_product_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliates" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "affiliate"."AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_invitations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "commissionType" "affiliate"."AffiliateCommissionType",
    "commissionRate" DECIMAL(10,2),
    "status" "affiliate"."AffiliateInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "affiliateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."store_affiliates" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "status" "affiliate"."StoreAffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "commissionType" "affiliate"."AffiliateCommissionType",
    "commissionRate" DECIMAL(10,2),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "storeAffiliateId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "productSlug" TEXT,
    "channel" "affiliate"."AffiliateChannel",
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_clicks" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_attributions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "storeAffiliateId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_commissions" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "storeAffiliateId" TEXT NOT NULL,
    "linkId" TEXT,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "customerId" TEXT,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "commissionType" "affiliate"."AffiliateCommissionType" NOT NULL,
    "commissionRate" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "affiliate"."AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "maturesAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_fraud_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "affiliateId" TEXT,
    "storeId" TEXT,
    "orderId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_fraud_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_programs_storeId_key" ON "affiliate"."affiliate_programs"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_product_rules_programId_productId_key" ON "affiliate"."affiliate_product_rules"("programId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_customerId_key" ON "affiliate"."affiliates"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_invitations_token_key" ON "affiliate"."affiliate_invitations"("token");

-- CreateIndex
CREATE INDEX "affiliate_invitations_storeId_status_idx" ON "affiliate"."affiliate_invitations"("storeId", "status");

-- CreateIndex
CREATE INDEX "store_affiliates_storeId_status_idx" ON "affiliate"."store_affiliates"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "store_affiliates_affiliateId_storeId_key" ON "affiliate"."store_affiliates"("affiliateId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_links_token_key" ON "affiliate"."affiliate_links"("token");

-- CreateIndex
CREATE INDEX "affiliate_links_affiliateId_idx" ON "affiliate"."affiliate_links"("affiliateId");

-- CreateIndex
CREATE INDEX "affiliate_links_storeId_idx" ON "affiliate"."affiliate_links"("storeId");

-- CreateIndex
CREATE INDEX "affiliate_clicks_linkId_createdAt_idx" ON "affiliate"."affiliate_clicks"("linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_attributions_token_key" ON "affiliate"."affiliate_attributions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_attributions_orderId_key" ON "affiliate"."affiliate_attributions"("orderId");

-- CreateIndex
CREATE INDEX "affiliate_attributions_storeId_expiresAt_idx" ON "affiliate"."affiliate_attributions"("storeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_orderItemId_key" ON "affiliate"."affiliate_commissions"("orderItemId");

-- CreateIndex
CREATE INDEX "affiliate_commissions_orderId_idx" ON "affiliate"."affiliate_commissions"("orderId");

-- CreateIndex
CREATE INDEX "affiliate_commissions_affiliateId_status_idx" ON "affiliate"."affiliate_commissions"("affiliateId", "status");

-- CreateIndex
CREATE INDEX "affiliate_commissions_storeId_status_idx" ON "affiliate"."affiliate_commissions"("storeId", "status");

-- CreateIndex
CREATE INDEX "affiliate_commissions_status_maturesAt_idx" ON "affiliate"."affiliate_commissions"("status", "maturesAt");

-- CreateIndex
CREATE INDEX "affiliate_fraud_events_createdAt_idx" ON "affiliate"."affiliate_fraud_events"("createdAt");

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_product_rules" ADD CONSTRAINT "affiliate_product_rules_programId_fkey" FOREIGN KEY ("programId") REFERENCES "affiliate"."affiliate_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."store_affiliates" ADD CONSTRAINT "store_affiliates_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliate"."affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_links" ADD CONSTRAINT "affiliate_links_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliate"."affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_links" ADD CONSTRAINT "affiliate_links_storeAffiliateId_fkey" FOREIGN KEY ("storeAffiliateId") REFERENCES "affiliate"."store_affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "affiliate"."affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "affiliate"."affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliate"."affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_storeAffiliateId_fkey" FOREIGN KEY ("storeAffiliateId") REFERENCES "affiliate"."store_affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

