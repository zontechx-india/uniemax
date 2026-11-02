import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { maskedDetails, type BankDetails, type CheckStatus } from "./bankCheck.js";

/**
 * Append-only payout-account history (`store_bank_account_events`). Every
 * write to a payout account records one line: who, what, and a MASKED
 * snapshot of the details. `note` is admin-only context (a provider reason
 * code, a manual note) and is never sent to the seller.
 */

export type BankEventAction =
  | "ACCOUNT_ADDED"
  | "DETAILS_CHANGED"
  | "CHANGE_REQUESTED"
  | "CHANGE_APPLIED"
  | "CHANGE_DISCARDED"
  | "PRIMARY_CHANGED"
  | "PRIMARY_QUEUED"
  | "ACCOUNT_DELETED"
  | "CHECK_RESULT"
  | "MANUAL_VERIFIED"
  | "MANUAL_FAILED"
  | "MANUAL_RESET";

export interface BankActor {
  type: "SELLER" | "ADMIN" | "SYSTEM";
  id: string | null;
}

export const SYSTEM_ACTOR: BankActor = { type: "SYSTEM", id: null };

export interface BankEventInput {
  storeId: string;
  accountId: string;
  action: BankEventAction;
  actor: BankActor;
  details?: BankDetails | null;
  checkStatus?: CheckStatus | null;
  note?: string | null;
}

type Client = Pick<Prisma.TransactionClient, "storeBankAccountEvent">;

export async function recordBankEvent(input: BankEventInput, client: Client = prisma): Promise<void> {
  await client.storeBankAccountEvent.create({
    data: {
      storeId: input.storeId,
      accountId: input.accountId,
      action: input.action,
      actor: input.actor.type,
      actorId: input.actor.id,
      ...(input.details ? { details: maskedDetails(input.details) } : {}),
      checkStatus: input.checkStatus ?? null,
      note: input.note ?? null,
    },
  });
}

/** Newest first. `withNotes` only for admins — sellers never see notes. */
export async function listBankEvents(storeId: string, opts: { withNotes: boolean; take?: number }) {
  const rows = await prisma.storeBankAccountEvent.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
    select: {
      id: true,
      accountId: true,
      action: true,
      actor: true,
      actorId: true,
      details: true,
      checkStatus: true,
      note: true,
      createdAt: true,
    },
  });
  return opts.withNotes
    ? rows
    : rows.map(({ note: _note, actorId: _actorId, ...row }) => row);
}
