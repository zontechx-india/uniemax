import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

const commissionType = z.enum(["PERCENTAGE", "FIXED"]);
const rate = z.coerce.number().min(0).max(1_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const storeParam = z.object({ storeId: z.string().min(1) });
export const tokenParam = z.object({ token: z.string().min(1).max(64) });

export const programUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  commissionType: commissionType.optional(),
  commissionRate: rate.optional(),
  attributionDays: z.coerce.number().int().min(1).max(180).optional(),
  holdDays: z.coerce.number().int().min(0).max(90).optional(),
});

/** Null clears an override back to the programme default. */
export const productRuleSchema = z.object({
  enabled: z.boolean().optional(),
  commissionType: commissionType.nullable().optional(),
  commissionRate: rate.nullable().optional(),
});

export const productListQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
});

export const inviteCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(160),
  commissionType: commissionType.optional(),
  commissionRate: rate.optional(),
});

export const partnerUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "REMOVED"]).optional(),
  commissionType: commissionType.nullable().optional(),
  commissionRate: rate.nullable().optional(),
});

export const linkCreateSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1).nullish(),
  channel: z
    .enum(["YOUTUBE", "INSTAGRAM", "FACEBOOK", "WEBSITE", "WHATSAPP", "TELEGRAM", "OTHER"])
    .nullish(),
  label: optionalText(60),
});

export const linkUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  label: optionalText(60),
});

export const commissionListQuery = paginationQuery.extend({
  status: z
    .enum(["PENDING", "APPROVED", "PAID", "CANCELLED", "REVERSED", "REJECTED"])
    .optional(),
});

export const adminAffiliateUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const adminCommissionUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(300),
});

export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>;
export type ProductRuleInput = z.infer<typeof productRuleSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;
export type LinkCreateInput = z.infer<typeof linkCreateSchema>;
export type LinkUpdateInput = z.infer<typeof linkUpdateSchema>;
export type CommissionListQuery = z.infer<typeof commissionListQuery>;
