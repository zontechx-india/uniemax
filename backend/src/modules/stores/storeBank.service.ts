import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { getMyStore } from "./stores.service.js";
import { gateBlockedMessage } from "./storeReadiness.js";
import { BANK_DETAIL_FIELDS } from "./storeBank.schema.js";
import type {
  BankAccountCreateInput,
  BankAccountUpdateInput,
} from "./storeBank.schema.js";

/**
 * Seller payout accounts — owner-scoped like the rest of the stores module
 * (a foreign store ref 404s via `getMyStore`). Rules:
 *
 *  - adding the FIRST or any later account is gated by `PAYOUT_SETUP`
 *    (`storeReadiness.ts`): the business address and tax details are not
 *    asked for at signup, so this is where they become mandatory — a payout
 *    account is the first thing that needs to know who is being paid and
 *    where. Editing, re-prioritising and deleting are never gated;
 *  - at most MAX_ACCOUNTS saved accounts per store;
 *  - exactly one account may be `isPrimary` — the payout target. The first
 *    saved account becomes primary automatically. Deleting the primary does
 *    NOT auto-promote another (payouts must never silently retarget); the
 *    seller explicitly picks the next primary.
 *  - accounts start `PENDING`; the verification fields are provisioned for
 *    the third-party account-validation integration and the UnieMax admin
 *    panel (both future). Editing any bank detail of a verified/failed
 *    account resets it to PENDING for re-verification.
 */

const MAX_ACCOUNTS = 5;

const accountSelect = {
  id: true,
  accountHolderName: true,
  accountNumber: true,
  ifsc: true,
  bankName: true,
  branch: true,
  upiId: true,
  isPrimary: true,
  verificationStatus: true,
  verificationMethod: true,
  verificationNote: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreBankAccountSelect;

export async function listBankAccounts(ownerId: string, storeRef: string) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  return prisma.storeBankAccount.findMany({
    where: { storeId: store.id },
    select: accountSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function createBankAccount(
  ownerId: string,
  storeRef: string,
  input: BankAccountCreateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check

  // `getMyStore` already carries the readiness evaluation, so the gate is
  // read straight off it rather than evaluated a second time.
  const gate = store.readiness.gates.PAYOUT_SETUP;
  if (!gate.allowed) {
    throw HttpError.badRequest(gateBlockedMessage("PAYOUT_SETUP", gate));
  }

  const count = await prisma.storeBankAccount.count({
    where: { storeId: store.id },
  });
  if (count >= MAX_ACCOUNTS) {
    throw HttpError.conflict(
      `You can save up to ${MAX_ACCOUNTS} bank accounts`,
    );
  }

  const { isPrimary, ...details } = input;
  // The first account is always the payout target; later ones only on request.
  const makePrimary = count === 0 || isPrimary === true;

  return prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.storeBankAccount.updateMany({
        where: { storeId: store.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.storeBankAccount.create({
      data: { ...details, storeId: store.id, isPrimary: makePrimary },
      select: accountSelect,
    });
  });
}

export async function updateBankAccount(
  ownerId: string,
  storeRef: string,
  accountId: string,
  input: BankAccountUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const existing = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
  });
  if (!existing) throw HttpError.notFound("Bank account not found");

  const { isPrimary, ...details } = input;
  const detailChanged = BANK_DETAIL_FIELDS.some(
    (field) => details[field] !== undefined && details[field] !== existing[field],
  );

  // Built field-by-field: undefined means "not sent" and must be omitted
  // (exactOptionalPropertyTypes), never written.
  const data: Prisma.StoreBankAccountUncheckedUpdateInput = {};
  if (details.accountHolderName !== undefined)
    data.accountHolderName = details.accountHolderName;
  if (details.accountNumber !== undefined)
    data.accountNumber = details.accountNumber;
  if (details.ifsc !== undefined) data.ifsc = details.ifsc;
  if (details.bankName !== undefined) data.bankName = details.bankName;
  if (details.branch !== undefined) data.branch = details.branch;
  if (details.upiId !== undefined) data.upiId = details.upiId;
  if (isPrimary) data.isPrimary = true;
  if (detailChanged) {
    // Changed bank details invalidate any earlier verification — the
    // account goes back to PENDING for the (future) checks to re-run.
    data.verificationStatus = "PENDING";
    data.verificationMethod = null;
    data.verificationRef = null;
    data.verificationNote = null;
    data.verifiedAt = null;
    data.verifiedBy = null;
  }

  return prisma.$transaction(async (tx) => {
    if (isPrimary && !existing.isPrimary) {
      await tx.storeBankAccount.updateMany({
        where: { storeId: store.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.storeBankAccount.update({
      where: { id: existing.id },
      data,
      select: accountSelect,
    });
  });
}

export async function deleteBankAccount(
  ownerId: string,
  storeRef: string,
  accountId: string,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const existing = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
    select: { id: true },
  });
  if (!existing) throw HttpError.notFound("Bank account not found");
  // Deliberately no auto-promotion of another account: the payout target
  // must always be an explicit choice by the seller.
  await prisma.storeBankAccount.delete({ where: { id: existing.id } });
  return { id: existing.id };
}
