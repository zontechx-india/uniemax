-- Bank account numbers are encrypted at rest (random IV), so uniqueness and
-- lookups move to a keyed HMAC of the number. The app's boot backfill fills
-- the hash and encrypts legacy plain rows (it needs BANK_DATA_KEY).
ALTER TABLE "public"."store_bank_accounts" ADD COLUMN "accountNumberHash" TEXT;

DROP INDEX "public"."store_bank_accounts_storeId_accountNumber_ifsc_key";

CREATE UNIQUE INDEX "store_bank_accounts_storeId_accountNumberHash_ifsc_key" ON "public"."store_bank_accounts"("storeId", "accountNumberHash", "ifsc");
