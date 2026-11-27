-- A deleted payout account that a payout names is archived, not deleted.
ALTER TABLE "public"."store_bank_accounts" ADD COLUMN "archivedAt" TIMESTAMP(3);
