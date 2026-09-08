import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/**
 * Every request shape the platform-admin console sends.
 *
 * Kept in ONE file (unlike the per-area split used by `modules/stores`)
 * because admin input is almost entirely list filters: a dozen small,
 * near-identical query schemas read better side by side than scattered across
 * eight files where the differences are invisible.
 */

/** Base for every admin list: pagination + a free-text search box. */
const searchQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
});

/** Reporting window shared by the dashboard and the payment summary. */
export const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// ---- Stores ---------------------------------------------------------------

export const storeListQuery = searchQuery.extend({
  /** Lifecycle filter — mirrors the chips above the table. */
  status: z.enum(["PUBLISHED", "DRAFT", "SUSPENDED"]).optional(),
  /**
   * Setup filter — "who still owes us something?", the console's usual
   * reason for opening this list. Independent of `status`: a store can be
   * published and still be missing its PAN.
   */
  setup: z.enum(["COMPLETE", "INCOMPLETE"]).optional(),
  // Revenue is deliberately NOT a sort option: summing a Decimal across a
  // relation can't be expressed in the query, and sorting a page in memory
  // would rank only that page. Order count is a relation count, which can.
  sort: z.enum(["NEWEST", "OLDEST", "NAME", "ORDERS"]).default("NEWEST"),
});

export const storeSuspendSchema = z.object({
  suspended: z.boolean(),
  /** Shown to nobody but the admin team — the seller sees a generic notice. */
  reason: z.string().trim().max(300).optional().nullable(),
});

export const bankVerificationSchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "FAILED"]),
  /** Required on FAILED so the seller learns what to fix. */
  note: z.string().trim().max(300).optional().nullable(),
});

// ---- Customers ------------------------------------------------------------

export const customerListQuery = searchQuery.extend({
  filter: z.enum(["SELLERS", "BLOCKED", "BUYERS"]).optional(),
});

export const customerBlockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(300).optional().nullable(),
});

// ---- Orders ---------------------------------------------------------------

const isoDate = z.coerce.date().optional();

export const orderListQuery = searchQuery.extend({
  status: z
    .enum(["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"])
    .optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  paymentMethod: z.enum(["ONLINE", "COD"]).optional(),
  storeId: z.string().min(1).optional(),
  from: isoDate,
  to: isoDate,
});

// ---- Products -------------------------------------------------------------

export const productListQuery = searchQuery.extend({
  storeId: z.string().min(1).optional(),
  /** OUT_OF_STOCK/LOW_STOCK read the denormalised `stockTotal` aggregate. */
  status: z
    .enum(["ACTIVE", "DISABLED", "OUT_OF_STOCK", "LOW_STOCK"])
    .optional(),
});

export const productVisibilitySchema = z.object({
  isActive: z.boolean(),
  /** Why the platform hid a seller's product — recorded in the audit trail. */
  reason: z.string().trim().max(300).optional().nullable(),
});

// ---- Store category → taxonomy mapping ------------------------------------

export const shelfListQuery = searchQuery.extend({
  storeId: z.string().min(1).optional(),
  /**
   * UNMAPPED is the working queue — shelves a seller typed before the
   * taxonomy existed, which are the only ones needing a decision.
   */
  status: z.enum(["UNMAPPED", "MAPPED"]).optional(),
});

export const shelfMappingSchema = z.object({
  /** The taxonomy node this shelf stands for; `null` unmaps it again. */
  categoryId: z.string().min(1).nullable(),
  /**
   * Also re-file the products sitting on the shelf. Defaults to true: making
   * those products findable platform-wide is the point of mapping at all.
   */
  applyToProducts: z.boolean().default(true),
});

// ---- Payments -------------------------------------------------------------

export const paymentListQuery = searchQuery.extend({
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  paymentMethod: z.enum(["ONLINE", "COD"]).optional(),
  from: isoDate,
  to: isoDate,
});

// ---- Audit trail ----------------------------------------------------------

export const auditListQuery = paginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
});

// ---- Admin accounts -------------------------------------------------------

/**
 * Admin passwords are the platform's most sensitive credential, so the floor
 * is deliberately higher than a customer's: 12 characters with mixed classes.
 */
const adminPassword = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Include an uppercase letter, a lowercase letter and a number",
  });

export const adminCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: adminPassword,
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).default("ADMIN"),
});

export const adminUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).optional(),
  isActive: z.boolean().optional(),
});

export const adminPasswordSchema = z.object({ password: adminPassword });

export type StoreListQuery = z.infer<typeof storeListQuery>;
export type StoreSuspendInput = z.infer<typeof storeSuspendSchema>;
export type BankVerificationInput = z.infer<typeof bankVerificationSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuery>;
export type CustomerBlockInput = z.infer<typeof customerBlockSchema>;
export type OrderListQuery = z.infer<typeof orderListQuery>;
export type ProductListQuery = z.infer<typeof productListQuery>;
export type ProductVisibilityInput = z.infer<typeof productVisibilitySchema>;
export type ShelfListQuery = z.infer<typeof shelfListQuery>;
export type ShelfMappingInput = z.infer<typeof shelfMappingSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuery>;
export type AuditListQuery = z.infer<typeof auditListQuery>;
export type AdminCreateInput = z.infer<typeof adminCreateSchema>;
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>;
export type RangeQuery = z.infer<typeof rangeQuery>;
