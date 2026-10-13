import { z } from "zod";
import { boolQuery, paginationQuery, phoneSchema } from "../../utils/zodHelpers.js";

/** Meta template names: lowercase letters, digits, underscores. */
const templateName = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,512}$/, "Template names are lowercase letters, digits and _");

/** Template language, e.g. "en", "en_US", "hi". */
const languageCode = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Use a language code like "en" or "en_US"');

/**
 * A number typed any way ("+91 98765-43210", "(987) 654 3210") — separators
 * are dropped before the shared phone check, which wants bare digits.
 */
const waNumber = z.preprocess(
  (value) => (typeof value === "string" ? value.replace(/[\s\-().]/g, "") : value),
  phoneSchema,
);

/** Values for the template body's {{1}}, {{2}}, … in order. */
const bodyParams = z.array(z.string().trim().min(1).max(1024)).max(50).default([]);

export const sendTemplateSchema = z.object({
  to: waNumber,
  templateName,
  languageCode,
  bodyParams,
});

export const sendTextSchema = z.object({
  to: waNumber,
  text: z.string().trim().min(1).max(4096),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateName,
  languageCode,
  recipients: z
    .array(z.object({ to: waNumber, bodyParams }))
    .min(1)
    .max(10_000),
});

export const campaignParamSchema = z.object({ id: z.string().min(1) });

export const waIdParamSchema = z.object({ waId: waNumber });

export const messageListQuery = paginationQuery;

export const contactListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  /** window = can still get free-form text · optedOut = sent STOP. */
  filter: z.enum(["window", "optedOut"]).optional(),
});

export const campaignListQuery = paginationQuery;

export const templatesQuery = z.object({ refresh: boolQuery.default(false) });

export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;
export type SendTextInput = z.infer<typeof sendTextSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type ContactListQuery = z.infer<typeof contactListQuery>;
