import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { notify, notifyAdmins } from "../notifications/notifications.service.js";
import type { HubVerification } from "../payments/paymenthub.client.js";
import {
  acceptsReviewUpdate,
  checkIdempotencyKey,
  holderNameForHub,
  payeeRefFor,
  phoneForHub,
  settlementFor,
  type CheckStatus,
} from "./bankCheck.js";
import { requestBankCheck } from "./bankCheck.hub.js";
import { recordBankEvent, SYSTEM_ACTOR, type BankActor } from "./storeBank.history.js";

/**
 * Payout-account checks through PaymentHub (ONBOARDING.md §4.6). A check runs
 * on one of two subjects:
 *
 *   - an ACCOUNT — its own details (a new account, or an unverified one);
 *   - a CHANGE   — new details held aside for a VERIFIED account. VALID
 *                  copies them onto the account; anything else leaves the
 *                  account (and its payouts) on the verified details.
 *
 * Rules live in bankCheck.ts, the hub call in bankCheck.hub.ts. Neither the
 * full account number nor the form body is ever logged — logs carry the
 * hub's masked `target`.
 */

export interface CheckOutcome {
  /** What was saved; null when nothing was (limit, input, timeout, name). */
  status: CheckStatus | null;
  /** Why the check gave no answer, in words the seller can act on. */
  error: { reason: "LIMIT" | "INPUT" | "TIMEOUT" | "UNAVAILABLE" | "NAME"; message: string } | null;
  reused: boolean;
}

/** What a save takes: a status, plus the hub's fields when it answered. */
type SaveInput = { status: CheckStatus } & Partial<
  Pick<HubVerification, "id" | "reasonCode" | "registeredName" | "nameMatch" | "details">
>;

// ---------------------------------------------------------------------------
// Ops alert — the hub can't verify (verifier down / not set up / app limit).
// Once per 30 min per process, so a hub outage doesn't flood the admins.
// ---------------------------------------------------------------------------

const ALERT_EVERY_MS = 30 * 60_000;
let lastAlertAt = 0;

function alertOps(code: string, log: FastifyBaseLogger) {
  log.error({ code }, "bank check: PaymentHub could not verify — the PaymentHub team must act");
  if (Date.now() - lastAlertAt < ALERT_EVERY_MS) return;
  lastAlertAt = Date.now();
  notifyAdmins({
    kind: "STORE",
    title: "Bank verification is unavailable",
    body: `PaymentHub answered ${code}. Sellers' bank checks are not running — ask the PaymentHub team.`,
    url: "/stores",
  });
}

function last4(accountNumber: string) {
  return accountNumber.slice(-4);
}

// ---------------------------------------------------------------------------
// Saving an answer
// ---------------------------------------------------------------------------

/**
 * Save a check answer on an account. Guarded on `updatedAt` when given: if
 * the seller edited the account meanwhile, the answer is about the old
 * details and is dropped (returns false).
 */
async function saveAccountResult(
  accountId: string,
  result: SaveInput,
  actor: BankActor,
  guard: { updatedAt?: Date; verificationRef?: string },
): Promise<boolean> {
  const account = await prisma.storeBankAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      storeId: true,
      accountHolderName: true,
      accountNumber: true,
      ifsc: true,
      bankName: true,
      branch: true,
      verificationStatus: true,
      promoteWhenVerified: true,
      store: { select: { ownerId: true } },
    },
  });
  if (!account) return false;

  const settlement = settlementFor(result.status);
  // An UNAVAILABLE / RETRY_LATER on an account an admin already verified by
  // hand must not undo that decision; only a real verdict moves it.
  const keepStatus = account.verificationStatus === "VERIFIED" && settlement.verificationStatus === "PENDING";
  const now = new Date();
  const verdict = result.status === "VALID" || result.status === "INVALID";

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.storeBankAccount.updateMany({
      where: {
        id: account.id,
        ...(guard.updatedAt ? { updatedAt: guard.updatedAt } : {}),
        ...(guard.verificationRef ? { verificationRef: guard.verificationRef } : {}),
      },
      data: {
        ...(keepStatus
          ? {}
          : {
              verificationStatus: settlement.verificationStatus,
              verificationMethod: settlement.verificationMethod,
              verificationNote: settlement.verificationNote,
              verifiedAt: settlement.verificationStatus === "VERIFIED" ? now : null,
              verifiedBy: null,
            }),
        ...(result.id ? { verificationRef: result.id } : {}),
        checkStatus: result.status,
        checkReasonCode: result.reasonCode ?? null,
        checkRegisteredName: result.registeredName ?? null,
        checkNameMatch: result.nameMatch ?? null,
        checkedAt: now,
        // The bank's own names for the branch the IFSC points to.
        ...(result.status === "VALID" && result.details?.bankName ? { bankName: result.details.bankName } : {}),
        ...(result.status === "VALID" && result.details?.branch ? { branch: result.details.branch } : {}),
      },
    });
    if (updated.count === 0) return false;
    await recordBankEvent(
      {
        storeId: account.storeId,
        accountId: account.id,
        action: "CHECK_RESULT",
        actor,
        details: account,
        checkStatus: result.status,
        note: result.reasonCode ?? null,
      },
      tx,
    );
    // Asked to be the main account while a verified one was: now it may.
    if (result.status === "VALID" && account.promoteWhenVerified) {
      await tx.storeBankAccount.updateMany({
        where: { storeId: account.storeId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.storeBankAccount.update({
        where: { id: account.id },
        data: { isPrimary: true, promoteWhenVerified: false },
      });
      await recordBankEvent(
        { storeId: account.storeId, accountId: account.id, action: "PRIMARY_CHANGED", actor: SYSTEM_ACTOR, details: account },
        tx,
      );
    }
    return true;
  });

  if (saved && verdict && !keepStatus) {
    notify({
      principalType: "CUSTOMER",
      principalId: account.store.ownerId,
      kind: "ACCOUNT",
      title: result.status === "VALID" ? "Bank account verified" : "We couldn't verify your bank account",
      body:
        result.status === "VALID"
          ? `${account.bankName} ····${last4(account.accountNumber)} is verified${
              result.registeredName ? ` (${result.registeredName})` : ""
            }.${account.promoteWhenVerified ? " It is now your main account." : ""}`
          : `${account.bankName} ····${last4(account.accountNumber)} — check the account number and IFSC, then save again.`,
      url: `/stores/${account.storeId}/bank`,
    });
  }
  return saved;
}

/**
 * Save a check answer on an OPEN change. VALID applies it to the account in
 * the same transaction; anything else leaves the account untouched.
 */
async function saveChangeResult(
  changeId: string,
  result: SaveInput,
  actor: BankActor,
  guard: { updatedAt?: Date; verificationRef?: string },
): Promise<boolean> {
  const change = await prisma.storeBankAccountChange.findUnique({
    where: { id: changeId },
    include: {
      account: {
        select: { id: true, accountNumber: true, bankName: true, store: { select: { ownerId: true } } },
      },
    },
  });
  if (!change || change.status !== "OPEN") return false;
  const now = new Date();

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.storeBankAccountChange.updateMany({
      where: {
        id: change.id,
        status: "OPEN",
        ...(guard.updatedAt ? { updatedAt: guard.updatedAt } : {}),
        ...(guard.verificationRef ? { verificationRef: guard.verificationRef } : {}),
      },
      data: {
        ...(result.id ? { verificationRef: result.id } : {}),
        checkStatus: result.status,
        checkReasonCode: result.reasonCode ?? null,
        checkRegisteredName: result.registeredName ?? null,
        checkNameMatch: result.nameMatch ?? null,
        checkedAt: now,
        ...(result.status === "VALID" ? { status: "APPLIED" as const, resolvedAt: now } : {}),
      },
    });
    if (updated.count === 0) return false;
    await recordBankEvent(
      {
        storeId: change.storeId,
        accountId: change.accountId,
        action: "CHECK_RESULT",
        actor,
        details: change,
        checkStatus: result.status,
        note: result.reasonCode ?? null,
      },
      tx,
    );
    if (result.status === "VALID") {
      await tx.storeBankAccount.update({
        where: { id: change.accountId },
        data: {
          accountHolderName: change.accountHolderName,
          accountNumber: change.accountNumber,
          ifsc: change.ifsc,
          bankName: result.details?.bankName || change.bankName,
          branch: result.details?.branch || change.branch,
          upiId: change.upiId,
          phone: change.phone,
          verificationStatus: "VERIFIED",
          verificationMethod: "THIRD_PARTY",
          verificationNote: null,
          verificationRef: result.id ?? change.verificationRef,
          verifiedAt: now,
          verifiedBy: null,
          checkStatus: "VALID",
          checkReasonCode: result.reasonCode ?? null,
          checkRegisteredName: result.registeredName ?? null,
          checkNameMatch: result.nameMatch ?? null,
          checkedAt: now,
        },
      });
      await recordBankEvent(
        { storeId: change.storeId, accountId: change.accountId, action: "CHANGE_APPLIED", actor, details: change },
        tx,
      );
    }
    return true;
  });

  const verdict = result.status === "VALID" || result.status === "INVALID";
  if (saved && verdict) {
    const old = `${change.account.bankName} ····${last4(change.account.accountNumber)}`;
    notify({
      principalType: "CUSTOMER",
      principalId: change.account.store.ownerId,
      kind: "ACCOUNT",
      title: result.status === "VALID" ? "New bank details verified" : "We couldn't verify your new bank details",
      body:
        result.status === "VALID"
          ? `Payouts now go to ····${last4(change.accountNumber)}${result.registeredName ? ` (${result.registeredName})` : ""}.`
          : `Payouts still go to ${old}. Check the new account number and IFSC, then save again.`,
      url: `/stores/${change.storeId}/bank`,
    });
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Running a check
// ---------------------------------------------------------------------------

interface Subject {
  kind: "account" | "change";
  id: string;
  storeId: string;
  updatedAt: Date;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  phone: string | null;
}

async function runCheck(subject: Subject, actor: BankActor, log: FastifyBaseLogger): Promise<CheckOutcome> {
  const accountHolder = holderNameForHub(subject.accountHolderName);
  if (!accountHolder) {
    return {
      status: null,
      reused: false,
      error: {
        reason: "NAME",
        message: "The name on the account must use English letters for the bank check. UnieMax will check it by hand.",
      },
    };
  }
  const phone = phoneForHub(subject.phone);
  const outcome = await requestBankCheck(
    {
      payeeRef: payeeRefFor(subject.storeId),
      accountNumber: subject.accountNumber,
      ifsc: subject.ifsc,
      accountHolder,
      ...(phone ? { phone } : {}),
    },
    checkIdempotencyKey(subject.storeId, subject.id, subject.updatedAt),
  );

  const save = subject.kind === "account" ? saveAccountResult : saveChangeResult;
  const guard = { updatedAt: subject.updatedAt };

  if (outcome.ok) {
    const v = outcome.verification;
    log.info(
      { storeId: subject.storeId, subject: subject.kind, subjectId: subject.id, verificationId: v.id, target: v.target, status: v.status, reused: v.reused },
      "bank check: PaymentHub answered",
    );
    const saved = await save(subject.id, v, actor, guard);
    if (!saved) {
      return {
        status: null,
        reused: v.reused,
        error: { reason: "TIMEOUT", message: "These bank details changed during the check. Please check again." },
      };
    }
    return { status: v.status, reused: v.reused, error: null };
  }

  log.warn(
    { storeId: subject.storeId, subject: subject.kind, subjectId: subject.id, reason: outcome.reason },
    "bank check: no answer",
  );
  if (outcome.reason === "UNAVAILABLE") {
    alertOps(outcome.code, log);
    await save(subject.id, { status: "UNAVAILABLE" }, actor, guard);
    return { status: "UNAVAILABLE", reused: false, error: { reason: "UNAVAILABLE", message: outcome.message } };
  }
  return { status: null, reused: false, error: { reason: outcome.reason, message: outcome.message } };
}

/** Check an account's own details. */
export async function checkAccount(accountId: string, actor: BankActor, log: FastifyBaseLogger): Promise<CheckOutcome> {
  const account = await prisma.storeBankAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      storeId: true,
      updatedAt: true,
      accountHolderName: true,
      accountNumber: true,
      ifsc: true,
      phone: true,
    },
  });
  if (!account) throw HttpError.notFound("Bank account not found");
  return runCheck({ kind: "account", ...account }, actor, log);
}

/** Check the new details of an OPEN change. */
export async function checkChange(changeId: string, actor: BankActor, log: FastifyBaseLogger): Promise<CheckOutcome> {
  const change = await prisma.storeBankAccountChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      storeId: true,
      status: true,
      updatedAt: true,
      accountHolderName: true,
      accountNumber: true,
      ifsc: true,
      phone: true,
    },
  });
  if (!change || change.status !== "OPEN") throw HttpError.notFound("No pending bank change");
  const { status: _status, ...subject } = change;
  return runCheck({ kind: "change", ...subject }, actor, log);
}

/**
 * Admin "Verify with bank" — checks the account's current details. Turns a
 * no-answer into an HTTP error the console shows in its dialog.
 */
export async function runAdminBankCheck(
  storeRef: string,
  accountId: string,
  adminId: string,
  log: FastifyBaseLogger,
): Promise<{ status: CheckStatus; reused: boolean }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeRef }, { slug: storeRef }] },
    select: { id: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  const account = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
    select: { id: true },
  });
  if (!account) throw HttpError.notFound("Bank account not found");

  const outcome = await checkAccount(account.id, { type: "ADMIN", id: adminId }, log);
  if (outcome.status && outcome.status !== "UNAVAILABLE") return { status: outcome.status, reused: outcome.reused };
  const error = outcome.error!;
  switch (error.reason) {
    case "LIMIT":
      throw HttpError.tooManyRequests("This store has used today's 5 bank checks. Try again tomorrow.");
    case "INPUT":
    case "NAME":
      throw new HttpError(422, error.message);
    case "UNAVAILABLE":
      throw new HttpError(503, "Bank verification is unavailable right now — the PaymentHub team must check the verifier.");
    case "TIMEOUT":
      throw new HttpError(503, `${error.message} The same check is reused, not charged twice.`);
  }
}

// ---------------------------------------------------------------------------
// Webhook — verification.updated
// ---------------------------------------------------------------------------

/**
 * A hub admin settled a NEEDS_REVIEW check. Applied only to the account (or
 * open change) whose LATEST check it is — the seller may have sent new
 * details since — and never over a manual decision made meanwhile.
 */
export async function applyVerificationUpdate(
  verification: Pick<HubVerification, "id" | "payeeRef" | "status" | "registeredName" | "nameMatch" | "reasonCode">,
): Promise<"applied" | "stale" | "unknown"> {
  const account = await prisma.storeBankAccount.findFirst({
    where: { verificationRef: verification.id },
    select: { id: true, storeId: true, verificationRef: true, verificationMethod: true },
  });
  if (account) {
    if (payeeRefFor(account.storeId) !== verification.payeeRef) return "unknown";
    if (!acceptsReviewUpdate(account, verification.id)) return "stale";
    const saved = await saveAccountResult(account.id, verification, SYSTEM_ACTOR, { verificationRef: verification.id });
    return saved ? "applied" : "stale";
  }

  const change = await prisma.storeBankAccountChange.findFirst({
    where: { verificationRef: verification.id },
    select: { id: true, storeId: true, status: true },
  });
  if (!change || payeeRefFor(change.storeId) !== verification.payeeRef) return "unknown";
  if (change.status !== "OPEN") return "stale";
  const saved = await saveChangeResult(change.id, verification, SYSTEM_ACTOR, { verificationRef: verification.id });
  return saved ? "applied" : "stale";
}
