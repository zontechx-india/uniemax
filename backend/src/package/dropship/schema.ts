import { z } from "zod";
import { paginationQuery, phoneSchema } from "../../utils/zodHelpers.js";
import { dropshipConfig } from "./config.js";

export const storeParam = z.object({ storeId: z.string().min(1) });
export const linkParam = storeParam.extend({ linkId: z.string().min(1) });
export const inviteParam = storeParam.extend({ id: z.string().min(1) });
export const productParam = storeParam.extend({ productId: z.string().min(1) });
export const tokenParam = z.object({ token: z.string().min(16).max(64) });

const returnFeePayer = z.enum(["SELLER", "SUPPLIER"], {
  error: "Choose who pays the shipping fee when a parcel comes back",
});
const codAllowed = z.boolean({ error: "Choose whether customers can pay cash on delivery" });
const money = z.coerce.number().min(0).max(1_000_000).multipleOf(0.01);
const linkStatus = z.enum(["ACTIVE", "PAUSED", "ENDED"]);
const line = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

/**
 * The pickup address shape. The host re-validates it against the core's
 * canonical address schema (state list included) before the store is made.
 */
const addressSchema = z.object({
  line1: line("Address", 200),
  line2: z.string().trim().max(200).nullish().transform((v) => v || null),
  city: line("City", 80),
  state: line("State", 80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
  country: z.string().trim().min(1).max(80).default("India"),
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
});

/**
 * Both terms are REQUIRED with no default (D-5, D-17): the seller must
 * answer each question, never accept a pre-selected one.
 */
export const inviteCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the supplier's name").max(100),
    phone: phoneSchema.optional(),
    email: z.email("Enter a valid email").max(160).optional(),
    codAllowed,
    returnFeePayer,
    /** Turn the store's own COD switch on in place (SU-6). */
    turnOnStoreCod: z.boolean().optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: "Enter the supplier's phone or email",
    path: ["phone"],
  });

/** The supplier's own terms. Asked when joining, never pre-selected. */
export const supplierProfileSchema = z.object({
  shippingFee: money,
  shipWithinDays: z.coerce.number().int().min(1).max(dropshipConfig.shipWithinDaysMax),
  /** 0 = no returns. */
  returnDays: z.coerce.number().int().min(0).max(dropshipConfig.returnDaysMax),
});

export const supplierProfileUpdateSchema = supplierProfileSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/**
 * Accept with a store the caller already owns (`storeId`) or a new
 * supply-only one (`newStore`). The profile is required unless that store is
 * already a supplier, which the service checks.
 */
export const inviteAcceptSchema = z
  .object({
    storeId: z.string().min(1).optional(),
    newStore: z
      .object({
        name: z.string().trim().min(1, "Enter your business name").max(60),
        phone: phoneSchema,
        address: addressSchema,
      })
      .optional(),
  })
  .extend(supplierProfileSchema.partial().shape)
  .refine((v) => !!v.storeId !== !!v.newStore, {
    message: "Choose one of your stores or create a supplier account",
    path: ["storeId"],
  });

export const sellerLinkUpdateSchema = z
  .object({
    codAllowed: z.boolean().optional(),
    returnFeePayer: returnFeePayer.optional(),
    status: linkStatus.optional(),
    /** Turn the store's own COD switch on in place when allowing COD. */
    turnOnStoreCod: z.boolean().optional(),
  })
  .refine(
    (v) => v.codAllowed !== undefined || v.returnFeePayer !== undefined || v.status !== undefined,
    { message: "Nothing to update" },
  );

export const supplierLinkUpdateSchema = z.object({ status: linkStatus });

export const supplyUpdateSchema = z.object({
  isOpen: z.boolean(),
  variants: z
    .array(
      z.object({
        variantId: z.string().min(1),
        cost: money.nullable(),
        isOpen: z.boolean(),
      }),
    )
    .max(200),
});

export const supplyBulkSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
  discountPct: z.coerce.number().min(0).max(90),
});

export const adminSupplierQuery = paginationQuery.extend({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]).optional(),
});

export const adminNoteSchema = z.object({
  note: z.string().trim().min(1, "Add a note").max(500),
});

/** Add one or many supplier products to the seller's store. */
export const resaleAddSchema = z.object({
  items: z
    .array(
      z.object({
        supplyProductId: z.string().min(1),
        /** Each option's own price ("Set each price myself"). */
        prices: z.array(z.object({ supplyVariantId: z.string().min(1), price: money })).max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
  /** An existing shelf, or each product on its own category's shelf (D-32). */
  shelf: z.union([z.object({ shelfId: z.string().min(1) }), z.object({ newShelf: z.literal(true) })]),
  addOnTop: z
    .union([
      z.object({ amount: z.coerce.number().min(0).max(1_000_000) }),
      z.object({ percent: z.coerce.number().min(0).max(1000) }),
    ])
    .optional(),
  followCost: z.boolean(),
  /** A pickup-only store turns on home delivery in place (C-22). */
  deliveryAmount: money.optional(),
});

export const resaleParam = storeParam.extend({ id: z.string().min(1) });
export const resaleUpdateSchema = z.object({ followCost: z.boolean() });
export const resaleOptionSchema = z.object({ supplyVariantId: z.string().min(1), price: money });
export const catalogQuery = z.object({
  supplierId: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().min(1).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export type ResaleAddInput = z.infer<typeof resaleAddSchema>;
export type CatalogQuery = z.infer<typeof catalogQuery>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type SupplierProfileInput = z.infer<typeof supplierProfileSchema>;
export type SupplierProfileUpdateInput = z.infer<typeof supplierProfileUpdateSchema>;
export type SellerLinkUpdateInput = z.infer<typeof sellerLinkUpdateSchema>;
export type SupplyUpdateInput = z.infer<typeof supplyUpdateSchema>;
export type SupplyBulkInput = z.infer<typeof supplyBulkSchema>;

// ---- Phase 4: supplier orders ------------------------------------------------

export const orderParam = storeParam.extend({ id: z.string().min(1) });
export const sellerOrderParam = storeParam.extend({ orderId: z.string().min(1) });
export const sellerPartParam = sellerOrderParam.extend({ id: z.string().min(1) });

export const supplierInboxQuery = z.object({ tab: z.enum(["new", "shipped", "done"]).default("new") });

/** Courier and tracking; the courier list and the link rules are the core's (checked by the host). */
export const trackingSchema = z.object({
  carrierCode: z.string().trim().min(1, "Choose the courier").max(40),
  carrierName: z.string().trim().max(60).nullish().transform((v) => v || null),
  trackingNumber: z.string().trim().min(1, "Add the tracking number").max(60),
  trackingUrl: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export const cantShipSchema = z.object({
  reason: z.enum(["OUT_OF_STOCK", "DAMAGED", "PINCODE", "OTHER"], { error: "Choose why it can't be shipped" }),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});

export const cameBackSchema = z.object({ restock: z.boolean({ error: "Choose whether the stock goes back" }) });

export const slipsQuery = z.object({
  ids: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1).max(200)),
});

export const problemSchema = z.object({
  note: z.string().trim().min(5, "Tell us what went wrong").max(1000),
});

export const sellerShipmentsQuery = paginationQuery.pick({ page: true }).extend({
  state: z.enum(["in_transit", "delivered", "came_back", "late"]).optional(),
  supplierId: z.string().min(1).optional(),
});

export const needsActionQuery = paginationQuery.pick({ page: true }).extend({
  kind: z.enum(["late", "cant_ship", "came_back", "problem", "refund"]).optional(),
});

export type TrackingBody = z.infer<typeof trackingSchema>;

// ---- Phase 5: the account and recorded payments --------------------------------

export const accountParam = storeParam.extend({ linkId: z.string().min(1) });
export const paymentParam = accountParam.extend({ paymentId: z.string().min(1) });

export const paymentSchema = z.object({
  /** "I paid {name}" (me) or "{name} paid me" (them). */
  paid: z.enum(["me", "them"], { error: "Choose who paid" }),
  amount: z.coerce.number({ error: "Enter the amount that was paid" }),
  paidOn: z.coerce.date({ error: "Choose the date it was paid" }),
  reference: z.string().trim().max(60).nullish().transform((v) => v || null),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
