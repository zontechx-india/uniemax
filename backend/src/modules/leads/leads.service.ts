import { prisma } from "../../config/prisma.js";
import { mediaUrl } from "../../package/storage/index.js";
import { buildListMeta } from "../../utils/response.js";
import { SELLER_VISIBLE } from "../orders/orders.service.js";
import { PAYMENT_WINDOW_MS } from "../payments/payments.jobs.js";
import { decimalToPaise, paiseToAmount } from "../payouts/payouts.rules.js";
import { PUBLIC_PRODUCT_VISIBILITY } from "../stores/publicStore.service.js";
import {
  CART_MAX_AGE_MS,
  PAYMENT_MAX_AGE_MS,
  groupCartLeads,
  paymentLeadState,
  pickPaymentLeads,
  type CartLead,
} from "./leads.rules.js";
import type { LeadListQuery } from "./leads.schema.js";

/**
 * Leads (docs/API.md → Seller leads): people who nearly bought from a store.
 * Read-only. Cart leads never carry the shopper's name, phone or id — see
 * leads.rules.ts.
 *
 * Volumes per store are small (a week of unpaid checkouts, a month of carts),
 * so both kinds are read whole (capped) and paginated in memory after the
 * grouping and de-duplication that SQL can't express simply.
 */

/** Hard caps on what one request reads — far above a real store's volume. */
const MAX_CART_LINES = 3000;
const MAX_ORDERS = 2000;

// ---------------------------------------------------------------------------
// Payment not completed
// ---------------------------------------------------------------------------

async function paymentLeads(storeId: string, now: Date) {
  const since = new Date(now.getTime() - PAYMENT_MAX_AGE_MS);
  const [unpaid, later] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        paymentMethod: "ONLINE",
        paymentStatus: { in: ["PENDING", "FAILED"] },
        placedAt: { gte: since },
        // The shopper cancelled it themselves — they changed their mind.
        cancelledByCustomer: false,
      },
      orderBy: { placedAt: "desc" },
      take: MAX_ORDERS,
      select: {
        id: true,
        orderNumber: true,
        placedAt: true,
        status: true,
        paymentStatus: true,
        customerId: true,
        customerName: true,
        customerPhone: true,
        total: true,
        items: { select: { productName: true, variantName: true, quantity: true, imageKey: true } },
      },
    }),
    // Real orders since — a shopper who came back and bought is not a lead.
    prisma.order.findMany({
      where: { storeId, ...SELLER_VISIBLE, placedAt: { gte: since } },
      take: MAX_ORDERS,
      select: { placedAt: true, customerId: true, customerPhone: true },
    }),
  ]);
  return pickPaymentLeads(unpaid, later).map((order) => ({
    kind: "PAYMENT_PENDING" as const,
    id: order.id,
    orderNumber: order.orderNumber,
    at: order.placedAt,
    /** PAYING (window still open) · FAILED · EXPIRED (window closed). */
    state: paymentLeadState(order),
    /**
     * When the payment window closes — the shopper can still pay this order
     * until then (payments.jobs.ts closes it on its next run after). Null
     * once the order is closed.
     */
    closesAt:
      order.status === "AWAITING_PAYMENT"
        ? new Date(order.placedAt.getTime() + PAYMENT_WINDOW_MS)
        : null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    amount: order.total.toFixed(2),
    quantity: order.items.reduce((acc, item) => acc + item.quantity, 0),
    items: order.items.map((item) => ({
      name: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      imageUrl: mediaUrl("media", item.imageKey),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Carts
// ---------------------------------------------------------------------------

async function cartLeads(storeId: string, now: Date): Promise<CartLead[]> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  const lines = await prisma.cartLine.findMany({
    where: {
      storeId,
      status: "ACTIVE",
      updatedAt: { gte: new Date(now.getTime() - CART_MAX_AGE_MS) },
      cart: {
        customer: { blockedAt: null },
        // The seller's own account trying out their shop is not a lead.
        ...(store ? { customerId: { not: store.ownerId } } : {}),
      },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_CART_LINES,
    select: {
      cartId: true,
      quantity: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          media: {
            where: { type: "IMAGE" },
            orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
            select: { key: true },
          },
        },
      },
      variant: {
        select: { name: true, isDefault: true, isActive: true, stockQuantity: true, price: true, media: { select: { key: true } } },
      },
    },
  });
  // Value counts what the shopper could buy now, at today's price — the
  // cart's own rule (money is never read from the cart table).
  const visible = new Set(
    lines.length > 0
      ? (
          await prisma.storeProduct.findMany({
            where: { id: { in: [...new Set(lines.map((l) => l.product.id))] }, ...PUBLIC_PRODUCT_VISIBILITY },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [],
  );
  return groupCartLeads(
    lines.map((line) => {
      const buyable = visible.has(line.product.id) && line.variant.isActive && line.variant.stockQuantity > 0;
      return {
        cartId: line.cartId,
        quantity: line.quantity,
        createdAt: line.createdAt,
        updatedAt: line.updatedAt,
        productName: line.product.name,
        variantName: line.variant.isDefault ? null : line.variant.name,
        imageKey: line.variant.media?.key ?? line.product.media[0]?.key ?? null,
        unitPricePaise: buyable && line.variant.price ? decimalToPaise(line.variant.price) : null,
      };
    }),
    now,
  );
}

function shapeCartLead(lead: CartLead) {
  return {
    kind: lead.kind,
    /** The cart's id — opaque; never the customer's. */
    id: lead.cartId,
    at: lead.lastActiveAt,
    addedAt: lead.addedAt,
    value: paiseToAmount(lead.valuePaise),
    quantity: lead.quantity,
    items: lead.lines.map((line) => ({
      name: line.productName,
      variantName: line.variantName,
      quantity: line.quantity,
      imageUrl: mediaUrl("media", line.imageKey),
      /** False when it can't be bought now (hidden, switched off, sold out). */
      available: line.unitPricePaise !== null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** One kind of lead, one page, plus the count of every kind (the tab badges). */
export async function listLeads(storeId: string, query: LeadListQuery, now = new Date()) {
  const [payments, carts] = await Promise.all([paymentLeads(storeId, now), cartLeads(storeId, now)]);
  const active = carts.filter((lead) => lead.kind === "ACTIVE");
  const abandoned = carts.filter((lead) => lead.kind === "ABANDONED");
  const all =
    query.kind === "PAYMENT_PENDING"
      ? payments
      : (query.kind === "ACTIVE" ? active : abandoned).map(shapeCartLead);
  const start = (query.page - 1) * query.pageSize;
  return {
    counts: { PAYMENT_PENDING: payments.length, ACTIVE: active.length, ABANDONED: abandoned.length },
    rows: all.slice(start, start + query.pageSize),
    meta: buildListMeta(all.length, query.page, query.pageSize),
  };
}
