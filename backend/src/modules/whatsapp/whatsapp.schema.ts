import { z } from "zod";
import { boolQuery, paginationQuery, phoneSchema } from "../../utils/zodHelpers.js";
import { mappingSchema } from "./whatsapp.fields.js";

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

/** Media header by link — Meta fetches it, so it must be publicly reachable. */
const headerMedia = z
  .object({
    type: z.enum(["image", "video", "document"]),
    link: z.string().trim().url().max(2048),
  })
  .nullable()
  .default(null);

export const sendTemplateSchema = z.object({
  to: waNumber,
  templateName,
  languageCode,
  bodyParams,
  /** One value per dynamic URL button — the part of the link after its fixed prefix. */
  buttonParams: z.array(z.string().trim().min(1).max(2000)).max(10).default([]),
  header: headerMedia,
});

export const sendTextSchema = z.object({
  to: waNumber,
  text: z.string().trim().min(1).max(4096),
});

/** Photo, video or document inside the 24h reply window. */
export const sendMediaSchema = z.object({
  to: waNumber,
  type: z.enum(["image", "video", "document"]),
  link: z.string().trim().url().max(2048),
  caption: z.string().trim().max(1024).optional(),
  filename: z.string().trim().max(200).optional(),
});

// ---- Audiences ---------------------------------------------------------------

const sellerFilters = z
  .object({
    setup: z.enum(["complete", "incomplete"]).optional(),
    /** Setup under this percentage. */
    setupBelow: z.number().int().min(1).max(100).optional(),
    published: z.boolean().optional(),
    hasProducts: z.boolean().optional(),
    orders: z.enum(["none", "any"]).optional(),
    /** No order in the last N days. */
    noOrdersInDays: z.number().int().min(1).max(365).optional(),
    joinedWithinDays: z.number().int().min(1).max(3650).optional(),
    state: z.string().trim().min(1).max(80).optional(),
    /** Hand-picked stores; combined with the other filters. */
    storeIds: z.array(z.string().min(1)).max(1000).optional(),
  })
  .default({});

const contactFilters = z
  .object({
    /** Any of these tags. */
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    optedIn: z.boolean().optional(),
  })
  .default({});

export const segmentDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sellers"), filters: sellerFilters }),
  z.object({ kind: z.literal("contacts"), filters: contactFilters }),
]);

export const RETARGET_FILTERS = [
  "failed",
  "not_delivered",
  "not_read",
  "read",
  "clicked",
  "not_clicked",
  "replied",
  "not_replied",
] as const;

export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sellers"), filters: sellerFilters }),
  z.object({ kind: z.literal("contacts"), filters: contactFilters }),
  z.object({ kind: z.literal("segment"), segmentId: z.string().min(1) }),
  /** Retarget: recipients of an earlier campaign, by what happened to their message. */
  z.object({
    kind: z.literal("campaign"),
    campaignId: z.string().min(1),
    filter: z.enum(RETARGET_FILTERS),
  }),
  /** A pasted/uploaded list: a phone per row plus any columns as fields. */
  z.object({
    kind: z.literal("list"),
    rows: z
      .array(
        z.object({
          phone: z.string().trim().min(1).max(30),
          fields: z.record(z.string().regex(/^[a-z_]{1,40}$/), z.string().max(1024)).default({}),
        }),
      )
      .min(1)
      .max(10_000),
  }),
]);

export const segmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  definition: segmentDefinitionSchema,
});

export const audiencePreviewSchema = z.object({ audience: audienceSchema });

// ---- Campaigns ---------------------------------------------------------------

export const campaignDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateName,
  languageCode,
  audience: audienceSchema,
  mapping: mappingSchema,
  /** Only people with marketing consent on record. */
  requireOptIn: z.boolean().default(false),
  /** Skip anyone sent a campaign message in the last N hours. */
  frequencyCapHours: z.number().int().min(0).max(720).default(0),
  /** Send later; null or past = now. */
  scheduledAt: z.coerce.date().nullable().default(null),
});

export const campaignTestSchema = campaignDraftSchema.extend({
  name: z.string().trim().max(120).default("Test"),
  to: waNumber,
});

export const campaignActionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});

export const campaignParamSchema = z.object({ id: z.string().min(1) });

export const recipientListQuery = paginationQuery.extend({
  /** Queue state, or where the message got to at WhatsApp. */
  status: z
    .enum(["pending", "skipped", "failed", "sent", "delivered", "read", "clicked", "replied"])
    .optional(),
});

export const campaignListQuery = paginationQuery;

// ---- Contacts & inbox ----------------------------------------------------------

export const waIdParamSchema = z.object({ waId: waNumber });

export const messageListQuery = paginationQuery;

export const contactListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  /** window = can still get free-form text · optedOut = sent STOP · optedIn = marketing consent. */
  filter: z.enum(["window", "optedOut", "optedIn", "unread", "open", "done"]).optional(),
  tag: z.string().trim().max(40).optional(),
});

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9 _-]{0,39}$/, "Tags are letters, digits, spaces, - and _");

export const updateContactSchema = z.object({
  inboxState: z.enum(["OPEN", "DONE"]).optional(),
  tags: z.array(tag).max(20).optional(),
  /** Record (true) or withdraw (false) marketing consent. */
  marketingOptIn: z.boolean().optional(),
});

export const importContactsSchema = z.object({
  rows: z
    .array(
      z.object({
        phone: z.string().trim().min(1).max(30),
        name: z.string().trim().max(120).optional(),
        tags: z.array(tag).max(20).default([]),
        /** The person agreed to marketing messages. */
        optIn: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(5_000),
  /** Added to every row. */
  tags: z.array(tag).max(20).default([]),
});

export const quickReplySchema = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(4096),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const templatesQuery = z.object({ refresh: boolQuery.default(false) });

// ---- Automations -------------------------------------------------------------

export const automationParamSchema = z.object({ key: z.string().min(1).max(60) });

export const updateAutomationSchema = z.object({
  enabled: z.boolean(),
  templateName: templateName.nullable().default(null),
  languageCode: languageCode.nullable().default(null),
  mapping: mappingSchema,
  config: z.record(z.string(), z.unknown()).default({}),
});

// ---- Seller reminders ----------------------------------------------------------

/**
 * Seller reminders (`whatsapp.sellerReminders.ts`): `setup` = everything
 * outstanding in one message, a step key = that step alone, `tip` = the
 * marketing nudge.
 */
export const REMINDER_KEYS = ["setup", "catalog", "address", "tax", "payout", "tip"] as const;
export type ReminderKey = (typeof REMINDER_KEYS)[number];

export const storeParamSchema = z.object({ id: z.string().min(1) });

export const sendSellerReminderSchema = z.object({ key: z.enum(REMINDER_KEYS) });

export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;
export type SendTextInput = z.infer<typeof sendTextSchema>;
export type SendMediaInput = z.infer<typeof sendMediaSchema>;
export type ContactListQuery = z.infer<typeof contactListQuery>;
export type Audience = z.infer<typeof audienceSchema>;
export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;
export type SellerFilters = z.infer<typeof sellerFilters>;
export type CampaignDraft = z.infer<typeof campaignDraftSchema>;
export type RetargetFilter = (typeof RETARGET_FILTERS)[number];
