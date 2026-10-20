import { randomInt } from "node:crypto";
import type { StoreActor } from "../stores/storeActor.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { isProduction } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import {
  PHONE_MESSAGE,
  PINCODE_MESSAGE,
  isValidPincode,
  normalizePhone,
} from "../../utils/zodHelpers.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
import { emit } from "../../package/events/index.js";
import {
  checkoutRestrictions,
  runHooks,
  type CheckoutLine,
} from "../../package/events/hooks.js";
import { clearStoreLines } from "../cart/cart.service.js";
import { recomputeProductAggregates } from "../stores/catalogSlug.js";
import { getMyStore } from "../stores/stores.service.js";
import {
  resolveCheckoutFields,
  resolvePayments,
  resolveShipping,
} from "../stores/stores.schema.js";
import type { CheckoutFieldKey } from "../stores/stores.schema.js";
import {
  effectiveDeliveryRule,
  isDeliverable,
  resolveProductDeliveryRule,
  restrictsDelivery,
} from "../stores/deliveryRules.js";
import {
  quoteShipping,
  resolveProductShippingOverride,
} from "../stores/shippingRates.js";
import {
  getVisibleStore,
  visibleProductWhere,
} from "../stores/publicStore.service.js";
import type {
  OrderCreateInput,
  OrderCustomerInput,
  OrderQuoteInput,
  OrderStatusUpdateInput,
  SellerOrderListQuery,
} from "./orders.schema.js";
import {
  notifyCustomerCancelled,
  notifyOrderPlaced,
  notifyOrderStatusChange,
} from "./orders.notifications.js";
import {
  shapeShipment,
  shipmentSelect,
  type OrderAudience,
} from "./shipments.shape.js";
import {
  gatewayConfigured,
  createPaymentSession,
  reconcilePendingPayment,
  voidPaymentSession,
  type PaymentSession,
} from "../payments/payments.service.js";

/**
 * Order placement — the storefront checkout's final step. Requires a
 * signed-in customer (the route runs behind `requireCustomer`); every order
 * is attached to the account that placed it. Browsing and the cart stay
 * anonymous — sign-in is enforced at the point of ordering.
 *
 * Money and availability NEVER come from the client: every line is re-priced
 * from the live catalog inside the transaction, stock is decremented with a
 * guarded update (a concurrent order can't oversell), and the totals are
 * computed server-side:
 *
 *   total (grand total) = subtotal − discount + shippingCharge + tax
 *
 * Shipping is quoted by `shippingRates.ts#quoteShipping` (store rate, free-
 * above threshold, per-product overrides); tax and discount are reserved
 * columns that stay 0 until tax configuration and coupons exist. The same
 * pricing runs in `quoteOrder` for the checkout summary, so the customer
 * sees exactly what placement will charge — the client never computes money.
 *
 * Payment: COD orders start `paymentStatus: PENDING`. ONLINE orders go
 * through Cashfree when the gateway keys are configured — the order is
 * created PENDING, a Cashfree payment session is attached, and the response
 * carries `payment.paymentSessionId` for the web SDK; PAID arrives via the
 * webhook (payments module). Without keys, dev builds simulate the payment
 * (`paymentRef: "DEV-SIMULATED"`, marked PAID instantly) and production
 * refuses ONLINE with 503.
 */

const FIELD_LABELS: Record<CheckoutFieldKey, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  pincode: "Pincode",
  state: "State",
  country: "Country",
};

/** "UM-<time base36>-<4 random>" — short, unique enough, customer-friendly. */
function newOrderNumber(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += alphabet[randomInt(alphabet.length)];
  }
  return `UM-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  storeName: true,
  storeSlug: true,
  fulfilment: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  addressLine: true,
  pincode: true,
  state: true,
  country: true,
  billingAddress: true,
  subtotal: true,
  shippingCharge: true,
  shippingMethod: true,
  shippingBasis: true,
  tax: true,
  discount: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  paymentRef: true,
  placedAt: true,
  // Lifecycle stamps — null until the seller reaches that stage (a skipped
  // stage, e.g. SHIPPED on a pickup order, stays null forever).
  confirmedAt: true,
  packedAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReason: true,
  cancelledByCustomer: true,
  items: {
    select: {
      id: true,
      productName: true,
      variantName: true,
      sku: true,
      productSlug: true,
      imageKey: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      /** The parcel this line went out in (null until it ships). */
      shipmentId: true,
      /** Set when another party ships this line (a package's tag). */
      fulfilledBy: true,
    },
  },
  shipments: { orderBy: { shippedAt: "asc" }, select: shipmentSelect },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

/**
 * The order as `audience` may see it. Only its parcels differ by audience
 * (the proof photo is the seller's, tracking is hidden from the public link);
 * contact redaction for the public link is `getPublicOrder`'s job.
 */
function shapeOrder(row: OrderRow, audience: OrderAudience = "customer") {
  const { items, shipments, ...rest } = row;
  return {
    ...rest,
    items: items.map(({ imageKey, ...item }) => ({
      ...item,
      imageUrl: mediaUrl("media", imageKey),
    })),
    shipments: shipments.map((shipment) => shapeShipment(shipment, audience)),
  };
}

/** One order, freshly read and shaped for `audience`. */
export async function loadOrder(orderId: string, audience: OrderAudience) {
  const row = await prisma.order.findFirst({
    where: { id: orderId },
    select: orderSelect,
  });
  if (!row) throw HttpError.notFound("Order not found");
  return shapeOrder(row, audience);
}

export type ShapedOrder = ReturnType<typeof shapeOrder>;

/** Require + format-check the fields this store collects for this order. */
function validateCustomerFields(
  checkout: ReturnType<typeof resolveCheckoutFields>,
  customer: OrderCustomerInput,
  withAddress: boolean,
): void {
  const keys: CheckoutFieldKey[] = withAddress
    ? ["name", "phone", "email", "address", "pincode", "state", "country"]
    : ["name", "phone", "email"];
  for (const key of keys) {
    if (!checkout[key]) continue;
    const value = customer[key];
    if (!value) {
      throw HttpError.badRequest(`${FIELD_LABELS[key]} is required`);
    }
    if (key === "phone" && !normalizePhone(value, customer.country)) {
      throw HttpError.badRequest(PHONE_MESSAGE);
    }
    if (key === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
      throw HttpError.badRequest("The email address looks invalid");
    }
    if (key === "pincode" && !isValidPincode(value, customer.country)) {
      throw HttpError.badRequest(PINCODE_MESSAGE);
    }
  }
}

// ---------------------------------------------------------------------------
// Pricing — shared by the checkout quote and order placement
// ---------------------------------------------------------------------------

/** Everything about a product that pricing, COD and shipping need. */
const pricingProductSelect = {
  id: true,
  name: true,
  slug: true,
  deliveryRule: true,
  shippingOverride: true,
  codAvailable: true,
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      stockQuantity: true,
      isDefault: true,
      sku: true,
      media: { select: { key: true } },
    },
  },
  media: {
    where: { type: "IMAGE" as const },
    orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: { key: true },
  },
} satisfies Prisma.StoreProductSelect;

type PricingProduct = Prisma.StoreProductGetPayload<{
  select: typeof pricingProductSelect;
}>;

type OrderItemRef = OrderCreateInput["items"][number];

interface PricedLine {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  productSlug: string;
  imageKey: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  stockVariantId: string;
  codAvailable: boolean;
  shippingOverride: ReturnType<typeof resolveProductShippingOverride>;
}

/** Priced lines as the checkout-options hook sees them. */
function checkoutLines(lines: PricedLine[]): CheckoutLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
  }));
}

/** Duplicate product+variant references are a client bug, not a merge request. */
function assertNoDuplicateLines(items: OrderItemRef[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.productId} ${item.variantId ?? ""}`;
    if (seen.has(key)) throw HttpError.badRequest("Duplicate order line");
    seen.add(key);
  }
}

/** The publicly sellable products among the referenced ids, keyed by id. */
async function loadPricingProducts(
  storeId: string,
  items: OrderItemRef[],
): Promise<Map<string, PricingProduct>> {
  const products = await prisma.storeProduct.findMany({
    where: {
      ...visibleProductWhere(storeId),
      id: { in: [...new Set(items.map((i) => i.productId))] },
    },
    select: pricingProductSelect,
  });
  return new Map(products.map((p) => [p.id, p]));
}

/**
 * Price one requested line from the live catalog. `strict` (placement)
 * refuses vanished products/variants and short stock with 409; the quote
 * path passes `strict: false` and gets null for lines it should skip — the
 * cart's own revalidation already tells the customer about those, and a
 * price summary must not blow up while it does.
 */
function priceLine(
  item: OrderItemRef,
  product: PricingProduct | undefined,
  strict: boolean,
): PricedLine | null {
  if (!product) {
    if (!strict) return null;
    throw HttpError.conflict(
      "An item in your order is no longer available — refresh your cart",
    );
  }
  const variant = item.variantId
    ? product.variants.find((v) => v.id === item.variantId && !v.isDefault)
    : product.variants.find((v) => v.isDefault);
  if (!variant) {
    if (!strict) return null;
    throw HttpError.conflict(
      `"${product.name}" changed — refresh your cart and try again`,
    );
  }
  if (strict && variant.stockQuantity < item.quantity) {
    throw HttpError.conflict(
      variant.stockQuantity === 0
        ? `"${product.name}" is out of stock`
        : `Only ${variant.stockQuantity} left of "${product.name}"`,
    );
  }
  const unitPrice = new Prisma.Decimal(variant.price);
  return {
    productId: product.id,
    variantId: item.variantId,
    productName: product.name,
    variantName: item.variantId ? variant.name : null,
    sku: variant.sku,
    productSlug: product.slug,
    imageKey: variant.media?.key ?? product.media[0]?.key ?? null,
    unitPrice,
    quantity: item.quantity,
    lineTotal: unitPrice.mul(item.quantity),
    stockVariantId: variant.id,
    codAvailable: product.codAvailable,
    shippingOverride: resolveProductShippingOverride(product.shippingOverride),
  };
}

/**
 * The money side of an order, from priced lines + the store's settings.
 * One function for the quote and the placement — never two formulas.
 */
function priceOrder(
  lines: PricedLine[],
  fulfilment: "DELIVERY" | "PICKUP",
  shipping: ReturnType<typeof resolveShipping>,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum.add(line.lineTotal),
    new Prisma.Decimal(0),
  );
  const quote = quoteShipping({
    fulfilment,
    storeRate: shipping.rate,
    subtotal,
    lines: lines.map((line) => ({
      productName: line.productName,
      override: line.shippingOverride,
    })),
  });
  // Reserved: prices are GST-inclusive and there are no coupons yet, so both
  // are 0 — but they are part of the formula so the total never changes
  // shape when they become real.
  const tax = new Prisma.Decimal(0);
  const discount = new Prisma.Decimal(0);
  const total = subtotal.sub(discount).add(quote.charge).add(tax);
  return {
    subtotal,
    shippingCharge: quote.charge,
    shippingMethod: quote.method,
    shippingBasis: quote.basis,
    tax,
    discount,
    total,
  };
}

/**
 * Which payment methods this particular order can use. COD needs the store
 * switch AND every product's own `codAvailable`; the names of the products
 * that block it let the checkout say why.
 */
function paymentMethodsFor(
  payments: ReturnType<typeof resolvePayments>,
  lines: PricedLine[],
) {
  const codUnavailableFor = [
    ...new Set(lines.filter((l) => !l.codAvailable).map((l) => l.productName)),
  ];
  return {
    online: payments.acceptOnlinePayment,
    cod: payments.acceptCod && codUnavailableFor.length === 0,
    /** Product names that rule COD out (empty when the store itself disables it). */
    codUnavailableFor: payments.acceptCod ? codUnavailableFor : [],
  };
}

/**
 * Checkout price summary — what placing this cart with this fulfilment would
 * cost, and which payment methods it may use. Reads only. Visible stores
 * (incl. the owner's draft preview) so the owner can see their shipping
 * rules at work before publishing; lines that are no longer sellable are
 * dropped rather than failing the whole summary.
 */
export async function quoteOrder(
  storeSlug: string,
  input: OrderQuoteInput,
  viewerId?: string,
) {
  const store = await getVisibleStore(storeSlug, viewerId);
  assertNoDuplicateLines(input.items);
  const productById = await loadPricingProducts(store.id, input.items);
  const lines = input.items
    .map((item) => priceLine(item, productById.get(item.productId), false))
    .filter((line): line is PricedLine => line !== null);

  const money = priceOrder(lines, input.fulfilment, resolveShipping(store.shipping));
  // A package may rule COD or pickup out for this cart (with the reason the
  // checkout shows) — always null while none is registered.
  const restrictions = await checkoutRestrictions(store.id, checkoutLines(lines));
  const paymentMethods = paymentMethodsFor(resolvePayments(store.payments), lines);
  return {
    fulfilment: input.fulfilment,
    ...money,
    paymentMethods: {
      ...paymentMethods,
      cod: paymentMethods.cod && restrictions.cod === null,
    },
    restrictions,
    lines: lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  };
}

/**
 * The order an earlier request with the same `Idempotency-Key` created, in
 * the placement response shape — or null. A replay never re-opens a payment
 * session: the order page owns "Pay now" for an unpaid ONLINE order.
 */
async function findIdempotentOrder(customerId: string, idempotencyKey: string) {
  const existing = await prisma.order.findUnique({
    where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
    select: orderSelect,
  });
  return existing ? { ...shapeOrder(existing), payment: null } : null;
}

function isIdempotencyConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  return JSON.stringify(err.meta ?? {}).includes("idempotencyKey");
}

export async function createOrder(
  storeSlug: string,
  input: OrderCreateInput,
  customerId: string,
  idempotencyKey?: string,
) {
  // Replay of a placement that already succeeded (double-fired button,
  // network retry after the response was lost): hand back that order.
  if (idempotencyKey) {
    const replay = await findIdempotentOrder(customerId, idempotencyKey);
    if (replay) return replay;
  }

  // Only LIVE stores take orders — an owner's draft preview can browse but
  // never sell, so drafts deliberately 404 here like they do for anyone else.
  const store = await prisma.store.findFirst({
    where: { slug: storeSlug, isPublished: true, suspendedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      payments: true,
      shipping: true,
      checkout: true,
      // Owner's account email — the "new order" alert recipient.
      owner: { select: { id: true, email: true } },
    },
  });
  if (!store) throw HttpError.notFound("Store not found");

  // --- config gates: method + fulfilment must be seller-enabled -----------
  const payments = resolvePayments(store.payments);
  if (input.paymentMethod === "ONLINE" && !payments.acceptOnlinePayment) {
    throw HttpError.badRequest("This store does not accept online payment");
  }
  if (input.paymentMethod === "COD" && !payments.acceptCod) {
    throw HttpError.badRequest("This store does not accept cash on delivery");
  }
  // Per-product COD is checked once the lines are priced (below).
  if (input.paymentMethod === "ONLINE" && isProduction && !gatewayConfigured) {
    // Without gateway keys, production must never pretend a payment happened.
    throw new HttpError(
      503,
      "Online payment is not available yet — please choose another method",
    );
  }

  const shipping = resolveShipping(store.shipping);
  if (input.fulfilment === "DELIVERY" && shipping.mode === "PICKUP") {
    throw HttpError.badRequest("This store is pickup-only");
  }
  if (input.fulfilment === "PICKUP" && shipping.mode === "DELIVERY") {
    throw HttpError.badRequest("This store does not offer store pickup");
  }

  // --- customer details per the seller's checkout-field config -------------
  const checkout = resolveCheckoutFields(store.checkout);
  const withAddress = input.fulfilment === "DELIVERY";
  validateCustomerFields(checkout, input.customer, withAddress);

  // --- re-price every line from the live catalog ---------------------------
  // One line per product+variant; duplicate references are rejected rather
  // than silently merged (the cart never produces them). Strict mode: a
  // vanished product/variant or short stock is a 409 the customer must see.
  assertNoDuplicateLines(input.items);
  const productById = await loadPricingProducts(store.id, input.items);
  const lines = input.items.map(
    (item) => priceLine(item, productById.get(item.productId), true)!,
  );

  // --- COD is per product too: one product that refuses it rules it out ----
  if (input.paymentMethod === "COD") {
    const blockers = paymentMethodsFor(payments, lines).codUnavailableFor;
    if (blockers.length > 0) {
      throw HttpError.badRequest(
        `Cash on delivery is not available for: ${blockers
          .map((name) => `"${name}"`)
          .join(", ")} — choose another payment method`,
      );
    }
  }

  // --- a package may rule COD / pickup out for this cart (hooks.ts) ---------
  const restrictions = await checkoutRestrictions(store.id, checkoutLines(lines));
  if (input.paymentMethod === "COD" && restrictions.cod) {
    throw HttpError.badRequest(restrictions.cod);
  }
  if (input.fulfilment === "PICKUP" && restrictions.pickup) {
    throw HttpError.badRequest(restrictions.pickup);
  }

  // --- delivery areas: every line must reach the customer's pincode --------
  // The product's own rule wins over the store default (deliveryRules.ts).
  // A restricted product with no pincode to check against is refused rather
  // than waved through — the seller limited where it goes, and an order
  // that cannot be checked would be one the seller then has to cancel.
  if (withAddress) {
    const pincode = input.customer.pincode;
    const storeRule = shipping.deliveryRule;
    const undeliverable: string[] = [];
    let unchecked = false;
    for (const productId of new Set(lines.map((l) => l.productId))) {
      const product = productById.get(productId)!;
      const rule = effectiveDeliveryRule(
        resolveProductDeliveryRule(product.deliveryRule),
        storeRule,
      );
      if (!restrictsDelivery(rule)) continue;
      if (!pincode) {
        unchecked = true;
      } else if (!isDeliverable(rule, pincode)) {
        undeliverable.push(product.name);
      }
    }
    if (unchecked) {
      throw HttpError.badRequest(
        "Enter your pincode — some items in this order are delivered to selected areas only",
      );
    }
    if (undeliverable.length > 0) {
      throw HttpError.badRequest(
        `Not deliverable to pincode ${pincode}: ${undeliverable
          .map((name) => `"${name}"`)
          .join(", ")}`,
      );
    }
  }

  // --- money: the same formula the checkout quote showed -------------------
  const money = priceOrder(lines, input.fulfilment, shipping);
  // A billing address only makes sense alongside a delivery address; pickup
  // and same-as-delivery orders leave it null (= the contact details).
  const billingAddress =
    withAddress && input.billingAddress
      ? {
          name: input.billingAddress.name,
          phone: input.billingAddress.phone,
          addressLine: input.billingAddress.address,
          pincode: input.billingAddress.pincode,
          state: input.billingAddress.state,
          country: input.billingAddress.country,
        }
      : null;

  // Real gateway when keys are configured (any env — sandbox keys in dev
  // exercise the real flow); the old dev simulation only without them.
  const viaGateway = input.paymentMethod === "ONLINE" && gatewayConfigured;
  const simulated =
    input.paymentMethod === "ONLINE" && !isProduction && !gatewayConfigured;

  let row: OrderRow;
  try {
    row = await prisma.$transaction(async (tx) => {
      // Guarded decrement: the WHERE re-checks stock inside the transaction,
      // so two simultaneous orders can never oversell a variant.
      for (const line of lines) {
        const updated = await tx.storeProductVariant.updateMany({
          where: {
            id: line.stockVariantId,
            stockQuantity: { gte: line.quantity },
          },
          data: { stockQuantity: { decrement: line.quantity } },
        });
        if (updated.count === 0) {
          throw HttpError.conflict(
            `"${line.productName}" just sold out — refresh your cart`,
          );
        }
      }
      for (const productId of new Set(lines.map((l) => l.productId))) {
        await recomputeProductAggregates(productId, tx);
      }

      const created = await tx.order.create({
        data: {
          orderNumber: newOrderNumber(),
          storeId: store.id,
          storeName: store.name,
          storeSlug: store.slug,
          customerId,
          fulfilment: input.fulfilment,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          addressLine: withAddress ? input.customer.address : null,
          pincode: withAddress ? input.customer.pincode : null,
          state: withAddress ? input.customer.state : null,
          country: withAddress ? input.customer.country : null,
          billingAddress: billingAddress ?? Prisma.DbNull,
          subtotal: money.subtotal,
          shippingCharge: money.shippingCharge,
          shippingMethod: money.shippingMethod,
          shippingBasis: money.shippingBasis as unknown as Prisma.InputJsonValue,
          tax: money.tax,
          discount: money.discount,
          total: money.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: simulated ? "PAID" : "PENDING",
          paymentRef: simulated ? "DEV-SIMULATED" : null,
          affiliateRef: input.affiliateRef,
          idempotencyKey: idempotencyKey ?? null,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              variantName: line.variantName,
              sku: line.sku,
              productSlug: line.productSlug,
              imageKey: line.imageKey,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
        },
        select: orderSelect,
      });
      // A package takes its part inside the same transaction (e.g. reserving
      // a supplier's stock) — or refuses, rolling the whole placement back.
      await runHooks("order.placing", tx, created.id);
      return created;
    });
  } catch (err) {
    // Two requests with the same key raced past the replay check: the
    // unique (customerId, idempotencyKey) index let exactly one commit and
    // rolled this one back — stock decrement included. Answer with the winner.
    if (idempotencyKey && isIdempotencyConflict(err)) {
      const replay = await findIdempotentOrder(customerId, idempotencyKey);
      if (replay) return replay;
    }
    throw err;
  }

  // Gateway orders: register the Cashfree order and hand the session id to
  // the client. If Cashfree refuses, the order must not linger holding stock
  // — undo the placement (nothing references it yet) and surface the error.
  let payment: PaymentSession | undefined;
  if (viaGateway) {
    try {
      payment = await createPaymentSession({
        id: row.id,
        orderNumber: row.orderNumber,
        storeSlug: row.storeSlug,
        total: row.total,
        customerId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        customerEmail: row.customerEmail,
      });
    } catch (err) {
      await prisma.$transaction(async (tx) => {
        for (const line of lines) {
          await tx.storeProductVariant.updateMany({
            where: { id: line.stockVariantId },
            data: { stockQuantity: { increment: line.quantity } },
          });
        }
        for (const productId of new Set(lines.map((l) => l.productId))) {
          await recomputeProductAggregates(productId, tx);
        }
        await runHooks("order.unplacing", tx, row.id);
        await tx.order.delete({ where: { id: row.id } });
      });
      throw err;
    }
  }

  // The basket that became this order is spent — empty it for this store on
  // every device the customer is signed in on, not just the tab that checked
  // out. Deliberately after the gateway step: a placement rolled back above
  // never happened, and must not cost the shopper their cart. Best-effort —
  // a paid order is never failed because the cart could not be tidied.
  void clearStoreLines(customerId, store.id).catch(() => {});

  const shaped = shapeOrder(row);
  // Fire-and-forget: confirmation to the customer + alert to the seller.
  // Gateway orders wait for the money — the payments module sends these
  // same notifications when the payment settles.
  if (!viaGateway) notifyOrderPlaced(shaped, customerId, store.owner);
  emit("order.placed", { orderId: row.id });
  return { ...shaped, payment: payment ?? null };
}

/**
 * Seller dashboard for one store — order counters + the latest orders.
 * Counter semantics against the order lifecycle (progressed by the seller
 * via the order-management endpoints below):
 *   Pending    = PENDING (new orders)
 *   Processing = CONFIRMED + PACKED
 *   Shipped    = SHIPPED
 *   Completed  = DELIVERED
 *   Cancelled  = CANCELLED
 *   Refunded   = paymentStatus REFUNDED (today only via cancelling a
 *                dev-simulated PAID order; the real flow needs the gateway)
 * Revenue sums non-cancelled order totals.
 */
export async function getStoreDashboard(actor: StoreActor, storeRef: string) {
  const store = await getMyStore(actor, storeRef); // ownership check
  const storeId = store.id;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [byStatus, today, refunded, totals, recentOrders] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: { storeId, placedAt: { gte: startOfToday } },
    }),
    prisma.order.count({ where: { storeId, paymentStatus: "REFUNDED" } }),
    prisma.order.aggregate({
      where: { storeId, status: { not: "CANCELLED" } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { storeId },
      orderBy: { placedAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        fulfilment: true,
        customerName: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  const countOf = new Map(byStatus.map((row) => [row.status, row._count._all]));
  return {
    stats: {
      today,
      pending: countOf.get("PENDING") ?? 0,
      processing: (countOf.get("CONFIRMED") ?? 0) + (countOf.get("PACKED") ?? 0),
      shipped: countOf.get("SHIPPED") ?? 0,
      completed: countOf.get("DELIVERED") ?? 0,
      cancelled: countOf.get("CANCELLED") ?? 0,
      refunded,
      totalOrders: totals._count._all,
      revenue: totals._sum.total ?? new Prisma.Decimal(0),
    },
    recentOrders: recentOrders.map(({ _count, ...order }) => ({
      ...order,
      itemCount: _count.items,
    })),
  };
}

/** The signed-in customer's order history, newest first (account page). */
export async function listMyOrders(customerId: string) {
  const rows = await prisma.order.findMany({
    where: { customerId },
    orderBy: { placedAt: "desc" },
    take: 100,
    select: orderSelect,
  });
  return rows.map((row) => shapeOrder(row, "customer"));
}

// ---------------------------------------------------------------------------
// Seller order management (owner-scoped via getMyStore)
// ---------------------------------------------------------------------------

/**
 * The fulfilment lifecycle is a forward-only sequence — a seller can move an
 * order to any LATER stage (jumps are allowed: a pickup order goes
 * PACKED → DELIVERED without ever being SHIPPED) but never backwards.
 * CANCELLED sits outside the sequence and has its own endpoint because it
 * restores stock.
 */
export const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PACKED: 2,
  SHIPPED: 3,
  DELIVERED: 4,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_STAMP = {
  CONFIRMED: "confirmedAt",
  PACKED: "packedAt",
  SHIPPED: "shippedAt",
  DELIVERED: "deliveredAt",
} as const;

/** Lean list row — same shape as the dashboard's recentOrders. */
const orderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  fulfilment: true,
  customerName: true,
  paymentMethod: true,
  paymentStatus: true,
  total: true,
  placedAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

/** The store's orders, newest first — filterable by status + search. */
export async function listStoreOrders(
  actor: StoreActor,
  storeRef: string,
  query: SellerOrderListQuery,
) {
  const store = await getMyStore(actor, storeRef); // ownership check

  const where: Prisma.OrderWhereInput = { storeId: store.id };
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: "insensitive" } },
      { customerName: { contains: query.q, mode: "insensitive" } },
      { customerPhone: { contains: query.q } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: orderSummarySelect,
    }),
  ]);

  return {
    rows: rows.map(({ _count, ...order }) => ({
      ...order,
      itemCount: _count.items,
    })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** One order of the seller's store, full shape. 404 if not this store's. */
export async function getStoreOrder(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
) {
  const store = await getMyStore(actor, storeRef);
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: orderSelect,
  });
  if (!row) throw HttpError.notFound("Order not found");
  return shapeOrder(row, "seller");
}

/** What a status change reads, and guards its write on. */
export const statusGuardSelect = {
  id: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  customerId: true,
} satisfies Prisma.OrderSelect;

type StatusGuard = Prisma.OrderGetPayload<{ select: typeof statusGuardSelect }>;
export type ForwardStatus = OrderStatusUpdateInput["status"];

/**
 * Write a forward status change — the ONE place it is written, for the
 * seller's buttons and for parcels alike (never backwards; terminal states
 * stay terminal). Marking a COD order DELIVERED settles its payment — cash
 * changed hands at the door — so `paymentStatus` flips to PAID. The write
 * re-checks the status read before, so two simultaneous changes (two tabs,
 * a double tap) can't both win. Runs in the caller's transaction; announce
 * it with `announceStatusChange` once that commits.
 */
export async function writeStatusChange(
  db: Prisma.TransactionClient,
  current: StatusGuard,
  to: ForwardStatus,
): Promise<{ paid: boolean }> {
  if (current.status === "CANCELLED") {
    throw HttpError.conflict("A cancelled order cannot be updated");
  }
  if (STATUS_RANK[to]! <= STATUS_RANK[current.status]!) {
    throw HttpError.conflict(
      `This order is already ${STATUS_LABELS[current.status]} — it can only move forward`,
    );
  }

  const data: Prisma.OrderUpdateManyMutationInput = {
    status: to,
    [STATUS_STAMP[to]]: new Date(),
  };
  const paid =
    to === "DELIVERED" &&
    current.paymentMethod === "COD" &&
    current.paymentStatus === "PENDING";
  if (paid) data.paymentStatus = "PAID";

  const updated = await db.order.updateMany({
    where: { id: current.id, status: current.status },
    data,
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The order just changed — reload and try again");
  }
  return { paid };
}

/**
 * Announce a committed status change: the customer's message (unless the
 * caller sends its own — a parcel's shipped mail carries the tracking) and
 * the `order.status` / `order.paid` events other packages run on (affiliate
 * commissions approve on DELIVERED). Answers with the order as the seller
 * sees it.
 */
export async function announceStatusChange(
  orderId: string,
  to: ForwardStatus,
  change: { paid: boolean },
  customerId: string | null,
  options: { notifyCustomer?: boolean } = {},
) {
  const shaped = await loadOrder(orderId, "seller");
  if (options.notifyCustomer !== false) {
    // Fire-and-forget customer update (Confirmed/Shipped/Delivered have copy).
    notifyOrderStatusChange(shaped, customerId);
  }
  emit("order.status", { orderId, status: to });
  if (change.paid) emit("order.paid", { orderId });
  return shaped;
}

/** Progress an order along the lifecycle from the seller's buttons. */
export async function updateOrderStatus(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  input: OrderStatusUpdateInput,
) {
  const store = await getMyStore(actor, storeRef);
  const current = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: statusGuardSelect,
  });
  if (!current) throw HttpError.notFound("Order not found");
  // Lines another party ships move the order through THEIR parcels — the
  // seller's buttons can't declare them sent or delivered.
  if (input.status === "SHIPPED" || input.status === "DELIVERED") {
    const tagged = await prisma.orderItem.count({
      where: { orderId, fulfilledBy: { not: null } },
    });
    if (tagged > 0) {
      throw HttpError.conflict(
        "Some items ship separately — this order moves on as their parcels do.",
      );
    }
  }

  const change = await prisma.$transaction(async (tx) => {
    const result = await writeStatusChange(tx, current, input.status);
    // Delivered from the button closes any parcel still on its way, so the
    // order and its parcels never disagree.
    if (input.status === "DELIVERED") {
      await tx.orderShipment.updateMany({
        where: { orderId, deliveredAt: null, returnedAt: null },
        data: { deliveredAt: new Date() },
      });
    }
    return result;
  });

  return announceStatusChange(orderId, input.status, change, current.customerId);
}

/**
 * Cancel an order: PENDING / CONFIRMED / PACKED, or a SHIPPED one whose every
 * parcel came back (undelivered, returned to sender) — a delivered order, or
 * one with a parcel still on its way, can't be cancelled. Puts stock back in
 * the same transaction: items that never shipped always; items that came back
 * only when the seller says so (`restockReturned` — they may be damaged, so
 * it is asked, never assumed).
 *
 * Payment: an UNPAID online order also has its Cashfree order terminated, so
 * a customer sitting on the hosted checkout can't pay for stock that just
 * went back on sale (a payment that still slips through is recorded and
 * flagged for refund — see `markOrderPaid`). A PAID order flips to
 * REFUNDED, which today is a STATUS ONLY: no refund call is made, so the
 * money must be returned from the Cashfree dashboard until the automatic
 * refund lands (see docs/CASHFREE_PAYMENTS.md).
 */
export async function cancelOrder(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  reason: string | null,
  restockReturned?: boolean,
) {
  const store = await getMyStore(actor, storeRef);
  return cancelOrderCore(orderId, store.id, reason, restockReturned);
}

/**
 * The cancel itself — scoped to the seller's store, or unscoped for the
 * system (`cancelOrderAsSystem`). One set of rules for both.
 */
async function cancelOrderCore(
  orderId: string,
  storeId: string | null,
  reason: string | null,
  restockReturned?: boolean,
) {
  const scope = storeId ? { storeId } : {};
  const current = await prisma.order.findFirst({
    where: { id: orderId, ...scope },
    select: {
      status: true,
      paymentStatus: true,
      customerId: true,
      items: {
        select: { productId: true, variantId: true, quantity: true, shipmentId: true },
      },
      shipments: { select: { id: true, returnedAt: true } },
    },
  });
  if (!current) throw HttpError.notFound("Order not found");

  if (current.status === "CANCELLED") {
    throw HttpError.conflict("This order is already cancelled");
  }
  if (current.status === "DELIVERED") {
    throw HttpError.conflict("A delivered order can no longer be cancelled");
  }
  const cameBack = new Set(
    current.shipments.filter((s) => s.returnedAt).map((s) => s.id),
  );
  if (current.status === "SHIPPED") {
    const allBack =
      current.shipments.length > 0 && cameBack.size === current.shipments.length;
    if (!allBack) {
      throw HttpError.conflict(
        "A sent order can't be cancelled while its parcel is on the way. If it comes back, mark it as came back first.",
      );
    }
  }
  const returnedItems = current.items.filter(
    (item) => item.shipmentId !== null && cameBack.has(item.shipmentId),
  );
  if (returnedItems.length > 0 && restockReturned === undefined) {
    throw HttpError.badRequest(
      "Choose whether the items that came back go back in stock",
    );
  }
  const toRestock = [
    ...current.items.filter((item) => item.shipmentId === null),
    ...(restockReturned ? returnedItems : []),
  ];

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      // paymentStatus too: a payment webhook landing between the read above
      // and this write would otherwise leave the order CANCELLED + PAID —
      // never flagged REFUNDED, and the buyer told "order placed" instead of
      // "refund on the way". Now it's a conflict; the retry sees PAID.
      where: {
        id: orderId,
        ...scope,
        status: current.status,
        paymentStatus: current.paymentStatus,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        ...(current.paymentStatus === "PAID"
          ? { paymentStatus: "REFUNDED" as const }
          : {}),
      },
    });
    if (updated.count === 0) {
      throw HttpError.conflict("The order just changed — reload and try again");
    }
    // The guarded write holds the order's row lock, and sending a parcel
    // takes the same lock — so a parcel sent again from another tab is
    // either seen here or refused there, never missed.
    if (current.status === "SHIPPED") {
      const out = await tx.orderShipment.count({
        where: { orderId, returnedAt: null },
      });
      if (out > 0) {
        throw HttpError.conflict("The order just changed — reload and try again");
      }
    }

    // A package closes its part (e.g. releases a supplier's stock) in the
    // same transaction — or refuses the cancel.
    await runHooks("order.cancelling", tx, orderId);
    await restockItems(toRestock, tx);
    if (restockReturned && cameBack.size > 0) {
      await tx.orderShipment.updateMany({
        where: { id: { in: [...cameBack] } },
        data: { restocked: true },
      });
    }
  });

  // Close the payment window before answering: the stock is back on sale, so
  // the customer's still-open checkout must stop being payable. Never throws
  // and is time-bounded, so a gateway problem can't fail or hang the cancel.
  await voidPaymentSession(orderId);

  const row = await prisma.order.findFirst({
    where: { id: orderId },
    select: orderSelect,
  });
  const shaped = shapeOrder(row!, "seller");
  // Fire-and-forget cancellation email to the customer.
  notifyOrderStatusChange(shaped, current.customerId);
  emit("order.cancelled", { orderId });
  return shaped;
}

/**
 * The SYSTEM cancels an order on its own — a package acting for it (e.g. a
 * supplier couldn't ship). Exactly the seller's cancel rules, without a
 * store scope; answers with the order as the seller sees it.
 */
export async function cancelOrderAsSystem(
  orderId: string,
  reason: string | null,
  restockReturned?: boolean,
) {
  return cancelOrderCore(orderId, null, reason, restockReturned);
}

/**
 * The SYSTEM confirms a still-PENDING order (e.g. every supplier confirmed
 * its part). An order already past PENDING is left as it is.
 */
export async function confirmOrderAsSystem(orderId: string) {
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: statusGuardSelect,
  });
  if (!current) throw HttpError.notFound("Order not found");
  if (current.status !== "PENDING") return loadOrder(orderId, "seller");
  const change = await prisma.$transaction((tx) =>
    writeStatusChange(tx, current, "CONFIRMED"),
  );
  return announceStatusChange(orderId, "CONFIRMED", change, current.customerId);
}

/**
 * Put a cancelled order's stock back. Items snapshot their references with
 * SetNull, so a line whose product/variant was deleted since simply has
 * nothing to restore into. Simple products reference no variant on the line —
 * the stock lives on the product's implicit Default variant (if the product
 * gained options since, that variant is gone and the line is skipped).
 */
async function restockItems(
  items: { productId: string | null; variantId: string | null; quantity: number }[],
  tx: Prisma.TransactionClient,
): Promise<void> {
  const restoredProducts = new Set<string>();
  for (const item of items) {
    let variantId = item.variantId;
    if (!variantId && item.productId) {
      const dv = await tx.storeProductVariant.findFirst({
        where: { productId: item.productId, isDefault: true },
        select: { id: true },
      });
      variantId = dv?.id ?? null;
    }
    if (!variantId) continue;
    const restored = await tx.storeProductVariant.updateMany({
      where: { id: variantId },
      data: { stockQuantity: { increment: item.quantity } },
    });
    if (restored.count > 0 && item.productId) {
      restoredProducts.add(item.productId);
    }
  }
  for (const productId of restoredProducts) {
    await recomputeProductAggregates(productId, tx);
  }
}

/**
 * The BUYER cancels their own order — only while the seller has not
 * confirmed it yet and nothing has been paid. Anything later (packed,
 * shipped) or paid (which would need a real refund) goes through the seller,
 * so this path can never promise money back. Same guarded write, restock,
 * payment-window close and `order.cancelled` event as the seller's cancel.
 */
export async function cancelMyOrder(
  customerId: string,
  storeSlug: string,
  orderId: string,
  reason: string | null,
) {
  const current = await prisma.order.findFirst({
    where: { id: orderId, storeSlug, customerId },
    select: {
      status: true,
      paymentStatus: true,
      storeId: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
      store: { select: { owner: { select: { id: true } } } },
    },
  });
  if (!current) throw HttpError.notFound("Order not found");
  if (current.status === "CANCELLED") {
    throw HttpError.conflict("This order is already cancelled");
  }
  if (current.status !== "PENDING") {
    throw HttpError.conflict(
      "The seller has already confirmed this order — contact the store to cancel it.",
    );
  }
  if (current.paymentStatus === "PAID" || current.paymentStatus === "REFUNDED") {
    throw HttpError.conflict(
      "This order is already paid — contact the store to cancel it and arrange the refund.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        customerId,
        status: "PENDING",
        paymentStatus: current.paymentStatus,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledByCustomer: true,
      },
    });
    if (updated.count === 0) {
      throw HttpError.conflict("The order just changed — reload and try again");
    }
    await runHooks("order.cancelling", tx, orderId);
    await restockItems(current.items, tx);
  });

  await voidPaymentSession(orderId);

  const row = await prisma.order.findFirst({
    where: { id: orderId },
    select: orderSelect,
  });
  const shaped = shapeOrder(row!);
  notifyOrderStatusChange(shaped, customerId);
  notifyCustomerCancelled(shaped, current.store?.owner.id ?? null);
  emit("order.cancelled", { orderId });
  return { ...shaped, redacted: false };
}

const RECONCILE_WINDOW_MS = 5_000;
const lastReconciled = new Map<string, number>();

/** Throttle for the public lookup's gateway check (per order, in-process). */
function shouldReconcile(orderId: string): boolean {
  const now = Date.now();
  const last = lastReconciled.get(orderId);
  if (last !== undefined && now - last < RECONCILE_WINDOW_MS) return false;
  lastReconciled.set(orderId, now);
  // Keep the map from growing without bound on a long-lived process.
  if (lastReconciled.size > 5_000) {
    for (const [id, at] of lastReconciled) {
      if (now - at >= RECONCILE_WINDOW_MS) lastReconciled.delete(id);
    }
  }
  return true;
}

/**
 * Order confirmation lookup — keyed by the order's cuid scoped to its store
 * slug (the success page's data source). Auth is optional so the link still
 * opens in a fresh browser, but only the **customer who placed the order**
 * gets the contact + delivery snapshot: everyone else (anonymous, another
 * account) gets the order with those fields nulled and `redacted: true`.
 * A cuid is not a secret — it is time-ordered and leaks through shared
 * links, history and logs — so it must not unlock a buyer's phone, email
 * and home address on its own.
 *
 * Doubles as the webhook fallback: an ONLINE order still awaiting payment is
 * reconciled against Cashfree before answering, so the success page the
 * gateway redirects to shows PAID even when the webhook hasn't arrived
 * (or can't — e.g. local dev).
 */
export async function getPublicOrder(
  storeSlug: string,
  orderId: string,
  viewerCustomerId?: string,
) {
  // Best-effort, no-op unless needed — and at most once per order per window:
  // this endpoint is public, and without a cap every reload (or a scripted
  // loop) was a Cashfree API call. The success page polls well inside it.
  if (shouldReconcile(orderId)) await reconcilePendingPayment(orderId);
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeSlug },
    select: { ...orderSelect, customerId: true },
  });
  if (!row) throw HttpError.notFound("Order not found");
  const { customerId, ...order } = row;
  const isOwner = !!viewerCustomerId && viewerCustomerId === customerId;
  // Anyone else holding the link sees parcels without tracking numbers: a
  // courier's site can show the delivery address for one.
  const shaped = shapeOrder(order, isOwner ? "customer" : "public");
  if (isOwner) return { ...shaped, redacted: false };
  return {
    ...shaped,
    // First name only — enough for "Thanks, Asha" on the success page.
    customerName: shaped.customerName?.trim().split(/\s+/)[0] ?? null,
    customerPhone: null,
    customerEmail: null,
    addressLine: null,
    pincode: null,
    billingAddress: null,
    // The success page only needs to know a payment was simulated; a real
    // gateway reference is the buyer's business.
    paymentRef: shaped.paymentRef === "DEV-SIMULATED" ? shaped.paymentRef : null,
    redacted: true,
  };
}
