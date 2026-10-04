import { prisma } from "../../core/config/prisma.js";
import { HttpError } from "../../../../utils/httpError.js";
import { authProviders } from "../../providers/index.js";
import {
  revokeAllSessions,
  revokeOtherSessions,
} from "../../core/session.service.js";
import {
  issueCode,
  consumeCode,
  codeIssueResponse,
} from "../../verification/verification.service.js";
import {
  customerAuthSelect,
  authResult,
} from "../customer.shared.js";
import type { CustomerAuthResult } from "../customer.shared.js";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "../../core/loginThrottle.js";
import type {
  RegisterRequestInput,
  RegisterVerifyInput,
  PasswordLoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "../customer.schema.js";

/**
 * Email + password strategy — the **primary** sign-in method.
 *
 * Password hashing goes through the `PasswordHasher` provider port (bcrypt —
 * real, no external service needed). Registration verification and password
 * reset ride the verification-code engine with **real email delivery** — the
 * code only ever exists in the recipient's inbox.
 */

const hasher = () => authProviders.passwordHasher;

/**
 * Verified against when the email has no account (or no password): the
 * request then costs the same bcrypt work as a real check, so response
 * timing can't be used to probe which emails are registered.
 */
const dummyHashPromise = authProviders.passwordHasher.hash(
  "timing-equalizer-not-a-real-password",
);

/**
 * Registration is **verify-first** — no account exists until the emailed code
 * is confirmed, so nobody can hold an account under an email they don't own.
 *
 * Step 1: validate the form, check the email is free, "send" the code.
 * (The whole form is validated here so password errors surface early; only
 * the email is used — the client re-sends the credentials on verify.)
 */
export async function requestRegistration(input: RegisterRequestInput) {
  const existing = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw HttpError.conflict("An account with this email already exists.");
  }

  const target = {
    channel: "EMAIL",
    destination: input.email,
    purpose: "EMAIL_VERIFY",
  } as const;
  const issued = await issueCode(target);
  return codeIssueResponse(target, issued);
}

/** Step 2: consume the code, then create the account — email pre-verified. */
export async function verifyRegistration(
  input: RegisterVerifyInput,
): Promise<CustomerAuthResult> {
  await consumeCode({
    channel: "EMAIL",
    destination: input.email,
    purpose: "EMAIL_VERIFY",
    code: input.code,
  });

  // Re-check — the email may have been claimed between request and verify.
  // The unique constraint (P2002 → 409) is the final guard against a race.
  const existing = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw HttpError.conflict("An account with this email already exists.");
  }

  const passwordHash = await hasher().hash(input.password);
  const customer = await prisma.customer.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name ?? null,
      emailVerifiedAt: new Date(),
    },
    select: customerAuthSelect,
  });

  return authResult(customer, true);
}

export async function login(input: PasswordLoginInput): Promise<CustomerAuthResult> {
  // Per-account cool-down (see loginThrottle.ts) — checked before any bcrypt
  // work, and keyed by the submitted email whether or not it has an account.
  assertLoginAllowed("customer", input.email);

  const row = await prisma.customer.findUnique({
    where: { email: input.email },
    select: customerAuthSelect,
  });

  // Same error whether the email is unknown, the account has no password
  // (social/OTP-only), or the password is wrong — never reveal which, in
  // message OR in timing (the dummy compare keeps the cost identical).
  if (!row?.passwordHash) {
    await hasher().verify(input.password, await dummyHashPromise);
    recordLoginFailure("customer", input.email);
    throw HttpError.unauthorized("Invalid email or password");
  }
  const valid = await hasher().verify(input.password, row.passwordHash);
  if (!valid) {
    recordLoginFailure("customer", input.email);
    throw HttpError.unauthorized("Invalid email or password");
  }
  clearLoginFailures("customer", input.email);

  // Hashes made at an older work factor are upgraded now, while the
  // plaintext is in hand — the only moment that is possible.
  if (hasher().needsRehash(row.passwordHash)) {
    await prisma.customer.update({
      where: { id: row.id },
      data: { passwordHash: await hasher().hash(input.password) },
    });
  }

  return authResult(row);
}

/**
 * Sends a reset code. Always reports success (no account enumeration); a code
 * is only actually issued when the email belongs to an account.
 */
export async function forgotPassword(input: ForgotPasswordInput) {
  const target = {
    channel: "EMAIL",
    destination: input.email,
    purpose: "PASSWORD_RESET",
  } as const;

  const existing = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) await issueCode({ ...target, customerId: existing.id });

  // Same response either way — email codes are never echoed back.
  return codeIssueResponse(target);
}

/** Verifies the reset code, sets the new password, revokes every session. */
export async function resetPassword(input: ResetPasswordInput) {
  await consumeCode({
    channel: "EMAIL",
    destination: input.email,
    purpose: "PASSWORD_RESET",
    code: input.code,
  });

  const row = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  // Generic message — the dev-bypass code "verifies" for any email, so the
  // account lookup is the real gate here.
  if (!row) throw HttpError.unauthorized("Invalid or expired code.");

  const passwordHash = await hasher().hash(input.newPassword);
  await prisma.customer.update({
    where: { id: row.id },
    data: { passwordHash },
  });

  // A reset means the old credential may be compromised — sign out everywhere.
  await revokeAllSessions(row.id, "customer");
  return { passwordReset: true };
}

/**
 * Change the password (requires the current one), or set a first password on
 * a social/OTP-only account (no current password to give). Every OTHER
 * session is revoked — if the password was changed because it leaked, a
 * session already stolen with it must not survive the change; the session
 * that proved the current password stays signed in.
 */
export async function changePassword(
  customerId: string,
  input: ChangePasswordInput,
  currentSessionId?: string,
) {
  const row = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { passwordHash: true },
  });
  if (!row) throw HttpError.unauthorized("Account no longer exists");

  if (row.passwordHash) {
    if (!input.currentPassword) {
      throw HttpError.badRequest("Current password is required.");
    }
    const valid = await hasher().verify(input.currentPassword, row.passwordHash);
    if (!valid) throw HttpError.unauthorized("Current password is incorrect.");
  }

  const passwordHash = await hasher().hash(input.newPassword);
  await prisma.customer.update({
    where: { id: customerId },
    data: { passwordHash },
  });

  const revokedSessions = await revokeOtherSessions(
    customerId,
    "customer",
    currentSessionId,
  );
  return { passwordChanged: true, revokedSessions };
}
