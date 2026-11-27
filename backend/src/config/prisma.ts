import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { bankNumberIndex, isSealed, openBankNumber, sealBankNumber } from "../utils/bankCrypto.js";
import { env } from "./env.js";

/**
 * Prisma client singleton.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 * We use the node-postgres adapter against the *pooled* Supabase connection
 * (DATABASE_URL, PgBouncer :6543) — migrations use DIRECT_URL via the CLI.
 */
if (!env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — cannot initialise the database client.",
  );
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/** Unextended — only for the bank-number backfill, which must see raw values. */
export const prismaRaw = new PrismaClient({ adapter });

const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);

/** A plain `accountNumber` in write data → sealed (+ its lookup index on accounts). */
function sealRow(row: unknown, withIndex: boolean): unknown {
  if (!row || typeof row !== "object") return row;
  const { accountNumber } = row as { accountNumber?: unknown };
  if (typeof accountNumber !== "string" || isSealed(accountNumber)) return row;
  return {
    ...row,
    accountNumber: sealBankNumber(accountNumber),
    ...(withIndex ? { accountNumberHash: bankNumberIndex(accountNumber) } : {}),
  };
}

function sealArgs<T>(operation: string, args: T, withIndex: boolean): T {
  if (!WRITES.has(operation) || !args || typeof args !== "object") return args;
  const a = args as { data?: unknown; create?: unknown; update?: unknown };
  const seal = (data: unknown) => (Array.isArray(data) ? data.map((r) => sealRow(r, withIndex)) : sealRow(data, withIndex));
  return operation === "upsert"
    ? ({ ...a, create: seal(a.create), update: seal(a.update) } as T)
    : ({ ...a, data: seal(a.data) } as T);
}

/**
 * Bank account numbers are encrypted at rest (utils/bankCrypto.ts) without
 * the services knowing: writes seal `accountNumber`, reads — nested ones
 * included — get it back decrypted. Filtering by the number must use
 * `accountNumberHash` (`bankNumberIndex`), never `accountNumber`.
 *
 * Typed as the plain client: the extension changes no field's type (the
 * number is a string either way), and the codebase passes `prisma` / `tx`
 * as `PrismaClient` / `TransactionClient` everywhere. The one runtime gap —
 * an extended client has no `$on` — is unused.
 */
export const prisma: PrismaClient = prismaRaw.$extends({
  name: "bankNumberEncryption",
  query: {
    storeBankAccount: {
      $allOperations: ({ operation, args, query }) => query(sealArgs(operation, args, true)),
    },
    storeBankAccountChange: {
      $allOperations: ({ operation, args, query }) => query(sealArgs(operation, args, false)),
    },
  },
  result: {
    storeBankAccount: {
      accountNumber: { needs: { accountNumber: true }, compute: (row) => openBankNumber(row.accountNumber) },
    },
    storeBankAccountChange: {
      accountNumber: { needs: { accountNumber: true }, compute: (row) => openBankNumber(row.accountNumber) },
    },
  },
}) as unknown as PrismaClient;

export type Prisma = typeof prisma;
