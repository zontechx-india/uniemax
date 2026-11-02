import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import type { StoreActor } from "./storeActor.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { confirmActionCode, requestActionCode } from "../../package/auth/index.js";
import { publicWebUrl, sendMail } from "../../package/mail/index.js";
import { notify } from "../notifications/notifications.service.js";
import { getMyStore } from "./stores.service.js";
import { gateBlockedMessage } from "./storeReadiness.js";
import { BANK_DETAIL_FIELDS } from "./storeBank.schema.js";
import type {
  BankAccountCreateInput,
  BankAccountUpdateInput,
} from "./storeBank.schema.js";
import { checkAccount, checkChange, type CheckOutcome } from "./bankCheck.service.js";
import { listBankEvents, recordBankEvent, type BankActor } from "./storeBank.history.js";

/**
 * Seller payout accounts — owner-scoped like the rest of the stores module
 * (a foreign store ref 404s via `getMyStore`). Rules:
 *
 *  - adding the FIRST or any later account is gated by `PAYOUT_SETUP`
 *    (`storeReadiness.ts`): the business address is not asked for at signup,
 *    so this is where it becomes mandatory. Editing, re-prioritising and
 *    deleting are never gated;
 *  - at most MAX_ACCOUNTS saved accounts per store;
 *  - exactly one account may be `isPrimary` — the payout target. The first
 *    saved account becomes primary automatically. Deleting the primary does
 *    NOT auto-promote another (payouts must never silently retarget);
 *  - every change but the very first account needs a step-up code
 *    (`BANK_CHANGE`, sent to the owner's verified phone, else email), and
 *    the owner is emailed + notified after it — changing bank details is the
 *    classic way to steal a seller's payouts (ONBOARDING.md §4.6);
 *  - saving runs a PaymentHub bank check (bankCheck.service.ts). New details
 *    for a VERIFIED account are held aside as a `StoreBankAccountChange` and
 *    applied only when VALID, so payouts never move to unchecked details; an
 *    unverified account is edited in place. Likewise a new account asked to
 *    be main while a VERIFIED one is main takes over only once verified;
 *  - the full account number is never returned — sellers see the last 4;
 *  - every write lands in the history (`storeBank.history.ts`).
 */

/**
 * Payout accounts are the ONE store surface a platform admin never touches.
 *
 * Everything else in this module is deliberately reachable by an admin actor
 * so support can fix a seller's catalog or storefront on request. Redirecting
 * where a shop's money lands is a different kind of act: it is the single
 * highest-value target on the platform, and no support task needs it. Admins
 * verify accounts through the console (`admin.routes.ts`) — read and approve,
 * never create or edit.
 *
 * The admin route mount already omits these endpoints; this is the second
 * lock, so that mounting them by accident later fails closed instead of
 * silently granting the capability.
 */
function assertOwner(actor: StoreActor): asserts actor is Extract<StoreActor, { kind: "owner" }> {
  if (actor.kind !== "owner") {
    throw HttpError.forbidden(
      "Payout bank accounts can only be managed by the store owner.",
    );
  }
}

const MAX_ACCOUNTS = 5;

const accountSelect = {
  id: true,
  storeId: true,
  accountHolderName: true,
  accountNumber: true,
  ifsc: true,
  bankName: true,
  branch: true,
  upiId: true,
  phone: true,
  isPrimary: true,
  promoteWhenVerified: true,
  verificationStatus: true,
  verificationMethod: true,
  verificationNote: true,
  verifiedAt: true,
  checkStatus: true,
  checkRegisteredName: true,
  checkedAt: true,
  createdAt: true,
  updatedAt: true,
  changes: {
    where: { status: "OPEN" },
    take: 1,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      accountHolderName: true,
      accountNumber: true,
      ifsc: true,
      bankName: true,
      branch: true,
      upiId: true,
      phone: true,
      checkStatus: true,
      checkRegisteredName: true,
      checkedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.StoreBankAccountSelect;

type AccountRow = Prisma.StoreBankAccountGetPayload<{ select: typeof accountSelect }>;

/**
 * The seller's view: last 4 digits only, no reason code, the bank's name
 * only when VALID (the hub fills it only then).
 */
function toSellerAccount(row: AccountRow) {
  const { accountNumber, changes, storeId: _storeId, ...rest } = row;
  const change = changes[0];
  return {
    ...rest,
    accountNumberLast4: accountNumber.slice(-4),
    pendingChange: change
      ? {
          id: change.id,
          accountHolderName: change.accountHolderName,
          accountNumberLast4: change.accountNumber.slice(-4),
          ifsc: change.ifsc,
          bankName: change.bankName,
          branch: change.branch,
          upiId: change.upiId,
          phone: change.phone,
          checkStatus: change.checkStatus,
          checkRegisteredName: change.checkRegisteredName,
          checkedAt: change.checkedAt,
          createdAt: change.createdAt,
        }
      : null,
  };
}

async function readAccount(accountId: string) {
  const row = await prisma.storeBankAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: accountSelect,
  });
  return toSellerAccount(row);
}

function sellerActor(actor: Extract<StoreActor, { kind: "owner" }>): BankActor {
  return { type: "SELLER", id: actor.customerId };
}

async function requireCode(
  actor: Extract<StoreActor, { kind: "owner" }>,
  code: string | undefined,
): Promise<void> {
  if (!code) {
    // 428: the client asks for a code (POST …/bank-accounts/otp) and retries.
    throw new HttpError(428, "Enter the code we sent you to confirm this bank change.");
  }
  await confirmActionCode(actor.customerId, "BANK_CHANGE", code);
}

/**
 * "Your bank details changed" — in-app + email, so a change the owner did
 * not make is noticed. Never fails the change itself.
 */
function alertOwner(storeId: string, ownerId: string, what: string) {
  const body = `${what} If you did not do this, contact UnieMax support right away.`;
  notify({
    principalType: "CUSTOMER",
    principalId: ownerId,
    kind: "ACCOUNT",
    title: "Your payout bank details changed",
    body,
    url: `/stores/${storeId}/bank`,
  });
  void (async () => {
    const owner = await prisma.customer.findUnique({ where: { id: ownerId }, select: { email: true } });
    if (!owner?.email) return;
    const link = publicWebUrl ? `${publicWebUrl}/stores/${storeId}/bank` : null;
    await sendMail({
      to: owner.email,
      subject: "Your UnieMax payout bank details changed",
      text: `${body}${link ? `\n\nReview them: ${link}` : ""}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px;font-size:18px;color:#111">Your payout bank details changed</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#444">${what}</p>
  <p style="margin:0 0 16px;font-size:14px;color:#444"><strong>If you did not do this, contact UnieMax support right away.</strong></p>
  ${link ? `<p style="margin:0;font-size:14px"><a href="${link}">Review your bank accounts</a></p>` : ""}
</div>`,
    });
  })().catch((err) => {
    console.error("Bank change email failed:", err);
  });
}

function label(details: { bankName: string; accountNumber: string }) {
  return `${details.bankName} ····${details.accountNumber.slice(-4)}`;
}

/** The same number + IFSC may not be saved twice in one store. */
async function assertNotDuplicate(
  storeId: string,
  details: { accountNumber: string; ifsc: string },
  exceptAccountId?: string,
) {
  const clash = await prisma.storeBankAccount.findFirst({
    where: {
      storeId,
      accountNumber: details.accountNumber,
      ifsc: details.ifsc,
      ...(exceptAccountId ? { id: { not: exceptAccountId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw HttpError.conflict("This bank account is already saved in your store.");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBankAccounts(actor: StoreActor, storeRef: string) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef); // ownership check
  const rows = await prisma.storeBankAccount.findMany({
    where: { storeId: store.id },
    select: accountSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toSellerAccount);
}

/** Who changed what and when — masked, without admin notes. */
export async function listBankHistory(actor: StoreActor, storeRef: string) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef);
  return listBankEvents(store.id, { withNotes: false });
}

/** Send the step-up code for the next bank change. */
export async function requestBankChangeCode(actor: StoreActor, storeRef: string) {
  assertOwner(actor);
  await getMyStore(actor, storeRef); // ownership check
  return requestActionCode(actor.customerId, "BANK_CHANGE");
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createBankAccount(
  actor: StoreActor,
  storeRef: string,
  input: BankAccountCreateInput,
  log: FastifyBaseLogger,
) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef); // ownership check

  // `getMyStore` already carries the readiness evaluation, so the gate is
  // read straight off it rather than evaluated a second time.
  const gate = store.readiness.gates.PAYOUT_SETUP;
  if (!gate.allowed) {
    throw HttpError.badRequest(gateBlockedMessage("PAYOUT_SETUP", gate));
  }

  const existing = await prisma.storeBankAccount.findMany({
    where: { storeId: store.id },
    select: { id: true, isPrimary: true, verificationStatus: true },
  });
  if (existing.length >= MAX_ACCOUNTS) {
    throw HttpError.conflict(
      `You can save up to ${MAX_ACCOUNTS} bank accounts`,
    );
  }
  // The very first account is not a "change" — nothing to steal yet.
  if (existing.length > 0) await requireCode(actor, input.otp);

  const { isPrimary, otp: _otp, ...details } = input;
  await assertNotDuplicate(store.id, details);

  // The first account is always the payout target. A later one asked to be
  // main takes over at once — unless the current main is VERIFIED, in which
  // case it waits for its own check to be VALID.
  const currentPrimary = existing.find((a) => a.isPrimary);
  const wantsPrimary = existing.length === 0 || isPrimary === true;
  const queued = wantsPrimary && currentPrimary?.verificationStatus === "VERIFIED";
  const makePrimary = wantsPrimary && !queued;
  const who = sellerActor(actor);

  const created = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.storeBankAccount.updateMany({
        where: { storeId: store.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const account = await tx.storeBankAccount.create({
      data: { ...details, storeId: store.id, isPrimary: makePrimary, promoteWhenVerified: queued },
      select: { id: true },
    });
    await recordBankEvent({ storeId: store.id, accountId: account.id, action: "ACCOUNT_ADDED", actor: who, details }, tx);
    if (makePrimary && existing.length > 0) {
      await recordBankEvent({ storeId: store.id, accountId: account.id, action: "PRIMARY_CHANGED", actor: who, details }, tx);
    }
    if (queued) {
      await recordBankEvent({ storeId: store.id, accountId: account.id, action: "PRIMARY_QUEUED", actor: who, details }, tx);
    }
    return account;
  });

  if (existing.length > 0) {
    alertOwner(
      store.id,
      actor.customerId,
      `A bank account (${label(details)}) was added to your store "${store.name}"${
        makePrimary ? " and made your main account" : queued ? "; it becomes your main account once verified" : ""
      }.`,
    );
  }

  const check = await checkAccount(created.id, who, log);
  return { account: await readAccount(created.id), check };
}

export async function updateBankAccount(
  actor: StoreActor,
  storeRef: string,
  accountId: string,
  input: BankAccountUpdateInput,
  log: FastifyBaseLogger,
) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef); // ownership check
  const existing = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
  });
  if (!existing) throw HttpError.notFound("Bank account not found");
  await requireCode(actor, input.otp);

  const { isPrimary, otp: _otp, ...sent } = input;
  // Left out = unchanged (the seller never sees the full number to resend it).
  const next = {
    accountHolderName: sent.accountHolderName ?? existing.accountHolderName,
    accountNumber: sent.accountNumber ?? existing.accountNumber,
    ifsc: sent.ifsc ?? existing.ifsc,
    bankName: sent.bankName ?? existing.bankName,
    branch: sent.branch ?? existing.branch,
    upiId: sent.upiId !== undefined ? sent.upiId : existing.upiId,
    phone: sent.phone !== undefined ? sent.phone : existing.phone,
  };
  const detailChanged = BANK_DETAIL_FIELDS.some((field) => next[field] !== existing[field]);
  const who = sellerActor(actor);
  let check: CheckOutcome | null = null;

  if (detailChanged) {
    await assertNotDuplicate(store.id, next, existing.id);

    if (existing.verificationStatus === "VERIFIED") {
      // Held aside: payouts stay on the verified details until these are VALID.
      const change = await prisma.$transaction(async (tx) => {
        await tx.storeBankAccountChange.updateMany({
          where: { accountId: existing.id, status: "OPEN" },
          data: { status: "SUPERSEDED", resolvedAt: new Date() },
        });
        const row = await tx.storeBankAccountChange.create({
          data: { ...next, accountId: existing.id, storeId: store.id },
          select: { id: true },
        });
        await recordBankEvent(
          { storeId: store.id, accountId: existing.id, action: "CHANGE_REQUESTED", actor: who, details: next },
          tx,
        );
        return row;
      });
      alertOwner(
        store.id,
        actor.customerId,
        `New bank details (${label(next)}) were submitted for ${label(existing)} in "${store.name}". Payouts stay on ····${existing.accountNumber.slice(-4)} until the new details are verified.`,
      );
      check = await checkChange(change.id, who, log);
    } else {
      // Not verified yet — nothing to protect; edit in place and re-check.
      await prisma.$transaction(async (tx) => {
        await tx.storeBankAccount.update({
          where: { id: existing.id },
          data: {
            ...next,
            verificationStatus: "PENDING",
            verificationMethod: null,
            verificationRef: null,
            verificationNote: null,
            verifiedAt: null,
            verifiedBy: null,
            checkStatus: null,
            checkReasonCode: null,
            checkRegisteredName: null,
            checkNameMatch: null,
            checkedAt: null,
          },
        });
        await recordBankEvent(
          { storeId: store.id, accountId: existing.id, action: "DETAILS_CHANGED", actor: who, details: next },
          tx,
        );
      });
      alertOwner(store.id, actor.customerId, `The details of ${label(existing)} in "${store.name}" were changed to ${label(next)}.`);
      check = await checkAccount(existing.id, who, log);
    }
  }

  if (isPrimary && !existing.isPrimary) {
    const fresh = await prisma.storeBankAccount.findUniqueOrThrow({
      where: { id: existing.id },
      select: { verificationStatus: true },
    });
    const currentPrimary = await prisma.storeBankAccount.findFirst({
      where: { storeId: store.id, isPrimary: true },
      select: { verificationStatus: true },
    });
    const queued = currentPrimary?.verificationStatus === "VERIFIED" && fresh.verificationStatus !== "VERIFIED";
    await prisma.$transaction(async (tx) => {
      if (queued) {
        await tx.storeBankAccount.updateMany({
          where: { storeId: store.id, promoteWhenVerified: true },
          data: { promoteWhenVerified: false },
        });
        await tx.storeBankAccount.update({ where: { id: existing.id }, data: { promoteWhenVerified: true } });
      } else {
        await tx.storeBankAccount.updateMany({
          where: { storeId: store.id },
          data: { isPrimary: false, promoteWhenVerified: false },
        });
        await tx.storeBankAccount.update({ where: { id: existing.id }, data: { isPrimary: true } });
      }
      await recordBankEvent(
        {
          storeId: store.id,
          accountId: existing.id,
          action: queued ? "PRIMARY_QUEUED" : "PRIMARY_CHANGED",
          actor: who,
          details: existing,
        },
        tx,
      );
    });
    alertOwner(
      store.id,
      actor.customerId,
      queued
        ? `${label(existing)} will become your main account in "${store.name}" once it is verified.`
        : `${label(existing)} is now your main account in "${store.name}" — payouts go there.`,
    );
  }

  return { account: await readAccount(existing.id), check };
}

/**
 * Run the bank check again — after RETRY_LATER, UNAVAILABLE or a timeout.
 * Checks the pending change if there is one, else the account. No code
 * needed: nothing about where money goes changes.
 */
export async function recheckBankAccount(
  actor: StoreActor,
  storeRef: string,
  accountId: string,
  log: FastifyBaseLogger,
) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef);
  const account = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
    select: { id: true, verificationStatus: true, changes: { where: { status: "OPEN" }, select: { id: true }, take: 1 } },
  });
  if (!account) throw HttpError.notFound("Bank account not found");
  const who = sellerActor(actor);
  const change = account.changes[0];
  let check: CheckOutcome;
  if (change) check = await checkChange(change.id, who, log);
  else if (account.verificationStatus === "VERIFIED") throw HttpError.conflict("This account is already verified.");
  else check = await checkAccount(account.id, who, log);
  return { account: await readAccount(account.id), check };
}

/** Withdraw pending new details — the account keeps its verified ones. */
export async function discardBankChange(actor: StoreActor, storeRef: string, accountId: string) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef);
  const change = await prisma.storeBankAccountChange.findFirst({
    where: { accountId, storeId: store.id, status: "OPEN" },
  });
  if (!change) throw HttpError.notFound("No pending bank change");
  await prisma.$transaction(async (tx) => {
    await tx.storeBankAccountChange.update({
      where: { id: change.id },
      data: { status: "DISCARDED", resolvedAt: new Date() },
    });
    await recordBankEvent(
      { storeId: store.id, accountId, action: "CHANGE_DISCARDED", actor: sellerActor(actor), details: change },
      tx,
    );
  });
  return readAccount(accountId);
}

export async function deleteBankAccount(
  actor: StoreActor,
  storeRef: string,
  accountId: string,
) {
  assertOwner(actor);
  const store = await getMyStore(actor, storeRef); // ownership check
  const existing = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
    select: { id: true, accountHolderName: true, accountNumber: true, ifsc: true, bankName: true, branch: true },
  });
  if (!existing) throw HttpError.notFound("Bank account not found");
  // Deliberately no auto-promotion of another account: the payout target
  // must always be an explicit choice by the seller.
  await prisma.$transaction(async (tx) => {
    await tx.storeBankAccount.delete({ where: { id: existing.id } });
    await recordBankEvent(
      { storeId: store.id, accountId: existing.id, action: "ACCOUNT_DELETED", actor: sellerActor(actor), details: existing },
      tx,
    );
  });
  alertOwner(store.id, actor.customerId, `${label(existing)} was removed from your store "${store.name}".`);
  return { id: existing.id };
}
