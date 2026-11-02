/**
 * Pure rules for checking a payout account with PaymentHub
 * (`POST /v1/verifications/bank-account`, ONBOARDING.md §4.6). Free of
 * Prisma and fetch so they are unit-testable (test/unit/bank-check.test.ts);
 * the hub call lives in bankCheck.hub.ts, the I/O in bankCheck.service.ts.
 */

/** PaymentHub's answers plus our own UNAVAILABLE (the check could not run). */
export type CheckStatus = "VALID" | "NEEDS_REVIEW" | "INVALID" | "RETRY_LATER" | "UNAVAILABLE";

/** Our id for the seller at the hub. Always from the DB, never from a form. */
export function payeeRefFor(storeId: string): string {
  return `store_${storeId}`;
}

/**
 * `bank-verify:<storeId>:<submissionId>` (ONBOARDING.md §4.6 step 2). The
 * submission is the account or change row plus its `updatedAt`, which moves
 * whenever the details are edited AND whenever a result is saved — so a
 * retry inside one request reuses the key (never charged twice), and a new
 * attempt after RETRY_LATER gets a new one (the hub would otherwise replay
 * the stored RETRY_LATER).
 */
export function checkIdempotencyKey(storeId: string, subjectId: string, updatedAt: Date): string {
  return `bank-verify:${storeId}:${subjectId}.${updatedAt.getTime()}`;
}

/**
 * The hub's holder-name rule: letters, digits, spaces and `. - / &`. New
 * input is validated against it (storeBank.schema.ts), so the seller fixes
 * it before a paid check.
 */
export const HOLDER_NAME_PATTERN = /^[A-Za-z0-9 .\-/&]+$/;

/**
 * Names saved before that rule existed may hold other characters: an
 * apostrophe in "D'Souza" or a comma becomes a space, which the bank's name
 * match tolerates. Null when nothing usable is left (e.g. a non-Latin
 * script) — the check is then not run and the admin verifies by hand.
 */
export function holderNameForHub(name: string): string | null {
  const cleaned = name
    .replace(/[^A-Za-z0-9 .\-/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return /[A-Za-z]/.test(cleaned) ? cleaned : null;
}

/** The hub accepts 8–13 digits; anything else is simply not sent. */
export function phoneForHub(phone: string | null | undefined): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  // "+91 98765 43210" → keep the last 10 for Indian numbers, as typed otherwise.
  const trimmed = digits.length > 13 ? digits.slice(-10) : digits;
  return trimmed;
}

/** What the seller is told on FAILED — never the hub's reasonCode. */
export const INVALID_SELLER_NOTE =
  "We couldn't verify this account with the bank. Check the account number and IFSC.";

export interface CheckSettlement {
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
  verificationMethod: "THIRD_PARTY" | null;
  verificationNote: string | null;
  /** Whether the seller hears about it (only a final answer is news). */
  notifySeller: boolean;
}

/**
 * A check's answer → the account's state. Only VALID and INVALID settle it;
 * NEEDS_REVIEW waits for a hub admin, RETRY_LATER says nothing about the
 * account, and UNAVAILABLE means the check never ran — never "invalid".
 */
export function settlementFor(status: CheckStatus): CheckSettlement {
  switch (status) {
    case "VALID":
      return { verificationStatus: "VERIFIED", verificationMethod: "THIRD_PARTY", verificationNote: null, notifySeller: true };
    case "INVALID":
      return { verificationStatus: "FAILED", verificationMethod: "THIRD_PARTY", verificationNote: INVALID_SELLER_NOTE, notifySeller: true };
    case "NEEDS_REVIEW":
    case "RETRY_LATER":
    case "UNAVAILABLE":
      return { verificationStatus: "PENDING", verificationMethod: null, verificationNote: null, notifySeller: false };
  }
}

/**
 * Whether a late `verification.updated` may still move the account: it must
 * be about the account's LATEST check (the seller may have changed details
 * since), and an admin's manual decision made meanwhile wins.
 */
export function acceptsReviewUpdate(
  account: { verificationRef: string | null; verificationMethod: string | null },
  verificationId: string,
): boolean {
  return account.verificationRef === verificationId && account.verificationMethod !== "MANUAL";
}

export interface BankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch: string;
}

/** What history and logs keep: never the full account number. */
export function maskedDetails(details: BankDetails) {
  return {
    holder: details.accountHolderName,
    last4: details.accountNumber.slice(-4),
    ifsc: details.ifsc,
    bankName: details.bankName,
    branch: details.branch,
  };
}
