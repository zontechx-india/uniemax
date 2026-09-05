import { randomInt } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { isProduction } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
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
  notifyOrderPlaced,
  notifyOrderStatusChange,
} from "./orders.notifications.js";
import {
  cashfreeConfigured,
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
  items: {
    select: {
      id: true,
      productName: true,
      variantName: true,
      productSlug: true,
      imageKey: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function shapeOrder(row: OrderRow) {
  const { items, ...rest } = row;
  return {
    ...rest,
    items: items.map(({ imageKey, ...item }) => ({
      ...item,
      imageUrl: mediaUrl("media", imageKey),
    })),
  };
}

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
    if (key === "phone" && !/^\+?[\d\s\-()]{5,20}$/.test(value)) {
      throw HttpError.badRequest("The phone number looks invalid");
    }
    if (key === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
      throw HttpError.badRequest("The email address looks invalid");
    }
    if (key === "pincode" && !/^[A-Za-z0-9 -]{3,10}$/.test(value)) {
      throw HttpError.badRequest("The pincode looks invalid");
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
  productSlug: string;
  imageKey: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  stockVariantId: string;
  codAvailable: boolean;
  shippingOverride: ReturnType<typeof resolveProductShippingOverride>;
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
    productSlug: product.slug,
    imageKey: product.media[0]?.key ?? null,
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
  return {
    fulfilment: input.fulfilment,
    ...money,
    paymentMethods: paymentMethodsFor(resolvePayments(store.payments), lines),
    lines: lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  };
}

export async function createOrder(
  storeSlug: string,
  input: OrderCreateInput,
  customerId: string,
) {
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
  if (input.paymentMethod === "ONLINE" && isProduction && !cashfreeConfigured) {
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
  const viaGateway = input.paymentMethod === "ONLINE" && cashfreeConfigured;
  const simulated =
    input.paymentMethod === "ONLINE" && !isProduction && !cashfreeConfigured;

  const row = await prisma.$transaction(async (tx) => {
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

    return tx.order.create({
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
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            variantName: line.variantName,
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
  });

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
        await tx.order.delete({ where: { id: row.id } });
      });
      throw err;
    }
  }

  const shaped = shapeOrder(row);
  // Fire-and-forget: confirmation to the customer + alert to the seller.
  // Gateway orders wait for the money — the payments module sends these
  // same notifications when the payment settles.
  if (!viaGateway) notifyOrderPlaced(shaped, customerId, store.owner);
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
export async function getStoreDashboard(ownerId: string, storeRef: string) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
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
  return rows.map(shapeOrder);
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
const STATUS_RANK: Record<string, number> = {
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
  ownerId: string,
  storeRef: string,
  query: SellerOrderListQuery,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check

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
  ownerId: string,
  storeRef: string,
  orderId: string,
) {
  const store = await getMyStore(ownerId, storeRef);
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: orderSelect,
  });
  if (!row) throw HttpError.notFound("Order not found");
  return shapeOrder(row);
}

/**
 * Progress an order along the lifecycle (never backwards; terminal states
 * stay terminal). Marking a COD order DELIVERED settles its payment — cash
 * changed hands at the door — so `paymentStatus` flips to PAID.
 */
export async function updateOrderStatus(
  ownerId: string,
  storeRef: string,
  orderId: string,
  input: OrderStatusUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef);
  const current = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: {
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      customerId: true,
    },
  });
  if (!current) throw HttpError.notFound("Order not found");

  if (current.status === "CANCELLED") {
    throw HttpError.conflict("A cancelled order cannot be updated");
  }
  if (STATUS_RANK[input.status]! <= STATUS_RANK[current.status]!) {
    throw HttpError.conflict(
      `This order is already ${STATUS_LABELS[current.status]} — it can only move forward`,
    );
  }

  const data: Prisma.OrderUpdateManyMutationInput = {
    status: input.status,
    [STATUS_STAMP[input.status]]: new Date(),
  };
  if (
    input.status === "DELIVERED" &&
    current.paymentMethod === "COD" &&
    current.paymentStatus === "PENDING"
  ) {
    data.paymentStatus = "PAID";
  }

  // Guarded update — the WHERE re-checks the status read above, so two
  // simultaneous updates (two tabs, double-click) can't both win.
  const updated = await prisma.order.updateMany({
    where: { id: orderId, storeId: store.id, status: current.status },
    data,
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The order just changed — reload and try again");
  }

  const row = await prisma.order.findFirst({
    where: { id: orderId },
    select: orderSelect,
  });
  const shaped = shapeOrder(row!);
  // Fire-and-forget customer update (Confirmed/Shipped/Delivered have copy).
  notifyOrderStatusChange(shaped, current.customerId);
  return shaped;
}

/**
 * Cancel an order (PENDING / CONFIRMED / PACKED only — once it ships, plain
 * cancellation is off the table; returns/RTO are a future flow). Restores
 * the stock the order had reserved and recomputes product aggregates in the
 * same transaction.
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
  ownerId: string,
  storeRef: string,
  orderId: string,
  reason: string | null,
) {
  const store = await getMyStore(ownerId, storeRef);
  const current = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: {
      status: true,
      paymentStatus: true,
      customerId: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });
  if (!current) throw HttpError.notFound("Order not found");

  if (current.status === "CANCELLED") {
    throw HttpError.conflict("This order is already cancelled");
  }
  if (current.status === "SHIPPED" || current.status === "DELIVERED") {
    throw HttpError.conflict(
      `A ${STATUS_LABELS[current.status]!.toLowerCase()} order can no longer be cancelled`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, storeId: store.id, status: current.status },
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

    // Put the stock back. Items snapshot their references with SetNull, so a
    // line whose product/variant was deleted since simply has nothing to
    // restore into. Simple products reference no variant on the line — the
    // stock lives on the product's implicit Default variant (if the product
    // gained options since, that variant is gone and the line is skipped).
    const restoredProducts = new Set<string>();
    for (const item of current.items) {
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
  });

  // Close the payment window before answering: the stock is back on sale, so
  // the customer's still-open checkout must stop being payable. Never throws
  // and is time-bounded, so a gateway problem can't fail or hang the cancel.
  await voidPaymentSession(orderId);

  const row = await prisma.order.findFirst({
    where: { id: orderId },
    select: orderSelect,
  });
  const shaped = shapeOrder(row!);
  // Fire-and-forget cancellation email to the customer.
  notifyOrderStatusChange(shaped, current.customerId);
  return shaped;
}

/**
 * Order confirmation lookup — no auth, keyed by the order's unguessable cuid
 * scoped to its store slug (the success page's data source; guests have no
 * account to look orders up under).
 *
 * Doubles as the webhook fallback: an ONLINE order still awaiting payment is
 * reconciled against Cashfree before answering, so the success page the
 * gateway redirects to shows PAID even when the webhook hasn't arrived
 * (or can't — e.g. local dev).
 */
export async function getPublicOrder(storeSlug: string, orderId: string) {
  await reconcilePendingPayment(orderId); // best-effort, no-op unless needed
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeSlug },
    select: orderSelect,
  });
  if (!row) throw HttpError.notFound("Order not found");
  return shapeOrder(row);
}
