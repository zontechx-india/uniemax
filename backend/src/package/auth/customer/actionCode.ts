import { prisma } from "../core/config/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  codeIssueResponse,
  consumeCode,
  issueCode,
} from "../verification/verification.service.js";
import type { CodeTarget } from "../verification/verification.service.js";

/**
 * Step-up codes for a sensitive action by an already signed-in customer
 * (today: changing a payout bank account). Not a login — the session stays
 * as it is; the code only proves the person acting still holds the
 * account's phone or email.
 *
 * Where the code goes: the VERIFIED phone (SMS) when there is one, else the
 * email. Always the account's own identifier, never one from the request.
 */

export type ActionPurpose = "BANK_CHANGE";

async function targetFor(customerId: string, purpose: ActionPurpose): Promise<CodeTarget> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true, phoneVerifiedAt: true, email: true },
  });
  if (!customer) throw HttpError.unauthorized("Please sign in again.");
  if (customer.phone && customer.phoneVerifiedAt) {
    return { channel: "SMS", destination: customer.phone, purpose, customerId };
  }
  if (customer.email) {
    return { channel: "EMAIL", destination: customer.email, purpose, customerId };
  }
  throw HttpError.badRequest("Add a phone number or email to your profile first.");
}

/** "+919876543210" → "+91•••••3210"; "ravi@x.com" → "ra•••@x.com". */
function maskDestination(target: CodeTarget): string {
  if (target.channel === "SMS") {
    return `${target.destination.slice(0, 3)}•••••${target.destination.slice(-4)}`;
  }
  const [name = "", domain = ""] = target.destination.split("@");
  return `${name.slice(0, 2)}•••@${domain}`;
}

/** Send a fresh code. The response names the channel and a masked destination. */
export async function requestActionCode(customerId: string, purpose: ActionPurpose) {
  const target = await targetFor(customerId, purpose);
  const issued = await issueCode(target);
  return { ...codeIssueResponse(target, issued), destination: maskDestination(target) };
}

/**
 * Throws 403 on a wrong, used or expired code — not the engine's 401: the
 * caller IS signed in, and web clients answer any 401 with a session
 * refresh + replay, which would spend a second attempt on the same code.
 */
export async function confirmActionCode(
  customerId: string,
  purpose: ActionPurpose,
  code: string,
): Promise<void> {
  const target = await targetFor(customerId, purpose);
  try {
    await consumeCode({ ...target, code });
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 401) throw HttpError.forbidden(err.message);
    throw err;
  }
}
