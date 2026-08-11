import { prisma } from "../../config/prisma.js";
import { publicWebUrl, sendMail } from "../../package/mail/index.js";
import { notify, notifyAdmins } from "../notifications/notifications.service.js";

/**
 * Order notifications — **email + push, from one place**, so a new order
 * event can never reach one channel and miss the other.
 *
 * Covered: customer confirmation + seller "new order" alert on placement, and
 * customer updates on Confirmed / Shipped / Delivered / Cancelled. All
 * FIRE-AND-FORGET: a delivery failure must never fail (or slow) the order
 * flow itself, so every entry point catches and logs.
 *
 * Recipient resolution: the checkout's email field is optional per store, so
 * the customer address falls back to the account's login email; the seller
 * alert goes to the store owner's account email. Push instead targets the
 * PRINCIPAL (customer id / owner id), which needs no address at all — see
 * `modules/notifications`.
 */

/** The store owner, for both channels — email address and push principal. */
export interface OrderSeller {
  id: string;
  email: string | null;
}

/** The slice of the shaped order the templates need (structural — the
 *  service's shaped order satisfies it; Decimals stringify in templates). */
export interface OrderMailData {
  id: string;
  orderNumber: string;
  status: string;
  storeName: string;
  storeSlug: string;
  fulfilment: "DELIVERY" | "PICKUP";
  customerName: string | null;
  customerEmail: string | null;
  total: { toString(): string };
  paymentMethod: string;
  cancelReason?: string | null;
  items: { productName: string; quantity: number }[];
}

const formatTotal = (total: { toString(): string }) => `₹${total.toString()}`;

function itemLines(order: OrderMailData): string {
  return order.items
    .map((item) => `• ${item.productName} × ${item.quantity}`)
    .join("\n");
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 12px;font-size:18px;color:#111">${title}</h2>
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#888">Sent by <span style="color:#111111;font-weight:bold">Unie</span><span style="color:#6c3ef4;font-weight:bold">Max</span>.</p>
  </div>`;
}

function itemsHtml(order: OrderMailData): string {
  const rows = order.items
    .map(
      (item) =>
        `<li style="margin:2px 0">${item.productName} × ${item.quantity}</li>`,
    )
    .join("");
  return `<ul style="margin:8px 0 0;padding-left:18px;font-size:14px;color:#444">${rows}</ul>`;
}

function linkHtml(href: string, label: string): string {
  // Brand purple — email clients get literal hex, not the app's CSS tokens.
  return `<p style="margin:16px 0 0"><a href="${href}" style="font-size:14px;color:#6c3ef4">${label}</a></p>`;
}

async function customerAddress(
  order: OrderMailData,
  customerId: string | null,
): Promise<string | null> {
  if (order.customerEmail) return order.customerEmail;
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true },
  });
  return customer?.email ?? null;
}

const logFailure = (context: string) => (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`Order email failed (${context}):`, err);
};

/** Customer confirmation + seller alert, after a successful placement. */
export function notifyOrderPlaced(
  order: OrderMailData,
  customerId: string,
  seller: OrderSeller,
): void {
  const sellerEmail = seller.email;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // --- push ---------------------------------------------------------------
  if (customerId) {
    notify({
      principalType: "CUSTOMER",
      principalId: customerId,
      kind: "ORDER_PLACED",
      title: "Order placed",
      body: `Your order ${order.orderNumber} at ${order.storeName} is confirmed — ${formatTotal(order.total)}.`,
      url: `/order/${order.storeSlug}/${order.id}`,
      data: { orderId: order.id },
    });
  }
  notify({
    principalType: "CUSTOMER",
    principalId: seller.id,
    kind: "ORDER_PLACED",
    title: `New order · ${order.storeName}`,
    body: `${order.orderNumber} — ${itemCount} item${itemCount === 1 ? "" : "s"}, ${formatTotal(order.total)}. Confirm it to get started.`,
    url: `/stores/${order.storeSlug}/orders/${order.id}`,
    data: { orderId: order.id },
  });
  notifyAdmins({
    kind: "ORDER_PLACED",
    title: "New order on the platform",
    body: `${order.orderNumber} at ${order.storeName} — ${formatTotal(order.total)}.`,
    url: `/orders/${order.id}`,
  });

  // --- email --------------------------------------------------------------
  void (async () => {
    const paymentLine =
      order.paymentMethod === "COD"
        ? "Payment: Cash on Delivery"
        : "Payment: Online";
    const fulfilmentLine =
      order.fulfilment === "PICKUP"
        ? "You chose store pickup."
        : "It will be delivered to your address.";

    const to = await customerAddress(order, customerId);
    if (to) {
      const confirmationUrl = publicWebUrl
        ? `${publicWebUrl}/order/${order.storeSlug}/${order.id}`
        : null;
      await sendMail({
        to,
        subject: `Order ${order.orderNumber} placed — ${order.storeName}`,
        text: `Hi${order.customerName ? ` ${order.customerName}` : ""},\n\nYour order at ${order.storeName} has been placed.\n\n${itemLines(order)}\n\nTotal: ${formatTotal(order.total)}\n${paymentLine}\n${fulfilmentLine}\n\nWe'll email you as it progresses.${confirmationUrl ? `\n\nView your order: ${confirmationUrl}` : ""}`,
        html: wrapHtml(
          `Your order is placed 🎉`,
          `<p style="margin:0;font-size:14px;color:#444">
             Order <strong>${order.orderNumber}</strong> at
             <strong>${order.storeName}</strong> has been placed.</p>
           ${itemsHtml(order)}
           <p style="margin:12px 0 0;font-size:14px;color:#111">
             <strong>Total: ${formatTotal(order.total)}</strong></p>
           <p style="margin:4px 0 0;font-size:13px;color:#444">${paymentLine}. ${fulfilmentLine}</p>
           ${confirmationUrl ? linkHtml(confirmationUrl, "View your order") : ""}`,
        ),
      });
    }
  })().catch(logFailure("customer placed"));

  if (sellerEmail) {
    void (async () => {
      const manageUrl = publicWebUrl
        ? `${publicWebUrl}/stores/${order.storeSlug}/orders/${order.id}`
        : null;
      await sendMail({
        to: sellerEmail,
        subject: `New order ${order.orderNumber} — ${order.storeName}`,
        text: `You have a new order at ${order.storeName}.\n\n${order.customerName ? `Customer: ${order.customerName}\n` : ""}${itemLines(order)}\n\nTotal: ${formatTotal(order.total)}\n${order.paymentMethod === "COD" ? "Cash on Delivery" : "Online payment"} · ${order.fulfilment === "PICKUP" ? "Store pickup" : "Delivery"}${manageUrl ? `\n\nManage it: ${manageUrl}` : "\n\nOpen your store's Orders section to confirm it."}`,
        html: wrapHtml(
          "You have a new order",
          `<p style="margin:0;font-size:14px;color:#444">
             Order <strong>${order.orderNumber}</strong> at
             <strong>${order.storeName}</strong>${order.customerName ? ` from ${order.customerName}` : ""}.</p>
           ${itemsHtml(order)}
           <p style="margin:12px 0 0;font-size:14px;color:#111">
             <strong>Total: ${formatTotal(order.total)}</strong></p>
           <p style="margin:4px 0 0;font-size:13px;color:#444">
             ${order.paymentMethod === "COD" ? "Cash on Delivery" : "Online payment"} ·
             ${order.fulfilment === "PICKUP" ? "Store pickup" : "Delivery"}</p>
           ${manageUrl ? linkHtml(manageUrl, "Confirm this order") : ""}`,
        ),
      });
    })().catch(logFailure("seller placed"));
  }
}

/**
 * A gateway payment landed on an order the seller had ALREADY CANCELLED
 * (the customer was mid-checkout when it was cancelled). The money is real
 * and the order cannot be revived — its stock went back on sale — so both
 * sides are told a refund is owed rather than "your order is placed".
 * The seller must issue the refund from the Cashfree dashboard until the
 * automatic refund call lands.
 */
export function notifyPaymentOnCancelledOrder(
  order: OrderMailData,
  customerId: string | null,
  sellerEmail: string | null,
): void {
  void (async () => {
    const to = await customerAddress(order, customerId);
    if (!to) return;
    const orderUrl = publicWebUrl
      ? `${publicWebUrl}/order/${order.storeSlug}/${order.id}`
      : null;
    await sendMail({
      to,
      subject: `Refund on the way for order ${order.orderNumber}`,
      text: `Hi${order.customerName ? ` ${order.customerName}` : ""},\n\nYour payment of ${formatTotal(order.total)} for order ${order.orderNumber} went through, but ${order.storeName} had already cancelled the order — so it will not be fulfilled and your payment will be refunded in full.\n\nRefunds usually reach your account within 5–7 working days.${orderUrl ? `\n\nView your order: ${orderUrl}` : ""}`,
      html: wrapHtml(
        "Your payment will be refunded",
        `<p style="margin:0;font-size:14px;color:#444">
           Your payment of <strong>${formatTotal(order.total)}</strong> for order
           <strong>${order.orderNumber}</strong> went through, but
           <strong>${order.storeName}</strong> had already cancelled the order.
           It will not be fulfilled and your payment will be refunded in full.</p>
         <p style="margin:12px 0 0;font-size:13px;color:#444">
           Refunds usually reach your account within 5–7 working days.</p>
         ${orderUrl ? linkHtml(orderUrl, "View your order") : ""}`,
      ),
    });
  })().catch(logFailure("customer payment on cancelled order"));

  if (sellerEmail) {
    void (async () => {
      const manageUrl = publicWebUrl
        ? `${publicWebUrl}/stores/${order.storeSlug}/orders/${order.id}`
        : null;
      await sendMail({
        to: sellerEmail,
        subject: `Refund required — payment received on cancelled order ${order.orderNumber}`,
        text: `A payment of ${formatTotal(order.total)} was received for order ${order.orderNumber}, which you had already cancelled.\n\nThe customer was completing payment when the order was cancelled. The order stays cancelled and its stock is back on sale, but the money HAS been captured.\n\nRefund it from your Cashfree dashboard.${manageUrl ? `\n\nOrder details: ${manageUrl}` : ""}`,
        html: wrapHtml(
          "Refund required",
          `<p style="margin:0;font-size:14px;color:#444">
             A payment of <strong>${formatTotal(order.total)}</strong> was received for order
             <strong>${order.orderNumber}</strong>, which you had already cancelled.</p>
           <p style="margin:12px 0 0;font-size:13px;color:#444">
             The customer was completing payment when the order was cancelled. The order
             stays cancelled and its stock is back on sale, but the money
             <strong>has been captured</strong> — refund it from your Cashfree dashboard.</p>
           ${manageUrl ? linkHtml(manageUrl, "View the order") : ""}`,
        ),
      });
    })().catch(logFailure("seller payment on cancelled order"));
  }
}

/** Customer-facing copy per status the seller can move an order to. */
const STATUS_MAIL: Record<
  string,
  { subject: (o: OrderMailData) => string; line: (o: OrderMailData) => string }
> = {
  CONFIRMED: {
    subject: (o) => `Order ${o.orderNumber} confirmed`,
    line: (o) => `${o.storeName} has confirmed your order and is preparing it.`,
  },
  SHIPPED: {
    subject: (o) => `Order ${o.orderNumber} shipped`,
    line: (o) => `${o.storeName} has shipped your order — it's on the way.`,
  },
  DELIVERED: {
    subject: (o) => `Order ${o.orderNumber} delivered`,
    line: (o) =>
      o.fulfilment === "PICKUP"
        ? `Your order from ${o.storeName} has been picked up. Thanks for shopping!`
        : `Your order from ${o.storeName} has been delivered. Thanks for shopping!`,
  },
  CANCELLED: {
    subject: (o) => `Order ${o.orderNumber} cancelled`,
    line: (o) =>
      `${o.storeName} has cancelled your order${o.cancelReason ? ` — "${o.cancelReason}"` : ""}. Any completed payment will be refunded.`,
  },
};

/**
 * Customer update after a seller status change (Confirmed / Shipped /
 * Delivered / Cancelled — statuses without copy, e.g. PACKED, are silent).
 */
export function notifyOrderStatusChange(
  order: OrderMailData,
  customerId: string | null,
): void {
  const copy = STATUS_MAIL[order.status];
  if (!copy) return;

  if (customerId) {
    notify({
      principalType: "CUSTOMER",
      principalId: customerId,
      kind: "ORDER_STATUS",
      title: copy.subject(order),
      body: copy.line(order),
      url: `/order/${order.storeSlug}/${order.id}`,
      data: { orderId: order.id, status: order.status },
    });
  }

  void (async () => {
    const to = await customerAddress(order, customerId);
    if (!to) return;
    const confirmationUrl = publicWebUrl
      ? `${publicWebUrl}/order/${order.storeSlug}/${order.id}`
      : null;
    const line = copy.line(order);
    await sendMail({
      to,
      subject: copy.subject(order),
      text: `Hi${order.customerName ? ` ${order.customerName}` : ""},\n\n${line}\n\nTotal: ${formatTotal(order.total)}${confirmationUrl ? `\n\nView your order: ${confirmationUrl}` : ""}`,
      html: wrapHtml(
        copy.subject(order),
        `<p style="margin:0;font-size:14px;color:#444">${line}</p>
         <p style="margin:12px 0 0;font-size:14px;color:#111">
           <strong>Total: ${formatTotal(order.total)}</strong></p>
         ${confirmationUrl ? linkHtml(confirmationUrl, "View your order") : ""}`,
      ),
    });
  })().catch(logFailure(`customer ${order.status.toLowerCase()}`));
}
