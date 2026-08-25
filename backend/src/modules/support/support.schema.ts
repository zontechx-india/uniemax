import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/**
 * Support tickets — every request shape for both surfaces (the reporter's and
 * the platform team's), kept in one file because they describe the same
 * resource from two sides and drift apart the moment they are separated.
 */

export const TICKET_CATEGORIES = [
  "ORDERS",
  "PAYMENTS",
  "PAYOUTS",
  "PRODUCTS",
  "STORE_SETUP",
  "STORE_REPORT",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
] as const;

/**
 * Which side of the platform a ticket came from, derived from whether it
 * names a store rather than stored twice:
 *   STORE   — raised from a store's Help & Support (a seller about their shop)
 *   ACCOUNT — raised from the account menu (a shopper, or a seller writing
 *             about their own account rather than a store)
 * Both surfaces filter on it; nothing else distinguishes the two flows.
 */
export const TICKET_SCOPES = ["STORE", "ACCOUNT"] as const;

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Long enough to describe a real problem, short enough not to be an essay. */
const messageBody = z
  .string()
  .trim()
  .min(10, "Please describe the issue in at least 10 characters")
  .max(4000);

const optionalContact = <T extends z.ZodTypeAny>(inner: T) =>
  inner.nullish().transform((v) => (v ? v : null));

/**
 * Raise a ticket. `priority` is absent on purpose — triage belongs to the
 * platform team; given the choice every reporter picks URGENT and the field
 * stops sorting anything.
 */
export const ticketCreateSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(4, "Give the issue a short title")
    .max(150),
  category: z.enum(TICKET_CATEGORIES).default("OTHER"),
  message: messageBody,
  /** Store the issue is about — id or slug; omitted for account-level issues. */
  storeId: z.string().trim().min(1).nullish(),
  /** How to reach the reporter. Defaults to the account's own email/phone. */
  contactEmail: optionalContact(z.string().trim().email("Enter a valid email").max(160)),
  contactPhone: optionalContact(
    z
      .string()
      .trim()
      .min(5)
      .max(20)
      .regex(/^\+?[\d\s\-()]+$/, "Enter a valid phone number"),
  ),
});

/**
 * Raise a thread with a **store**. Same shape minus `storeId` — the store is
 * the path, not a field, because you are writing *to* it rather than *about*
 * it, and letting the body name a different one would be a way to post into
 * a store you never opened.
 */
export const storeTicketCreateSchema = ticketCreateSchema.omit({ storeId: true });

export const ticketMessageSchema = z.object({ message: messageBody });

/** The reporter's own list. */
export const ticketListQuery = paginationQuery.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  /** Scope to one store — the store's Support section passes its own id. */
  storeId: z.string().trim().min(1).optional(),
  /**
   * `ACCOUNT` = only tickets not about a store, which is what the account
   * menu's Help & Support lists. Without it a seller would see their store
   * threads mixed into their personal ones.
   */
  scope: z.enum(TICKET_SCOPES).optional(),
});

/** The platform queue: the reporter's filters plus triage and free-text. */
export const adminTicketListQuery = ticketListQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  /** OPEN + IN_PROGRESS in one filter — the "still my problem" view. */
  open: z.literal("true").optional(),
});

/**
 * Triage. Both fields optional so status and priority can move independently,
 * but at least one must be present — an empty PATCH is a client bug, not a
 * no-op worth auditing.
 */
export const adminTicketUpdateSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide a status or a priority",
  });

// ---- Seller side of a store thread ---------------------------------------

/** A shop's inbox. No `priority` filter — sellers have no priority to set. */
export const sellerTicketListQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  /** OPEN + IN_PROGRESS in one filter — the "still owes an answer" view. */
  open: z.literal("true").optional(),
});

/**
 * Status only. `priority` is the platform's triage vocabulary and a shop's
 * inbox is small enough to read without one, so it is not offered here.
 */
export const sellerTicketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

export const ticketParamSchema = z.object({ ticketId: z.string().min(1) });

/** The shopper's store-scoped routes: `/support/stores/:storeRef/tickets`. */
export const storeRefParamSchema = z.object({ storeRef: z.string().min(1) });

/**
 * The seller's tree, which nests under `/api/v1/stores/:id`. The param is
 * `id` rather than `storeRef` because Fastify's router allows only ONE
 * parameter name per path position, and every other route in `storeRoutes`
 * already claims `:id` there.
 */
export const sellerStoreParamSchema = z.object({ id: z.string().min(1) });
export const sellerTicketParamSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
});

export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type StoreTicketCreateInput = z.infer<typeof storeTicketCreateSchema>;
export type SellerTicketListQuery = z.infer<typeof sellerTicketListQuery>;
export type SellerTicketUpdateInput = z.infer<typeof sellerTicketUpdateSchema>;
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;
export type TicketListQuery = z.infer<typeof ticketListQuery>;
export type AdminTicketListQuery = z.infer<typeof adminTicketListQuery>;
export type AdminTicketUpdateInput = z.infer<typeof adminTicketUpdateSchema>;
