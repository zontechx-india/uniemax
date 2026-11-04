import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { publicWebUrl } from "../../package/mail/index.js";
import { HttpError } from "../../utils/httpError.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { availableTemplates, sendTemplate } from "./whatsapp.service.js";
import { fillTemplateBody } from "./whatsapp.templates.js";
import { toWaId } from "./whatsapp.webhook.js";

/**
 * Order messages on WhatsApp — sent ALONGSIDE the order email and push (see
 * `orders/orders.notifications.ts`), never instead of them.
 *
 *   - Seller, on a new order: `order_received_to_seller`, to the store's
 *     business phone, else the owner's login phone.
 *   - Customer, on Confirmed / Shipped / Delivered: `order_confirmed_without_link`,
 *     `order_shipped_without_link`, `order_delivered`, to the checkout phone,
 *     else the account's phone. Cancelled has no template — email + push only.
 *
 * FIRE-AND-FORGET like the rest of the order messages: nothing here throws or
 * slows the order. The usual send rules apply (opt-out, dev allowlist, the
 * template must be approved in WhatsApp Manager); a refused send is logged and
 * skipped. Every attempt is stored as a WaMessage by `sendTemplate`.
 *
 * Template names, languages and the order of {{1}}… are fixed in WhatsApp
 * Manager — renaming or re-ordering one there breaks it here.
 */

const LANGUAGE = "en";

const TEMPLATES = {
  sellerNewOrder: "order_received_to_seller",
  CONFIRMED: "order_confirmed_without_link",
  SHIPPED: "order_shipped_without_link",
  DELIVERED: "order_delivered",
} as const;

/** Meta caps a body value; a long product list is cut, not refused. */
const MAX_VALUE = 500;

let log: FastifyBaseLogger | null = null;

/**
 * Called once at boot (server.ts) with the app logger. Until then — and always
 * while WA_ENABLED=false — nothing is sent, so tests that build the app never
 * message anyone.
 */
export function startOrderMessages(appLog: FastifyBaseLogger): void {
  if (env.WA_ENABLED) log = appLog;
}

/**
 * Meta refuses an empty value and one with newlines, tabs or 4+ spaces in a
 * row — so whitespace collapses and a missing value becomes "NA".
 */
function clean(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "NA";
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
}

/** Number only — the ₹ is in the template text. */
const amount = (value: { toString(): string }) =>
  Number(value.toString()).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const link = (path: string) => (publicWebUrl ? `${publicWebUrl}${path}` : null);

const orderSelect = {
  id: true,
  orderNumber: true,
  storeSlug: true,
  storeName: true,
  fulfilment: true,
  customerName: true,
  customerPhone: true,
  addressLine: true,
  pincode: true,
  state: true,
  country: true,
  total: true,
  paymentMethod: true,
  customer: { select: { phone: true, name: true } },
  items: { select: { productName: true, variantName: true, quantity: true, productSlug: true } },
  store: {
    select: { name: true, profile: true, owner: { select: { name: true, phone: true } } },
  },
  shipments: {
    orderBy: { shippedAt: "desc" as const },
    take: 1,
    select: { carrier: true, trackingNumber: true, trackingUrl: true },
  },
};

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
}

type OrderRow = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/** First usable number of the list, as Meta's wa_id. */
function firstWaId(...phones: (string | null | undefined)[]): string | null {
  for (const phone of phones) {
    const waId = phone ? toWaId(phone) : null;
    if (waId) return waId;
  }
  return null;
}

/** One order message, ready to send: who, which template, the {{1}}… values. */
interface PreparedMessage {
  to: string | null;
  templateName: string;
  bodyParams: string[];
}

/** Sends a prepared message and returns Meta's message id. Throws on refusal. */
async function deliverPrepared(
  message: PreparedMessage & { to: string },
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const result = await sendTemplate(
    {
      to: message.to,
      templateName: message.templateName,
      languageCode: LANGUAGE,
      bodyParams: message.bodyParams,
      buttonParams: [],
      header: null,
    },
    logger,
  );
  return result.messages?.[0]?.id ?? null;
}

/** The automatic send: never throws — a refused send is logged and skipped. */
async function send(
  orderId: string,
  message: PreparedMessage,
  logger: FastifyBaseLogger,
): Promise<void> {
  const wa = { orderId, template: message.templateName };
  const to = message.to;
  if (!to) {
    logger.info({ wa }, "whatsapp: order message skipped — no usable phone");
    return;
  }
  try {
    const wamid = await deliverPrepared({ ...message, to }, logger);
    logger.info({ wa: { ...wa, wamid } }, "whatsapp: order message sent");
  } catch (error) {
    // 403 = not on the dev allowlist, 409 = opted out: expected, not a fault.
    const expected =
      error instanceof HttpError && (error.statusCode === 403 || error.statusCode === 409);
    const reason = error instanceof Error ? error.message : "Send failed";
    if (expected) logger.info({ wa: { ...wa, reason } }, "whatsapp: order message skipped");
    else logger.warn({ wa: { ...wa, reason } }, "whatsapp: order message failed");
  }
}

function sellerParams(order: OrderRow): string[] {
  const profile = resolveProfile(order.store?.profile);
  const address =
    order.fulfilment === "PICKUP"
      ? "Store pickup"
      : [order.addressLine, order.state, order.country].filter(Boolean).join(", ");
  const products = order.items
    .map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ""} x ${i.quantity}`)
    .join(", ");
  const firstSlug = order.items.find((i) => i.productSlug)?.productSlug;
  return [
    clean(profile.sellerName ?? order.store?.owner.name ?? "there"),
    clean(order.orderNumber),
    clean(order.store?.name ?? order.storeName),
    clean(order.customerName ?? order.customer?.name),
    clean(address),
    clean(order.pincode),
    clean(products),
    clean(amount(order.total)),
    clean(order.paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid"),
    clean(
      link(firstSlug ? `/store/${order.storeSlug}/product/${firstSlug}` : `/store/${order.storeSlug}`),
    ),
    clean(link(`/mystores/${order.storeSlug}/orders/${order.id}`)),
  ];
}

/** The seller's "new order" message: business phone, else the owner's login phone. */
function prepareSellerNewOrder(order: OrderRow): PreparedMessage | null {
  if (!order.store) return null;
  const profile = resolveProfile(order.store.profile);
  return {
    to: firstWaId(profile.phone, order.store.owner.phone),
    templateName: TEMPLATES.sellerNewOrder,
    bodyParams: sellerParams(order),
  };
}

/** The seller's "new order" message. */
export function whatsAppNewOrder(orderId: string): void {
  const logger = log;
  if (!logger) return;
  void (async () => {
    const order = await loadOrder(orderId);
    const message = order ? prepareSellerNewOrder(order) : null;
    if (message) await send(orderId, message, logger);
  })().catch((err: unknown) => logger.error({ err, orderId }, "whatsapp: seller order message"));
}

/** The parcel the shipped message names — the shaped parcel satisfies it. */
export interface ShippedParcel {
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  courierSite: string | null;
}

/**
 * The customer's update for Confirmed / Shipped / Delivered (other statuses
 * have no template). Shipped names `parcel` when the caller has it; otherwise
 * the order's latest parcel, and "NA" where there is none.
 */
export function whatsAppOrderStatus(
  orderId: string,
  status: string,
  parcel?: ShippedParcel | null,
): void {
  const logger = log;
  if (!logger) return;
  if (status !== "CONFIRMED" && status !== "SHIPPED" && status !== "DELIVERED") return;
  void (async () => {
    const order = await loadOrder(orderId);
    if (order) await send(orderId, prepareCustomerStatus(order, status, parcel), logger);
  })().catch((err: unknown) =>
    logger.error({ err, orderId, status }, "whatsapp: customer order message"),
  );
}

type CustomerStatus = "CONFIRMED" | "SHIPPED" | "DELIVERED";

/** The customer's message for a status: checkout phone, else the account's phone. */
function prepareCustomerStatus(
  order: OrderRow,
  status: CustomerStatus,
  parcel?: ShippedParcel | null,
): PreparedMessage {
  const name = clean(order.customerName ?? order.customer?.name ?? "there");
  const store = clean(order.storeName);
  const number = clean(order.orderNumber);

  let params: string[];
  if (status === "CONFIRMED") {
    params = [name, number, clean(amount(order.total)), store];
  } else if (status === "SHIPPED") {
    const shipment = parcel ?? order.shipments[0] ?? null;
    const trackUrl =
      shipment?.trackingUrl ??
      (parcel?.trackingNumber ? parcel.courierSite : null) ??
      link(`/order/${order.storeSlug}/${order.id}`);
    params = [
      name,
      number,
      clean(shipment?.carrier),
      clean(shipment?.trackingNumber),
      clean(trackUrl),
      store,
    ];
  } else {
    params = [name, number, store];
  }
  return {
    to: firstWaId(order.customerPhone, order.customer?.phone),
    templateName: TEMPLATES[status],
    bodyParams: params,
  };
}

// ---- Manual sends (admin console) -------------------------------------------

/** The order messages an admin can send again by hand. */
export type OrderWaMessage = "SELLER_NEW_ORDER" | CustomerStatus;

async function prepareManual(orderId: string, message: OrderWaMessage) {
  const order = await loadOrder(orderId);
  if (!order) throw HttpError.notFound("Order not found");
  return message === "SELLER_NEW_ORDER"
    ? prepareSellerNewOrder(order)
    : prepareCustomerStatus(order, message);
}

/** Who a manual send would go to, and with which template — for the confirm step. */
export async function previewOrderWhatsApp(orderId: string, message: OrderWaMessage) {
  const prepared = await prepareManual(orderId, message);
  return { to: prepared?.to ?? null, templateName: prepared?.templateName ?? null };
}

/**
 * Exactly what a manual send would deliver — recipient, template and the
 * {{1}}… values — with the approved text filled in when Meta's template list
 * is reachable (`body` null otherwise: the console fills its own copy).
 */
export async function previewOrderWhatsAppMessage(
  orderId: string,
  message: OrderWaMessage,
  logger: FastifyBaseLogger,
) {
  const prepared = await prepareManual(orderId, message);
  if (!prepared) throw new HttpError(422, "This order has no store to message");
  const templates = env.WA_ENABLED ? await availableTemplates(logger) : null;
  const template = templates?.find(
    (t) => t.name === prepared.templateName && t.language === LANGUAGE,
  );
  return {
    to: prepared.to,
    templateName: prepared.templateName,
    language: LANGUAGE,
    bodyParams: prepared.bodyParams,
    header: template?.header ?? null,
    body: template ? fillTemplateBody(template.body, prepared.bodyParams) : null,
    footer: template?.footer ?? null,
    buttons: template?.buttons ?? [],
  };
}

/**
 * The same message the automatic send would build, sent NOW and awaited —
 * unlike the automatic path, a refusal (opted out, not allowlisted, template
 * problem, Meta error) is thrown so the admin sees why. Stored as a WaMessage
 * by `sendTemplate` like every other send.
 */
export async function sendOrderWhatsApp(
  orderId: string,
  message: OrderWaMessage,
  logger: FastifyBaseLogger,
) {
  const prepared = await prepareManual(orderId, message);
  const to = prepared?.to;
  if (!prepared || !to) {
    throw new HttpError(422, "This order has no usable phone number for that message");
  }
  const wamid = await deliverPrepared({ ...prepared, to }, logger);
  return { to, templateName: prepared.templateName, wamid };
}
