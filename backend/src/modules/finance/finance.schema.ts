import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/** Request shapes for seller finance. */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

/** A new fee version. Only GLOBAL scope is offered today. */
export const feeRuleCreateSchema = z.object({
  kind: z.enum(["PLATFORM", "GATEWAY"]),
  percent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percent like 5 or 2.5")
    .refine((v) => Number(v) <= 100, "At most 100%"),
  /** ISO date-time; empty = now. Never in the past. */
  effectiveFrom: z.preprocess(
    (v) => (v === "" ? null : v),
    z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date")
      .nullable()
      .optional(),
  ),
  /** GATEWAY only — who pays it. The platform fee is always the seller's. */
  bearer: z.enum(["SELLER", "PLATFORM"]).optional(),
  note: optionalText(300),
});

export const balanceListQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  /** PAYABLE = we owe them · OWED = they owe us. */
  filter: z.enum(["PAYABLE", "OWED"]).optional(),
});

export const ledgerListQuery = paginationQuery.extend({
  bucket: z.enum(["PAYABLE", "IN_PAYOUT", "OWED"]).optional(),
  type: z
    .enum([
      "ORDER_SALE",
      "PLATFORM_FEE",
      "GATEWAY_FEE",
      "COD_PLATFORM_FEE",
      "DUES_SETTLED",
      "DUES_RESTORED",
      "PAYOUT_RESERVED",
      "PAYOUT_PAID",
      "PAYOUT_RELEASED",
      "PAYOUT_RETURNED",
      "ADJUSTMENT",
    ])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** An admin's correction to one balance. */
export const adjustmentSchema = z.object({
  bucket: z.enum(["PAYABLE", "OWED"]),
  direction: z.enum(["INCREASE", "DECREASE"]),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 100 or 99.50")
    .refine((v) => Number(v) > 0, "The amount must be more than zero"),
  reason: z.string().trim().min(5, "Write the reason (at least 5 characters)").max(300),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const storeIdParams = z.object({ storeId: z.string().min(1) });

export type FeeRuleCreateInput = z.infer<typeof feeRuleCreateSchema>;
export type BalanceListQuery = z.infer<typeof balanceListQuery>;
export type LedgerListQuery = z.infer<typeof ledgerListQuery>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
