import { Prisma } from "../../generated/prisma/client.js";
import { decimalToPaise } from "../payouts/payouts.rules.js";
import { paiseToAmount, type Bucket, type Leg } from "./finance.rules.js";

/**
 * The seller ledger's ONE write path. Every money movement goes through
 * `postLegs`, inside the caller's transaction:
 *
 *   1. make sure the store's balance row exists, then lock it
 *      (`SELECT … FOR UPDATE`) — postings for one store run one at a time;
 *   2. skip every leg whose idempotency key is already posted — a repeated
 *      call, webhook or job run adds nothing;
 *   3. write each new entry with the bucket's balance before and after, and
 *      store the new balances.
 *
 * Entries are never edited or deleted; a mistake is another entry.
 */

type Tx = Prisma.TransactionClient;

export interface Balances {
  payable: bigint;
  inPayout: bigint;
  owed: bigint;
}

const FIELD: Record<Bucket, keyof Balances> = {
  PAYABLE: "payable",
  IN_PAYOUT: "inPayout",
  OWED: "owed",
};

/** Creates the row if needed and locks it for the rest of the transaction. */
export async function lockBalance(tx: Tx, storeId: string): Promise<Balances> {
  await tx.$executeRaw`INSERT INTO "public"."seller_balances" ("storeId", "updatedAt") VALUES (${storeId}, now()) ON CONFLICT ("storeId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ payable: Prisma.Decimal; inPayout: Prisma.Decimal; owed: Prisma.Decimal }[]>`
    SELECT "payable", "inPayout", "owed" FROM "public"."seller_balances" WHERE "storeId" = ${storeId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`Seller balance row missing for store ${storeId}`);
  return {
    payable: decimalToPaise(new Prisma.Decimal(row.payable)),
    inPayout: decimalToPaise(new Prisma.Decimal(row.inPayout)),
    owed: decimalToPaise(new Prisma.Decimal(row.owed)),
  };
}

export interface PostActor {
  id: string;
  email: string;
}

/** Posts the legs not posted yet. Returns how many were new. */
export async function postLegs(
  tx: Tx,
  storeId: string,
  legs: Leg[],
  options: { actor?: PostActor | null; meta?: Prisma.InputJsonObject } = {},
): Promise<number> {
  if (legs.length === 0) return 0;
  const balances = await lockBalance(tx, storeId);
  const done = new Set(
    (
      await tx.sellerLedgerEntry.findMany({
        where: { idempotencyKey: { in: legs.map((leg) => leg.key) } },
        select: { idempotencyKey: true },
      })
    ).map((row) => row.idempotencyKey),
  );

  let posted = 0;
  for (const leg of legs) {
    if (done.has(leg.key)) continue;
    const field = FIELD[leg.bucket];
    const before = balances[field];
    const after = before + leg.amount;
    await tx.sellerLedgerEntry.create({
      data: {
        storeId,
        bucket: leg.bucket,
        type: leg.type,
        amount: new Prisma.Decimal(paiseToAmount(leg.amount)),
        balanceBefore: new Prisma.Decimal(paiseToAmount(before)),
        balanceAfter: new Prisma.Decimal(paiseToAmount(after)),
        orderId: leg.orderId ?? null,
        payoutId: leg.payoutId ?? null,
        idempotencyKey: leg.key,
        description: leg.description,
        createdById: options.actor?.id ?? null,
        createdByEmail: options.actor?.email ?? null,
        ...(options.meta ? { meta: options.meta } : {}),
      },
    });
    balances[field] = after;
    done.add(leg.key);
    posted += 1;
  }

  if (posted > 0) {
    await tx.sellerBalance.update({
      where: { storeId },
      data: {
        payable: new Prisma.Decimal(paiseToAmount(balances.payable)),
        inPayout: new Prisma.Decimal(paiseToAmount(balances.inPayout)),
        owed: new Prisma.Decimal(paiseToAmount(balances.owed)),
      },
    });
  }
  return posted;
}
