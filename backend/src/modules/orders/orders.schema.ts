import { z } from "zod";
import {
  PHONE_MESSAGE,
  PINCODE_MESSAGE,
  isValidPincode,
  normalizePhone,
  normalizePincode,
  paginationQuery,
} from "../../utils/zodHelpers.js";
import { COURIER_CODES, isHttpUrl } from "./couriers.js";

/**
 * Storefront order placement (per store, guests welcome). The payload
 * carries item REFERENCES and quantities only — prices always come from the
 * live catalog server-side, never from the client. Which contact/delivery
 * fields are required is decided by the STORE's checkout configuration +
 * the chosen fulfilment, so `customer` is loosely typed here and validated
 * against the store config in the service.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * A billing address the customer gives when it differs from the delivery
 * address. Optional everywhere: absent / null = "same as delivery" (or, for
 * pickup, the contact details). Snapshotted on the order as JSON.
 */
export const billingAddressSchema = z.object({
  name: z.string().trim().min(1, "Billing name is required").max(100),
  phone: optionalText(20),
  address: z.string().trim().min(1, "Billing address is required").max(300),
  pincode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, "The billing pincode looks invalid"),
  state: optionalText(100),
  country: optionalText(100),
}).superRefine((val, ctx) => {
  if (!isValidPincode(val.pincode, val.country)) {
    ctx.addIssue({ code: "custom", path: ["pincode"], message: PINCODE_MESSAGE });
  }
  if (val.phone && !normalizePhone(val.phone, val.country)) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_MESSAGE });
  }
}).transform((val) => ({
  ...val,
  pincode: normalizePincode(val.pincode, val.country),
  phone: val.phone ? (normalizePhone(val.phone, val.country) ?? val.phone) : null,
}));

export type BillingAddressInput = z.infer<typeof billingAddressSchema>;

const orderItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1),
      /** Chosen option id — null for simple products. */
      variantId: z
        .string()
        .min(1)
        .nullish()
        .transform((v) => v ?? null),
      quantity: z.number().int().min(1).max(999),
    }),
  )
  .min(1, "The order has no items")
  .max(100);

/**
 * `POST /public/stores/:slug/orders/quote` — the checkout's price summary.
 * Same item references as placement, plus the fulfilment (shipping depends
 * on it). Nothing is written; the server prices the cart and quotes
 * shipping/tax/discount/total so the client never computes money itself.
 */
export const orderQuoteSchema = z.object({
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  items: orderItemsSchema,
});

export type OrderQuoteInput = z.infer<typeof orderQuoteSchema>;

/**
 * Optional `Idempotency-Key` header on order placement — one opaque key per
 * checkout attempt (the storefront sends a UUID). Same key from the same
 * customer ⇒ the same order back, never a second one.
 */
export const idempotencyHeaderSchema = z.object({
  "idempotency-key": z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, "Idempotency-Key must be 8–100 characters of A–Z, a–z, 0–9, _ or -")
    .optional(),
});

export const orderCreateSchema = z.object({
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["ONLINE", "COD"]),
  /** Null / absent = billed to the delivery (or contact) details. */
  billingAddress: billingAddressSchema
    .nullish()
    .transform((v) => v ?? null),
  customer: z
    .object({
      name: optionalText(100),
      phone: optionalText(20),
      email: optionalText(160),
      address: optionalText(300),
      pincode: optionalText(10),
      state: optionalText(100),
      country: optionalText(100),
    })
    .default(() => ({
      name: null,
      phone: null,
      email: null,
      address: null,
      pincode: null,
      state: null,
      country: null,
    }))
    // Canonical forms where the value is usable ("682 001" → "682001",
    // "098765 43210" → "+919876543210"); anything else is left as typed so
    // the service's per-store field check rejects it with a clear message.
    .transform((c) => ({
      ...c,
      phone: c.phone ? (normalizePhone(c.phone, c.country) ?? c.phone) : null,
      pincode: c.pincode ? normalizePincode(c.pincode, c.country) : null,
    })),
  items: orderItemsSchema,
  /** Answers to the store's own checkout questions, keyed by question id.
   *  Checked against the store's questions by the service. */
  customFields: z
    .record(z.string().max(32), z.string().max(500))
    .nullish()
    .transform((v) => v ?? {}),
  /** Affiliate attribution token the storefront picked up from /a/:token. */
  affiliateRef: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((v) => v || null),
});

export const orderParamSchema = z.object({
  slug: z.string().min(1),
  orderId: z.string().min(1),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderCustomerInput = OrderCreateInput["customer"];

// ---------------------------------------------------------------------------
// Seller order management (/stores/:id/orders — owner-scoped)
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export const sellerOrderListQuerySchema = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  /** Matches order number or customer name/phone. */
  q: z.string().trim().min(1).max(120).optional(),
});

/**
 * Statuses a seller can move an order TO. Cancelling is a separate endpoint
 * (it restores stock and takes a reason), and PENDING is only ever the
 * starting point — an order can't be moved back to it.
 */
export const orderStatusUpdateSchema = z.object({
  status: z.enum(["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"]),
});

export const orderCancelSchema = z.object({
  reason: optionalText(300),
  /**
   * Only for an order whose parcel came back: whether those returned items go
   * back in stock (they may be damaged). Asked, never assumed — the service
   * refuses the cancel when it is needed and missing. Items that never shipped
   * always go back in stock.
   */
  restockReturned: z.boolean().optional(),
});

export const sellerOrderParamSchema = z.object({
  id: z.string().min(1), // store id or slug
  orderId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Parcels (/stores/:id/orders/:orderId/shipments) — courier + tracking
// ---------------------------------------------------------------------------

/** "1234 5678 9012" → "123456789012"; letters, digits and dashes only. */
const trackingNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .min(4, "A tracking number has at least 4 characters")
      .max(40, "A tracking number has at most 40 characters")
      .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers and dashes"),
  );

const optionalTrackingNumber = z
  .union([trackingNumberSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

/** Only http(s): a `javascript:` link would run in the customer's browser. */
const optionalTrackingUrl = z
  .union([
    z
      .string()
      .trim()
      .max(500, "The link is too long")
      .refine(isHttpUrl, "The link must start with http:// or https://"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((value) => (value ? value : null));

/**
 * Courier + tracking for a parcel — used to send one and to correct its
 * tracking (the sheet always sends the full set). "other" needs the typed
 * courier name; own delivery ("self") has no tracking, so any number or link
 * sent with it is dropped by the service.
 */
export const shipmentTrackingSchema = z
  .object({
    carrierCode: z.enum(COURIER_CODES),
    carrierName: optionalText(60),
    trackingNumber: optionalTrackingNumber,
    trackingUrl: optionalTrackingUrl,
  })
  .superRefine((value, ctx) => {
    if (value.carrierCode === "other" && !value.carrierName) {
      ctx.addIssue({
        code: "custom",
        path: ["carrierName"],
        message: "Type the courier's name",
      });
    }
  });

export const shipmentParamSchema = sellerOrderParamSchema.extend({
  shipmentId: z.string().min(1),
});

export type SellerOrderListQuery = z.infer<typeof sellerOrderListQuerySchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type OrderCancelInput = z.infer<typeof orderCancelSchema>;
export type ShipmentTrackingInput = z.infer<typeof shipmentTrackingSchema>;
