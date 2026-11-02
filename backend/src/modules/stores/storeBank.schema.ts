import { z } from "zod";
import { HOLDER_NAME_PATTERN } from "./bankCheck.js";

/**
 * Seller payout bank accounts. A store can save several (capped), exactly
 * one may be **primary** — the only account that receives payouts from
 * UnieMax when customers pay through the platform.
 *
 * Saving runs a bank check through PaymentHub (bankCheck.service.ts). The
 * field rules match the hub's, so a typo is caught before a paid check.
 * Nothing here takes a `payeeRef` — the hub id comes from the store row,
 * and unknown keys are stripped by Zod.
 */

/** Indian bank account number — digits only, 9–18 characters. */
const accountNumber = z
  .string()
  .trim()
  .regex(/^\d{9,18}$/, "Account number must be 9–18 digits");

/** IFSC: 4 letters + 0 + 6 alphanumerics (e.g. HDFC0001234). */
const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Must be a valid IFSC code like HDFC0001234");

/** As on the passbook — the hub's characters only. */
const accountHolderName = z
  .string()
  .trim()
  .min(1, "Account holder name is required")
  .max(100)
  .regex(HOLDER_NAME_PATTERN, "Use only English letters, numbers, spaces and . - / &");

/** UPI VPA, e.g. name@okhdfcbank. */
const upiId = z
  .string()
  .trim()
  .max(256)
  .regex(/^[\w.-]{2,}@[a-zA-Z]{2,64}$/, "Must be a UPI ID like name@bank")
  .nullish()
  .transform((v) => (v ? v : null));

/** Optional phone linked to the account (8–13 digits, + and spaces allowed). */
const phone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[\d ]{8,16}$/.test(v), "Phone must be 8–13 digits")
  .nullish()
  .transform((v) => (v ? v.replace(/\s/g, "") : null));

/** The step-up code (BANK_CHANGE) — required for every change but the first account. */
const otp = z.string().trim().regex(/^\d{4,8}$/, "Enter the code we sent you").optional();

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const bankAccountCreateSchema = z.object({
  accountHolderName,
  accountNumber,
  ifsc,
  bankName: requiredText("Bank name", 100),
  branch: requiredText("Branch", 100),
  upiId,
  phone,
  /** Make this the payout account — at once if no VERIFIED account is main,
   *  otherwise once this one is verified (the first account is always main). */
  isPrimary: z.boolean().optional(),
  otp,
});

/**
 * Partial update. `accountNumber` left out = keep the current one (the
 * seller never sees it in full). `isPrimary` accepts only `true` — the way
 * to demote a primary account is to promote another one.
 */
export const bankAccountUpdateSchema = z
  .object({
    accountHolderName: accountHolderName.optional(),
    accountNumber: accountNumber.optional(),
    ifsc: ifsc.optional(),
    bankName: requiredText("Bank name", 100).optional(),
    branch: requiredText("Branch", 100).optional(),
    upiId: upiId.optional(),
    phone: phone.optional(),
    isPrimary: z.literal(true).optional(),
    otp,
  })
  .refine((val) => Object.keys(val).some((key) => key !== "otp"), {
    message: "Provide at least one field to update",
  });

export const bankAccountParamSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
});

/** The bank-detail fields whose change needs a new check. */
export const BANK_DETAIL_FIELDS = [
  "accountHolderName",
  "accountNumber",
  "ifsc",
  "bankName",
  "branch",
  "upiId",
  "phone",
] as const;

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>;
