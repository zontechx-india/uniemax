import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
import type { OrderListQuery, PaymentListQuery } from "./admin.schema.js";

/**
 * Orders and payments across every store — the platform's read-only view.
 *
 * Deliberately read-only: fulfilment is the seller's job (they own the stock
 * and the customer relationship), so the console reports on orders rather
 * than driving them. Support cases are answered from here; the seller still
 * confirms/packs/ships in their own dashboard.
 *
 * Payments are the same rows viewed through the money lens rather than a
 * separate table — a payment IS an order's settlement, and duplicating it
 * would be a second source of truth to keep in sync.
 */

const summarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  storeId: true,
  storeName: true,
  storeSlug: true,
  customerName: true,
  customerPhone: true,
  fulfilment: true,
  paymentMethod: true,
  paymentStatus: true,
  paymentRef: true,
  total: true,
  placedAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type SummaryRow = Prisma.OrderGetPayload<{ select: typeof summarySelect }>;

const shapeSummary = ({ _count, ...order }: SummaryRow) => ({
  ...order,
  itemCount: _count.items,
});

/** Shared filter builder — the orders and payments lists differ only in which
 * filters they expose, never in how a filter behaves. */
function buildWhere(query: OrderListQuery | PaymentListQuery) {
  const where: Prisma.OrderWhereInput = {};
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: "insensitive" } },
      { customerName: { contains: query.q, mode: "insensitive" } },
      { customerPhone: { contains: query.q } },
      { storeName: { contains: query.q, mode: "insensitive" } },
      { paymentRef: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if ("status" in query && query.status) where.status = query.status;
  if ("storeId" in query && query.storeId) where.storeId = query.storeId;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.from || query.to) {
    where.placedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  return where;
}

export async function listOrders(query: OrderListQuery) {
  const where = buildWhere(query);
  const [total, rows, revenue] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: summarySelect,
    }),
    // Totals for the CURRENT filter, so the header answers "how much is this
    // slice worth" without a second round trip.
    prisma.order.aggregate({
      where: { ...where, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),
  ]);

  return {
    rows: rows.map(shapeSummary),
    filteredRevenue: revenue._sum.total ?? new Prisma.Decimal(0),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

export async function getOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      ...summarySelect,
      customerEmail: true,
      addressLine: true,
      pincode: true,
      state: true,
      country: true,
      subtotal: true,
      shippingCharge: true,
      shippingMethod: true,
      shippingBasis: true,
      tax: true,
      discount: true,
      billingAddress: true,
      cfOrderId: true,
      confirmedAt: true,
      packedAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      cancelReason: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      store: { select: { id: true, name: true, slug: true, ownerId: true } },
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          variantName: true,
          productSlug: true,
          imageKey: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
  });
  if (!order) throw HttpError.notFound("Order not found");

  const { _count, items, ...rest } = order;
  return {
    ...rest,
    itemCount: _count.items,
    items: items.map(({ imageKey, ...item }) => ({
      ...item,
      imageUrl: mediaUrl("media", imageKey),
    })),
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(query: PaymentListQuery) {
  const where = buildWhere(query);
  const [total, rows, byStatus] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: summarySelect,
    }),
    prisma.order.groupBy({
      by: ["paymentStatus"],
      where,
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);

  return {
    rows: rows.map(shapeSummary),
    // Per-status totals for the same filter — the summary strip above the table.
    totals: Object.fromEntries(
      byStatus.map((row) => [
        row.paymentStatus,
        { count: row._count._all, amount: row._sum.total ?? new Prisma.Decimal(0) },
      ]),
    ),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}
