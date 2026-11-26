-- Advance payouts: UnieMax may pay a seller for an online order before it is
-- delivered (docs/seller-finance/README.md §9).

-- New enum values. Added in their own statements; nothing below uses them in
-- this transaction.
ALTER TYPE "public"."LedgerBucket" ADD VALUE IF NOT EXISTS 'ADVANCE';
ALTER TYPE "public"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADVANCE_PAID';
ALTER TYPE "public"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADVANCE_SETTLED';
ALTER TYPE "public"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADVANCE_TO_DUES';

-- CreateEnum
CREATE TYPE "public"."AdvanceOutcome" AS ENUM ('SETTLED', 'DUES');

-- Per-store switch (off for every store).
ALTER TABLE "public"."stores" ADD COLUMN "advancePayoutsAllowed" BOOLEAN NOT NULL DEFAULT false;

-- Payout: was it an advance, and how was it cleared.
ALTER TABLE "public"."order_payouts" ADD COLUMN "isAdvance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "advanceOutcome" "public"."AdvanceOutcome";

-- The fourth balance.
ALTER TABLE "public"."seller_balances" ADD COLUMN "advance" DECIMAL(12,2) NOT NULL DEFAULT 0;
