-- CreateEnum
CREATE TYPE "public"."BankCheckStatus" AS ENUM ('VALID', 'NEEDS_REVIEW', 'INVALID', 'RETRY_LATER', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "public"."BankChangeStatus" AS ENUM ('OPEN', 'APPLIED', 'DISCARDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "public"."BankEventAction" AS ENUM ('ACCOUNT_ADDED', 'DETAILS_CHANGED', 'CHANGE_REQUESTED', 'CHANGE_APPLIED', 'CHANGE_DISCARDED', 'PRIMARY_CHANGED', 'PRIMARY_QUEUED', 'ACCOUNT_DELETED', 'CHECK_RESULT', 'MANUAL_VERIFIED', 'MANUAL_FAILED', 'MANUAL_RESET');

-- CreateEnum
CREATE TYPE "public"."BankEventActor" AS ENUM ('SELLER', 'ADMIN', 'SYSTEM');

-- AlterEnum
ALTER TYPE "public"."OtpPurpose" ADD VALUE 'BANK_CHANGE';

-- AlterTable
ALTER TABLE "public"."store_bank_accounts" ADD COLUMN     "checkNameMatch" TEXT,
ADD COLUMN     "checkReasonCode" TEXT,
ADD COLUMN     "checkRegisteredName" TEXT,
ADD COLUMN     "checkStatus" "public"."BankCheckStatus",
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "promoteWhenVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."store_bank_account_changes" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "upiId" TEXT,
    "phone" TEXT,
    "status" "public"."BankChangeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "verificationRef" TEXT,
    "checkStatus" "public"."BankCheckStatus",
    "checkReasonCode" TEXT,
    "checkRegisteredName" TEXT,
    "checkNameMatch" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_bank_account_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_bank_account_events" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" "public"."BankEventAction" NOT NULL,
    "actor" "public"."BankEventActor" NOT NULL,
    "actorId" TEXT,
    "details" JSONB,
    "checkStatus" "public"."BankCheckStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_bank_account_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_bank_account_changes_accountId_status_idx" ON "public"."store_bank_account_changes"("accountId", "status");

-- CreateIndex
CREATE INDEX "store_bank_account_changes_verificationRef_idx" ON "public"."store_bank_account_changes"("verificationRef");

-- CreateIndex
CREATE INDEX "store_bank_account_events_storeId_createdAt_idx" ON "public"."store_bank_account_events"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "store_bank_accounts_verificationRef_idx" ON "public"."store_bank_accounts"("verificationRef");

-- AddForeignKey
ALTER TABLE "public"."store_bank_account_changes" ADD CONSTRAINT "store_bank_account_changes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."store_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_bank_account_events" ADD CONSTRAINT "store_bank_account_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

