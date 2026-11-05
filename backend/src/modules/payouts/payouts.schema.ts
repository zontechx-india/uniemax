import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/**
 * Request shapes for seller payouts (admin console only).
 */

/** "" from an empty form field means "not given". */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50")
  .refine((v) => Number(v) > 0, "The amount must be more than zero");

/** One per dialog opening — a retried or double-clicked submit reuses it. */
const idempotencyKey = z.string().trim().min(8).max(100);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Not a real date");

const time = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the format HH:MM")
    .nullable()
    .optional(),
);

const utr = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .max(50)
    .regex(/^[A-Za-z0-9/-]+$/, "Letters, numbers, - and / only")
    .nullable()
    .optional(),
);

export const payoutParams = z.object({
  id: z.string().min(1),
  payoutId: z.string().min(1),
});

/** Money an admin already sent (or is sending) by hand. */
export const manualPayoutSchema = z.object({
  /** Money sent. May be 0 when the payout only settles COD dues. */
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50"),
  /** The seller's COD dues taken from this payout instead of being sent. */
  duesDeducted: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? "0" : v),
    z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 10 or 10.50"),
  ),
  idempotencyKey,
  /** Usually SUCCEEDED — the transfer is done when it is recorded. */
  status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED"]).default("SUCCEEDED"),
  /** Whose savings account the money left from. */
  senderName: z.string().trim().min(2, "Enter the sender's name").max(100),
  senderBank: optionalText(100),
  /** Last 4 digits of the sender's account — never the full number. */
  senderLast4: z.preprocess(
    (v) => (v === "" ? null : v),
    z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Enter only the last 4 digits")
      .nullable()
      .optional(),
  ),
  /** The day the money was sent, India time. */
  paidOn: day,
  /** Roughly when, India time — optional. */
  paidTime: time,
  utr,
  notes: optionalText(1000),
});

/** Ask PaymentHub to send the money. */
export const gatewayPayoutSchema = z.object({
  amount,
  idempotencyKey,
});

/** Move a MANUAL payout along (gateway payouts move only through PaymentHub). */
export const payoutStatusSchema = z.object({
  status: z.enum(["PROCESSING", "SUCCEEDED", "FAILED", "REVERSED", "CANCELLED"]),
  /** Required for FAILED / REVERSED / CANCELLED. */
  reason: optionalText(500),
  /** The bank reference, when it arrives with the success. */
  utr,
});

/** The "payout sent" message again, by hand, on one channel. */
export const payoutMessageSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});

export const payoutListQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "REVERSED", "CANCELLED"]).optional(),
  method: z.enum(["MANUAL", "GATEWAY"]).optional(),
});

export const awaitingPayoutQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
});

export type ManualPayoutInput = z.infer<typeof manualPayoutSchema>;
export type GatewayPayoutInput = z.infer<typeof gatewayPayoutSchema>;
export type PayoutStatusInput = z.infer<typeof payoutStatusSchema>;
export type PayoutListQuery = z.infer<typeof payoutListQuery>;
export type AwaitingPayoutQuery = z.infer<typeof awaitingPayoutQuery>;
