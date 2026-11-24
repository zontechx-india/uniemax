import { z } from "zod";
import { isValidPincode, normalizeIndianPhone, PHONE_MESSAGE, PINCODE_MESSAGE } from "../../utils/zodHelpers.js";

/**
 * Seller bills — request shapes. Parsed in the controllers; the service only
 * ever sees these validated values.
 */

const indianPhone = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const phone = normalizeIndianPhone(raw);
    if (!phone) ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
    return phone ?? "";
  });

/** How long a bill's link takes payment. */
export const BILL_EXPIRY_DAYS = [1, 3, 7] as const;

export const billCreateSchema = z
  .object({
    customerPhone: indianPhone,
    customerName: z.string().trim().max(80).optional().transform((v) => v || null),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          // Null/absent for a product without options (its Default variant).
          variantId: z.string().min(1).nullish().transform((v) => v ?? null),
          quantity: z.coerce.number().int().min(1).max(999),
        }),
      )
      .min(1, "Add at least one item")
      .max(50, "A bill can hold up to 50 lines"),
    // Null/absent = the store's usual delivery rate.
    shippingCharge: z.coerce.number().min(0).max(100000).nullish().transform((v) => v ?? null),
    discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
    discountValue: z.coerce.number().min(0).max(1000000).default(0),
    note: z.string().trim().max(200).optional().transform((v) => v || null),
    expiryDays: z.coerce
      .number()
      .int()
      .refine((n) => (BILL_EXPIRY_DAYS as readonly number[]).includes(n), "Choose 1, 3 or 7 days")
      .default(3),
    // LINK = the customer pays online from the link; OFFLINE = the seller
    // was already paid (cash / UPI to their own number / bank / other).
    payWay: z.enum(["LINK", "OFFLINE"]).default("LINK"),
    offlineMode: z.enum(["CASH", "UPI", "BANK", "OTHER"]).optional(),
    offlineRef: z.string().trim().max(60).optional().transform((v) => v || null),
    // OFFLINE only: DELIVER (the seller types the address) or TAKEN (in the shop, now).
    handover: z.enum(["DELIVER", "TAKEN"]).default("DELIVER"),
    address: z.string().trim().max(300).optional().default(""),
    pincode: z.string().trim().max(10).optional().default(""),
    state: z.string().trim().max(60).optional().default(""),
  })
  .refine((v) => v.discountType !== "PERCENT" || v.discountValue <= 100, {
    message: "A discount cannot be more than 100%",
    path: ["discountValue"],
  })
  .superRefine((v, ctx) => {
    if (v.payWay !== "OFFLINE") return;
    if (!v.offlineMode) ctx.addIssue({ code: "custom", message: "Choose how you were paid", path: ["offlineMode"] });
    if (v.handover === "DELIVER") {
      if (v.address.length < 10) ctx.addIssue({ code: "custom", message: "Enter the delivery address", path: ["address"] });
      if (!isValidPincode(v.pincode, "India")) ctx.addIssue({ code: "custom", message: PINCODE_MESSAGE, path: ["pincode"] });
      if (!v.state) ctx.addIssue({ code: "custom", message: "Choose the state", path: ["state"] });
    }
  });
export type BillCreateInput = z.infer<typeof billCreateSchema>;

export const billParamSchema = z.object({ id: z.string().min(1), billId: z.string().min(1) });
export const tokenParamSchema = z.object({ token: z.string().min(8).max(40) });

export const billListQuerySchema = z.object({
  tab: z.enum(["ALL", "WAITING", "PAID", "CLOSED"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type BillListQuery = z.infer<typeof billListQuerySchema>;

export const billShareSchema = z.object({ via: z.enum(["WHATSAPP", "COPY", "SHARE"]) });

/** The item picker: search by words (name, SKU, size/colour, category), a category, a page of 30. */
export const billCatalogQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  categoryId: z.string().trim().optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});
export type BillCatalogQuery = z.infer<typeof billCatalogQuerySchema>;

/** The customer paying: who it is for and where it goes (address only for delivery bills). */
export const billPaySchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(80),
    phone: indianPhone,
    address: z.string().trim().max(300).optional().default(""),
    pincode: z.string().trim().max(10).optional().default(""),
    state: z.string().trim().max(60).optional().default(""),
  })
  .superRefine((v, ctx) => {
    // Checked in the service only for delivery bills; shape-checked here when given.
    if (v.pincode && !isValidPincode(v.pincode, "India")) {
      ctx.addIssue({ code: "custom", message: PINCODE_MESSAGE, path: ["pincode"] });
    }
  });
export type BillPayInput = z.infer<typeof billPaySchema>;

export const adminBillListQuerySchema = z.object({
  state: z.enum(["", "OPEN", "PAID", "EXPIRED", "CANCELLED"]).default(""),
  storeId: z.string().trim().optional().default(""),
  q: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminBillListQuery = z.infer<typeof adminBillListQuerySchema>;
