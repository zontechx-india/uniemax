-- CreateEnum
CREATE TYPE "dropship"."SplitState" AS ENUM ('REQUESTED', 'DONE', 'FAILED', 'FALLBACK_DIRECT');

-- CreateEnum
CREATE TYPE "dropship"."SandboxLedgerKind" AS ENUM ('SPLIT', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "dropship"."StatementState" ADD VALUE 'SPLIT';

-- AlterTable
ALTER TABLE "dropship"."supplier_orders" ADD COLUMN     "feeAdjustError" TEXT,
ADD COLUMN     "feeAdjustedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "splitAt" TIMESTAMP(3),
ADD COLUMN     "splitAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "splitError" TEXT,
ADD COLUMN     "splitRef" TEXT,
ADD COLUMN     "splitState" "dropship"."SplitState";

-- CreateTable
CREATE TABLE "dropship"."sandbox_ledger" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "dropship"."SandboxLedgerKind" NOT NULL,
    "orderId" TEXT,
    "storeId" TEXT,
    "amount" DECIMAL(10,2),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_ledger_key_key" ON "dropship"."sandbox_ledger"("key");

-- CreateIndex
CREATE INDEX "sandbox_ledger_orderId_idx" ON "dropship"."sandbox_ledger"("orderId");

