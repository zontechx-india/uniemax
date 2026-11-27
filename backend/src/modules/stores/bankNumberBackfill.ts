import { prismaRaw } from "../../config/prisma.js";
import { bankNumberIndex, isSealed, sealBankNumber } from "../../utils/bankCrypto.js";

/**
 * Encrypts any payout account number still stored in plain text (rows saved
 * before encryption) and fills `accountNumberHash`. Runs at every boot,
 * before the server listens; once all rows are sealed it is two cheap
 * queries. Raw SQL so `updatedAt` is untouched (bank checks guard on it),
 * and each UPDATE only applies if the row still holds the plain value.
 */
export async function sealLegacyBankNumbers(): Promise<number> {
  let sealed = 0;
  const accounts = await prismaRaw.$queryRaw<{ id: string; accountNumber: string }[]>`
    SELECT "id", "accountNumber" FROM "public"."store_bank_accounts"
    WHERE "accountNumber" NOT LIKE 'enc:%' OR "accountNumberHash" IS NULL`;
  for (const row of accounts) {
    if (isSealed(row.accountNumber)) continue; // hash missing on a sealed row can't happen via the app
    sealed += await prismaRaw.$executeRaw`
      UPDATE "public"."store_bank_accounts"
      SET "accountNumber" = ${sealBankNumber(row.accountNumber)}, "accountNumberHash" = ${bankNumberIndex(row.accountNumber)}
      WHERE "id" = ${row.id} AND "accountNumber" = ${row.accountNumber}`;
  }
  const changes = await prismaRaw.$queryRaw<{ id: string; accountNumber: string }[]>`
    SELECT "id", "accountNumber" FROM "public"."store_bank_account_changes"
    WHERE "accountNumber" NOT LIKE 'enc:%'`;
  for (const row of changes) {
    sealed += await prismaRaw.$executeRaw`
      UPDATE "public"."store_bank_account_changes"
      SET "accountNumber" = ${sealBankNumber(row.accountNumber)}
      WHERE "id" = ${row.id} AND "accountNumber" = ${row.accountNumber}`;
  }
  return sealed;
}
