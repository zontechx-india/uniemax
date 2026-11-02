import {
  HubApiError,
  paymentHubConfigured,
  verifyBankAccount,
  type HubVerification,
  type VerifyBankAccountInput,
} from "../payments/paymenthub.client.js";

/**
 * One bank check against PaymentHub, with the retry rules of ONBOARDING.md
 * §4.1/§4.6 — and every refusal turned into an outcome the caller can show,
 * so nothing here ever reads as "the account is invalid" unless the hub said
 * INVALID. No Prisma: unit-tested with a fake `fetch`
 * (test/unit/bank-check-hub.test.ts).
 */

/** Per call: the hub may spend ~30 s asking the bank. */
export const HUB_TIMEOUT_MS = 45_000;
/** The whole request — under nginx's default 60 s proxy timeout. */
export const BUDGET_MS = 52_000;
const MAX_TRIES = 3;

export type HubCheckOutcome =
  | { ok: true; verification: HubVerification }
  /** The check could not run (verifier down / not set up, key refused,
   *  app limit, hub not configured). Saved as UNAVAILABLE; ops alerted. */
  | { ok: false; reason: "UNAVAILABLE"; code: string; message: string }
  /** 5 new checks for this payee in 24 h. */
  | { ok: false; reason: "LIMIT"; message: string }
  /** The hub rejected a field (format). */
  | { ok: false; reason: "INPUT"; message: string }
  /** Timed out / unreachable / still running. Nothing is saved, so the next
   *  try reuses the same key and is never charged twice. */
  | { ok: false; reason: "TIMEOUT"; message: string };

const UNAVAILABLE_MESSAGE = "Bank verification is unavailable right now. Please try again later.";

function isRetryable(error: unknown): boolean {
  if (error instanceof HubApiError) {
    if (error.hubCode === "IDEMPOTENCY_IN_PROGRESS") return true;
    return error.hubStatus >= 500 && !error.hubCode.startsWith("VERIFIER_");
  }
  // fetch network failure or our own timeout.
  return true;
}

export function classify(error: unknown): Exclude<HubCheckOutcome, { ok: true }> {
  if (!(error instanceof HubApiError)) {
    return {
      ok: false,
      reason: "TIMEOUT",
      message: "The bank is taking too long to answer. Please try again in a minute.",
    };
  }
  switch (error.hubCode) {
    case "VERIFICATION_LIMIT":
      return { ok: false, reason: "LIMIT", message: "Too many attempts today. Please try again tomorrow." };
    case "VALIDATION_ERROR":
    case "VERIFICATION_INPUT_INVALID":
      return { ok: false, reason: "INPUT", message: error.message.replace(/^PaymentHub: /, "") };
    case "IDEMPOTENCY_IN_PROGRESS":
      return { ok: false, reason: "TIMEOUT", message: "This account is still being checked. Please try again in a minute." };
  }
  if (error.hubStatus >= 500 && !error.hubCode.startsWith("VERIFIER_")) {
    return { ok: false, reason: "TIMEOUT", message: "PaymentHub is not answering. Please try again in a minute." };
  }
  // VERIFIER_ERROR, VERIFIER_NOT_CONFIGURED, VERIFICATION_APP_LIMIT, a
  // refused key (401/403), anything unexpected: the check never ran.
  return { ok: false, reason: "UNAVAILABLE", code: error.hubCode, message: UNAVAILABLE_MESSAGE };
}

export async function requestBankCheck(
  input: VerifyBankAccountInput,
  idempotencyKey: string,
  opts: { budgetMs?: number; retryWaitMs?: number } = {},
): Promise<HubCheckOutcome> {
  if (!paymentHubConfigured) {
    return { ok: false, reason: "UNAVAILABLE", code: "NOT_CONFIGURED", message: UNAVAILABLE_MESSAGE };
  }
  const budget = opts.budgetMs ?? BUDGET_MS;
  const wait = opts.retryWaitMs ?? 3_000;
  const started = Date.now();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const remaining = budget - (Date.now() - started);
    if (remaining < 1_000) break;
    try {
      const verification = await verifyBankAccount(input, idempotencyKey, Math.min(HUB_TIMEOUT_MS, remaining));
      return { ok: true, verification };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_TRIES) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return classify(lastError);
}
