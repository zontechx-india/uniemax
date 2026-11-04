import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { mailConfigured } from "../../package/mail/index.js";
import { HttpError } from "../../utils/httpError.js";
import { orderMailRecipient, sendOrderMail } from "../orders/orders.notifications.js";
import type { OrderMailContext, OrderMailMessage } from "../orders/orders.notifications.js";
import { shapeShipment, shipmentSelect } from "../orders/shipments.shape.js";
import { assertEnabled } from "../whatsapp/whatsapp.service.js";
import { previewOrderWhatsApp, sendOrderWhatsApp } from "../whatsapp/whatsapp.orderMessages.js";
import type { OrderWaMessage } from "../whatsapp/whatsapp.orderMessages.js";
import type { OrderMessageSendInput } from "./admin.schema.js";

/**
 * Sending an order's messages again by hand — the console's one write on an
 * order. It does not change the order: it re-sends the email or WhatsApp
 * message the automatic flow sends (same text, same recipient), for when the
 * first one never arrived or the customer asks for it again.
 *
 * Only for stages the order has REACHED, so "Delivered" can never go out for
 * an order that is still being packed. The recipient is always the order's
 * own contact — never typed by the admin.
 */

type Stage = "placedAt" | "confirmedAt" | "shippedAt" | "deliveredAt" | "cancelledAt";

interface MessageSpec {
  key: OrderMailMessage;
  label: string;
  audience: "seller" | "customer";
  stage: Stage;
  /** Null = no WhatsApp template for it. */
  whatsapp: OrderWaMessage | null;
}

/** In the order the order lives them. Every one has an email. */
const MESSAGES: MessageSpec[] = [
  { key: "SELLER_NEW_ORDER", label: "New order", audience: "seller", stage: "placedAt", whatsapp: "SELLER_NEW_ORDER" },
  { key: "CUSTOMER_PLACED", label: "Order placed", audience: "customer", stage: "placedAt", whatsapp: null },
  { key: "CONFIRMED", label: "Order confirmed", audience: "customer", stage: "confirmedAt", whatsapp: "CONFIRMED" },
  { key: "SHIPPED", label: "Order shipped", audience: "customer", stage: "shippedAt", whatsapp: "SHIPPED" },
  { key: "DELIVERED", label: "Order delivered", audience: "customer", stage: "deliveredAt", whatsapp: "DELIVERED" },
  { key: "CANCELLED", label: "Order cancelled", audience: "customer", stage: "cancelledAt", whatsapp: null },
];

async function loadOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      storeName: true,
      storeSlug: true,
      fulfilment: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      total: true,
      paymentMethod: true,
      cancelReason: true,
      placedAt: true,
      confirmedAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      items: { select: { productName: true, quantity: true } },
      store: { select: { owner: { select: { email: true } } } },
      shipments: { orderBy: { shippedAt: "desc" }, take: 1, select: shipmentSelect },
    },
  });
  if (!order) throw HttpError.notFound("Order not found");
  const latest = order.shipments[0];
  const context: OrderMailContext = {
    customerId: order.customerId,
    sellerEmail: order.store?.owner.email ?? null,
    parcel: latest ? shapeShipment(latest, "seller") : null,
  };
  return { order, context };
}

/** Every message for the order, whether it can be sent, and to whom. */
export async function listOrderMessages(orderId: string) {
  const { order, context } = await loadOrder(orderId);
  const messages = await Promise.all(
    MESSAGES.filter((spec) => !(spec.key === "SHIPPED" && order.fulfilment === "PICKUP")).map(
      async (spec) => {
        const reached = order[spec.stage] !== null;
        const whatsapp = spec.whatsapp ? await previewOrderWhatsApp(orderId, spec.whatsapp) : null;
        return {
          key: spec.key,
          label: spec.label,
          audience: spec.audience,
          reached,
          email: { to: await orderMailRecipient(spec.key, order, context) },
          whatsapp,
        };
      },
    ),
  );
  return {
    /** WhatsApp sends answer 503 while this is false. */
    whatsappEnabled: env.WA_ENABLED,
    /** False = emails are printed to the server console, not delivered. */
    emailDelivered: mailConfigured,
    messages,
  };
}

/** Sends one message on one channel, now, and says where it went. */
export async function sendOrderMessage(
  orderId: string,
  input: OrderMessageSendInput,
  logger: FastifyBaseLogger,
) {
  const spec = MESSAGES.find((m) => m.key === input.message);
  if (!spec) throw HttpError.badRequest("Unknown message");
  const { order, context } = await loadOrder(orderId);
  if (order[spec.stage] === null) {
    throw HttpError.conflict(`This order has not reached the "${spec.label}" stage yet`);
  }

  if (input.channel === "whatsapp") {
    if (!spec.whatsapp) throw HttpError.badRequest(`"${spec.label}" has no WhatsApp template`);
    assertEnabled();
    const sent = await sendOrderWhatsApp(orderId, spec.whatsapp, logger);
    return { orderNumber: order.orderNumber, ...input, to: sent.to, templateName: sent.templateName, wamid: sent.wamid };
  }

  const to = await sendOrderMail(spec.key, order, context);
  return { orderNumber: order.orderNumber, ...input, to, delivered: mailConfigured };
}
