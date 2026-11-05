-- Seller finance: versioned fee rules, per-order fee snapshots, the seller
-- ledger + balances, and two payout columns. Additive only.

-- CreateEnum
CREATE TYPE "public"."FeeKind" AS ENUM ('PLATFORM', 'GATEWAY');

-- CreateEnum
CREATE TYPE "public"."FeeScope" AS ENUM ('GLOBAL', 'STORE', 'CATEGORY');

-- CreateEnum
CREATE TYPE "public"."FeeBearer" AS ENUM ('SELLER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "public"."LedgerBucket" AS ENUM ('PAYABLE', 'IN_PAYOUT', 'OWED');

-- CreateEnum
CREATE TYPE "public"."LedgerEntryType" AS ENUM ('ORDER_SALE', 'PLATFORM_FEE', 'GATEWAY_FEE', 'COD_PLATFORM_FEE', 'DUES_SETTLED', 'DUES_RESTORED', 'PAYOUT_RESERVED', 'PAYOUT_PAID', 'PAYOUT_RELEASED', 'PAYOUT_RETURNED', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "public"."order_payouts" ADD COLUMN     "duesDeducted" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ledgerStatus" "public"."PayoutStatus";

-- CreateTable
CREATE TABLE "public"."fee_rules" (
    "id" TEXT NOT NULL,
    "kind" "public"."FeeKind" NOT NULL,
    "scope" "public"."FeeScope" NOT NULL DEFAULT 'GLOBAL',
    "storeId" TEXT,
    "categoryId" TEXT,
    "paymentMethod" "public"."PaymentMethod",
    "percent" DECIMAL(5,2) NOT NULL,
    "bearer" "public"."FeeBearer" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_financials" (
    "orderId" TEXT NOT NULL,
    "paymentMethod" "public"."PaymentMethod" NOT NULL,
    "itemsAmount" DECIMAL(10,2) NOT NULL,
    "shippingAmount" DECIMAL(10,2) NOT NULL,
    "orderTotal" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "platformFeePercent" DECIMAL(5,2),
    "gatewayFee" DECIMAL(10,2) NOT NULL,
    "gatewayFeePercent" DECIMAL(5,2) NOT NULL,
    "gatewayFeeBearer" "public"."FeeBearer" NOT NULL,
    "gatewayFeeRuleId" TEXT,
    "sellerEarning" DECIMAL(10,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_financials_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "public"."seller_balances" (
    "storeId" TEXT NOT NULL,
    "payable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inPayout" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "owed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_balances_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "public"."seller_ledger_entries" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bucket" "public"."LedgerBucket" NOT NULL,
    "type" "public"."LedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "payoutId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_rules_kind_effectiveFrom_idx" ON "public"."fee_rules"("kind", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "seller_ledger_entries_idempotencyKey_key" ON "public"."seller_ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seller_ledger_entries_storeId_createdAt_idx" ON "public"."seller_ledger_entries"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "seller_ledger_entries_orderId_idx" ON "public"."seller_ledger_entries"("orderId");

-- CreateIndex
CREATE INDEX "seller_ledger_entries_payoutId_idx" ON "public"."seller_ledger_entries"("payoutId");

-- AddForeignKey
ALTER TABLE "public"."order_financials" ADD CONSTRAINT "order_financials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The starting rules: 0% platform fee (sellers), 0% gateway fee (UnieMax
-- pays it). Effective from long before the first order, so every existing
-- order resolves to them. A change in the admin console adds a new version.
INSERT INTO "public"."fee_rules" ("id", "kind", "scope", "percent", "bearer", "effectiveFrom", "note", "createdAt")
VALUES
  ('feerule_platform_initial', 'PLATFORM', 'GLOBAL', 0, 'SELLER', '2020-01-01T00:00:00Z', 'Starting rate', CURRENT_TIMESTAMP),
  ('feerule_gateway_initial', 'GATEWAY', 'GLOBAL', 0, 'PLATFORM', '2020-01-01T00:00:00Z', 'Starting rate — UnieMax pays the gateway', CURRENT_TIMESTAMP);
