import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

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
});

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
    })),
  items: orderItemsSchema,
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
});

export const sellerOrderParamSchema = z.object({
  id: z.string().min(1), // store id or slug
  orderId: z.string().min(1),
});

export type SellerOrderListQuery = z.infer<typeof sellerOrderListQuerySchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type OrderCancelInput = z.infer<typeof orderCancelSchema>;
