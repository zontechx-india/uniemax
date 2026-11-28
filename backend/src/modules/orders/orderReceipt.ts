import { prisma } from "../../config/prisma.js";
import { publicWebUrl } from "../../package/mail/index.js";
import { HttpError } from "../../utils/httpError.js";
import { formatDate, renderBillPdf, toPaise, type BillPdfData } from "../bills/billPdf.js";
import { OFFLINE_MODE_LABEL, maskPhone, pdfShop, spacedPhone } from "../bills/pdfShop.js";

/**
 * The order receipt — a PDF for every DELIVERED order, drawn by the same
 * renderer as the seller bill (bills/billPdf.ts). Sent with the "delivered"
 * email and WhatsApp, and downloadable from the customer's and the seller's
 * order page.
 *
 * `audience: "public"` is the copy behind the order link (it may be forwarded,
 * and Meta fetches it for WhatsApp): phone masked, street address left out —
 * the same rule as the public order page. "full" (the seller, the customer's own
 * email) shows everything.
 */

const orderSelect = {
  id: true,
  orderNumber: true,
  storeId: true,
  storeSlug: true,
  status: true,
  fulfilment: true,
  customerName: true,
  customerPhone: true,
  addressLine: true,
  pincode: true,
  state: true,
  subtotal: true,
  shippingCharge: true,
  discount: true,
  total: true,
  paymentMethod: true,
  paymentRef: true,
  offlineMode: true,
  paidByName: true,
  deliveredAt: true,
  placedAt: true,
  items: {
    select: { productName: true, variantName: true, sku: true, quantity: true, unitPrice: true, lineTotal: true },
    orderBy: { id: "asc" },
  },
} as const;

/** The customer's order page — printed in the footer and used as the WhatsApp link. */
export const orderLink = (storeSlug: string, orderId: string) =>
  `${publicWebUrl ?? ""}/order/${storeSlug}/${orderId}`;

/** Where Meta (and anyone with the order link) fetches the public receipt. */
export const publicReceiptUrl = (storeSlug: string, orderId: string) =>
  publicWebUrl ? `${publicWebUrl}/api/v1/public/stores/${storeSlug}/orders/${orderId}/receipt` : null;

export const receiptFileName = (orderNumber: string) => `Receipt-${orderNumber}.pdf`;

/** The receipt for one order: `where` scopes it (the store's own, or the public link's slug). */
export async function orderReceiptPdf(
  where: { id: string; storeId?: string; storeSlug?: string },
  audience: "full" | "public",
): Promise<{ fileName: string; bytes: Buffer }> {
  const order = await prisma.order.findFirst({ where, select: orderSelect });
  if (!order || !order.storeId) throw HttpError.notFound("Order not found");
  if (order.status !== "DELIVERED") {
    throw HttpError.conflict("The receipt is ready once the order is delivered.");
  }
  const shop = await pdfShop(order.storeId);
  const pub = audience === "public";
  const phone = (p: string) => (pub ? maskPhone(p) : spacedPhone(p));
  const pickup = order.fulfilment === "PICKUP";
  const when = formatDate(order.deliveredAt ?? order.placedAt);

  const payment: string[] = [];
  if (order.paymentMethod === "COD") {
    payment.push(`Paid in cash ${pickup ? "at pickup" : "on delivery"} on ${when}`);
  } else if (order.paymentMethod === "OFFLINE") {
    payment.push(`Paid to ${shop.name} by ${OFFLINE_MODE_LABEL[order.offlineMode ?? ""] ?? "a direct payment"}`);
  } else {
    payment.push("Paid online");
    if (order.paymentRef === "DEV-SIMULATED") payment.push("Simulated payment (development build)");
    else if (order.paymentRef) payment.push(`Payment reference ${order.paymentRef}`);
  }
  if (order.paidByName) payment.push(`Paid by ${order.paidByName}`);

  const data: BillPdfData = {
    kind: "RECEIPT",
    number: order.orderNumber,
    orderNumber: null,
    issuedAt: order.deliveredAt ?? order.placedAt,
    store: shop,
    // A name only when it has letters — an order made without one stores the phone there.
    customer: {
      name: order.customerName && /\p{L}/u.test(order.customerName) ? order.customerName : null,
      phone: order.customerPhone ? phone(order.customerPhone) : "",
    },
    handover: pickup
      ? { label: "Store pickup", lines: [`Collected from ${shop.name}`] }
      : {
          label: "Delivered to",
          lines: pub
            ? [`PIN ${order.pincode ?? ""}${order.state ? `, ${order.state}` : ""}`]
            : [order.addressLine ?? "", `${order.state ?? ""} ${order.pincode ?? ""}`.trim()].filter(Boolean),
        },
    lines: order.items.map((l) => ({
      name: l.productName,
      detail: [l.variantName, l.sku ? `SKU ${l.sku}` : null].filter(Boolean).join("  ·  ") || null,
      quantity: l.quantity,
      unitPaise: toPaise(l.unitPrice.toString()),
      amountPaise: toPaise(l.lineTotal.toString()),
    })),
    subtotalPaise: toPaise(order.subtotal.toString()),
    shippingPaise: toPaise(order.shippingCharge.toString()),
    shippingNote: pickup ? "Pickup" : Number(order.shippingCharge) === 0 ? "Free" : null,
    discountPaise: toPaise(order.discount.toString()),
    totalPaise: toPaise(order.total.toString()),
    payment,
    payLink: null,
    note: null,
    viewLink: orderLink(order.storeSlug, order.id),
  };
  return { fileName: receiptFileName(order.orderNumber), bytes: await renderBillPdf(data) };
}
