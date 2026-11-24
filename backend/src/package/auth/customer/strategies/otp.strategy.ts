import { prisma, Prisma } from "../../core/config/prisma.js";
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
import type { OtpRequestInput, OtpVerifyInput } from "../customer.schema.js";

/**
 * Mobile number + OTP strategy — **sign in or sign up**.
 *
 * A number that already belongs to an account signs in to it. A number nobody
 * owns yet gets a new, phone-only account the moment the code is verified
 * (no email, no password — the customer can add those later from their
 * profile). Nothing is created at `/otp/request`, so an unverified number
 * never becomes an account. Delivery goes through the pluggable SMS provider
 * (Message Central when configured; dev bypass accepts `123456`).
 */

async function findByPhone(phone: string) {
  return prisma.customer.findUnique({
    where: { phone },
    select: { id: true },
  });
}

export async function requestLoginCode(input: OtpRequestInput) {
  const existing = await findByPhone(input.phone);
  const target = {
    channel: "SMS",
    destination: input.phone,
    purpose: "LOGIN",
    ...(existing ? { customerId: existing.id } : {}),
  } as const;
  const issued = await issueCode(target);
  return codeIssueResponse(target, issued);
}

export async function verifyLoginCode(
  input: OtpVerifyInput,
): Promise<CustomerAuthResult> {
  const existing = await findByPhone(input.phone);

  await consumeCode({
    channel: "SMS",
    destination: input.phone,
    purpose: "LOGIN",
    code: input.code,
    ...(existing ? { customerId: existing.id } : {}),
  });

  if (existing) {
    // Signing in via OTP re-confirms possession of the number.
    const customer = await prisma.customer.update({
      where: { id: existing.id },
      data: { phoneVerifiedAt: new Date() },
      select: customerAuthSelect,
    });
    return authResult(customer);
  }

  // First time this number is seen → create the account, already verified.
  try {
    const customer = await prisma.customer.create({
      data: { phone: input.phone, phoneVerifiedAt: new Date() },
      select: customerAuthSelect,
    });
    return authResult(customer, true);
  } catch (err) {
    // Two verifies for the same new number raced: the other one created the
    // account a moment ago — sign in to it instead of failing.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const customer = await prisma.customer.update({
        where: { phone: input.phone },
        data: { phoneVerifiedAt: new Date() },
        select: customerAuthSelect,
      });
      return authResult(customer);
    }
    throw err;
  }
}
