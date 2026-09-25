import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma, Prisma } from "../core/config/prisma.js";
import { authEnv, isProduction } from "../core/config/env.js";
import { HttpError } from "../../../utils/httpError.js";
import { authProviders } from "../providers/index.js";
import type { CodeChannel, CodePurpose } from "../providers/provider.types.js";

/**
 * Generic verification-code engine — one implementation behind every flow that
 * proves ownership of an email/phone: phone-OTP login, registration email
 * verification, password reset, and identifier linking.
 *
 * Two code models, chosen by channel:
 *
 * - **EMAIL — locally generated.** We generate the code, store its hash in
 *   `Otp.codeHash` (TTL + attempt limits), and deliver it via the email
 *   provider (Resend). The code exists only in the recipient's inbox: never
 *   echoed in responses, no bypass.
 *
 * - **SMS — provider managed.** The phone-OTP provider (Message Central)
 *   generates, delivers, and validates the code itself; we store only its
 *   verification reference in `Otp.providerRef` and delegate the check. The
 *   console fallback (no credentials) mimics this contract with a local code.
 *
 * **SMS dev bypass** (`OTP_BYPASS`, default on outside production): the fixed
 * `OTP_DEV_CODE` verifies with nothing generated or sent — email is never
 * bypassed.
 */

const smsBypass = authEnv.OTP_BYPASS ?? !isProduction;

function bypassed(channel: CodeChannel): boolean {
  return channel === "SMS" && smsBypass;
}

export interface CodeTarget {
  channel: CodeChannel;
  destination: string; // email address or phone number
  purpose: CodePurpose;
  /** Set when the code is bound to a specific account (linking, login). */
  customerId?: string;
}

/** What `issueCode` resolves to — feeds `codeIssueResponse`. */
export interface IssuedCode {
  expiresInMinutes: number;
  /** SMS console fallback / dev bypass only — echoed outside production. */
  devCode?: string;
}

function generateCode(): string {
  const max = 10 ** authEnv.OTP_LENGTH;
  return randomInt(0, max).toString().padStart(authEnv.OTP_LENGTH, "0");
}

/** Consumes any earlier live code, then stores the new row. */
async function storeCode(
  target: CodeTarget,
  data: { codeHash?: string; providerRef?: string },
  expiresInMinutes: number,
): Promise<void> {
  await prisma.otp.updateMany({
    where: {
      destination: target.destination,
      purpose: target.purpose,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
  await prisma.otp.create({
    data: {
      channel: target.channel,
      destination: target.destination,
      codeHash: data.codeHash ?? null,
      providerRef: data.providerRef ?? null,
      purpose: target.purpose,
      customerId: target.customerId ?? null,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
    },
  });
}

/**
 * Minimum gap between two codes to the same destination for the same purpose.
 * The route rate limits are per IP; this is the per-TARGET limit, so rotating
 * IPs cannot flood one person's phone or inbox (or run up the SMS bill).
 */
const RESEND_COOLDOWN_MS = 30_000;

async function assertResendCooldown(target: CodeTarget): Promise<void> {
  const last = await prisma.otp.findFirst({
    where: { destination: target.destination, purpose: target.purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last) return;
  const waitMs = last.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    throw HttpError.tooManyRequests(
      `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
    );
  }
}

/** Issues (and sends) a fresh code, invalidating any earlier live one. */
export async function issueCode(target: CodeTarget): Promise<IssuedCode> {
  // SMS dev bypass: nothing stored or sent — the fixed dev code will verify.
  if (bypassed(target.channel)) {
    return { expiresInMinutes: authEnv.OTP_TTL_MINUTES, devCode: authEnv.OTP_DEV_CODE };
  }
  await assertResendCooldown(target);

  // SMS: the provider owns the code; we keep its verification reference.
  if (target.channel === "SMS") {
    const started = await authProviders.phoneOtp.start(target.destination);
    await storeCode(target, { providerRef: started.providerRef }, started.expiresInMinutes);
    return {
      expiresInMinutes: started.expiresInMinutes,
      ...(started.devCode ? { devCode: started.devCode } : {}),
    };
  }

  // EMAIL: locally generated + hashed, delivered via the email provider.
  const code = generateCode();
  await storeCode(target, { codeHash: await bcrypt.hash(code, 8) }, authEnv.OTP_TTL_MINUTES);
  try {
    await authProviders.email.sendCode({
      destination: target.destination,
      code,
      purpose: target.purpose,
      expiresInMinutes: authEnv.OTP_TTL_MINUTES,
    });
  } catch (err) {
    // Delivery failure must not surface provider internals to the client.
    // eslint-disable-next-line no-console
    console.error(`[auth] code delivery failed (EMAIL → ${target.destination}):`, err);
    throw HttpError.badGateway(
      "Could not send the verification code. Please try again in a moment.",
    );
  }
  return { expiresInMinutes: authEnv.OTP_TTL_MINUTES };
}

/** Validates + consumes a code, or throws 401. */
export async function consumeCode(
  target: CodeTarget & { code: string },
): Promise<void> {
  // SMS dev bypass: accept only the fixed dev code, skip the store entirely.
  if (bypassed(target.channel)) {
    if (target.code !== authEnv.OTP_DEV_CODE) {
      throw HttpError.unauthorized("Incorrect code.");
    }
    return;
  }

  const where: Prisma.OtpWhereInput = {
    destination: target.destination,
    purpose: target.purpose,
    consumedAt: null,
    expiresAt: { gt: new Date() },
  };
  if (target.customerId) where.customerId = target.customerId;

  const otp = await prisma.otp.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw HttpError.unauthorized("No valid code found. Please request a new one.");
  }

  // Reserve the attempt BEFORE checking the code, as one conditional write:
  // a read-then-increment let concurrent guesses all pass the limit check
  // before any of them was counted.
  const reserved = await prisma.otp.updateMany({
    where: {
      id: otp.id,
      consumedAt: null,
      attempts: { lt: authEnv.OTP_MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw HttpError.unauthorized(
      "Too many incorrect attempts. Please request a new code.",
    );
  }

  try {
    if (otp.providerRef) {
      // Provider-managed (SMS): the provider validates the code.
      await authProviders.phoneOtp.check({
        phone: target.destination,
        code: target.code,
        providerRef: otp.providerRef,
      });
    } else if (otp.codeHash) {
      // Locally generated (EMAIL): compare against the stored hash.
      const matches = await bcrypt.compare(target.code, otp.codeHash);
      if (!matches) throw HttpError.unauthorized("Incorrect code.");
    } else {
      throw HttpError.unauthorized("No valid code found. Please request a new one.");
    }
  } catch (err) {
    // Only a WRONG code spends an attempt; a provider outage gives it back.
    if (!(err instanceof HttpError && err.statusCode === 401)) {
      await prisma.otp.update({
        where: { id: otp.id },
        data: { attempts: { decrement: 1 } },
      });
    }
    throw err;
  }

  // Single use: only the request that flips consumedAt wins, so the same
  // code cannot be redeemed twice by two concurrent requests.
  const consumed = await prisma.otp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw HttpError.unauthorized("This code was already used. Please request a new one.");
  }
}

/**
 * Standard "code sent" response body. EMAIL codes are never echoed back —
 * the user must read their inbox. A `devCode` appears only for SMS codes from
 * the dev bypass / console fallback, outside production.
 */
export function codeIssueResponse(target: CodeTarget, issued?: IssuedCode) {
  return {
    channel: target.channel,
    destination: target.destination,
    expiresInMinutes: issued?.expiresInMinutes ?? authEnv.OTP_TTL_MINUTES,
    ...(target.channel === "SMS" && !isProduction && issued?.devCode
      ? { devCode: issued.devCode }
      : {}),
  };
}
