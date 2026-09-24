import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { mediaUrl } from "../../package/storage/index.js";
import { cashfreeConfigured } from "../payments/payments.service.js";
import { pushConfigured } from "../../package/push/index.js";
import type { RangeQuery } from "./admin.schema.js";
import {
  PUBLIC_PRODUCT_VISIBILITY,
  PUBLIC_STORE_VISIBILITY,
} from "../stores/publicStore.service.js";

/**
 * The platform dashboard — one request, everything the landing page draws.
 *
 * It is a single endpoint rather than eight because the page renders as a
 * whole: eight parallel requests would each pay the connection round trip and
 * the tiles would pop in at different times. All the queries below run
 * concurrently server-side, next to the database.
 *
 * **Money is always a decimal string** ("14250.00"), never a float — that is
 * what Prisma's `Decimal` serialises to, and the raw aggregates below cast to
 * text so every amount in the admin API has exactly one shape.
 */

/** Stock at or below this is "low" on the dashboard's watch list. */
const LOW_STOCK_THRESHOLD = 5;

/** Cancelled orders are not revenue. Used by every money aggregate here. */
const REVENUE_ORDERS: Prisma.OrderWhereInput = { status: { not: "CANCELLED" } };

interface DayRow {
  day: Date;
  orders: number;
  revenue: string;
}

/**
 * Orders + revenue per calendar day. Raw SQL because grouping by day needs
 * `date_trunc`, which Prisma's `groupBy` cannot express — the alternative is
 * loading every order into memory and bucketing in JS.
 */
async function dailySeries(since: Date): Promise<DayRow[]> {
  return prisma.$queryRaw<DayRow[]>`
    SELECT date_trunc('day', "placedAt")           AS day,
           COUNT(*)::int                           AS orders,
           COALESCE(SUM("total") FILTER (WHERE "status" <> 'CANCELLED'), 0)::text AS revenue
    FROM "orders"
    WHERE "placedAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `;
}

/**
 * Pads the series so the chart gets one point per day, including days with no
 * orders — a line chart that skips empty days lies about the trend.
 */
function fillDays(rows: DayRow[], since: Date, days: number) {
  const byDay = new Map(
    rows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row]),
  );
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(since);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    return {
      date: key,
      orders: row?.orders ?? 0,
      revenue: row?.revenue ?? "0",
    };
  });
}

/** Stores ranked by the revenue they generated in the window. */
async function topStores(since: Date) {
  const grouped = await prisma.order.groupBy({
    by: ["storeId"],
    where: { ...REVENUE_ORDERS, placedAt: { gte: since }, storeId: { not: null } },
    _sum: { total: true },
    _count: { _all: true },
    orderBy: { _sum: { total: "desc" } },
    take: 5,
  });

  const stores = await prisma.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId!) } },
    select: { id: true, name: true, slug: true, logoKey: true },
  });
  const storeById = new Map(stores.map((s) => [s.id, s]));

  return grouped.flatMap((row) => {
    const store = storeById.get(row.storeId!);
    if (!store) return []; // deleted since the orders were placed
    return [
      {
        id: store.id,
        name: store.name,
        slug: store.slug,
        logoUrl: mediaUrl("logo", store.logoKey),
        orders: row._count._all,
        revenue: row._sum.total ?? new Prisma.Decimal(0),
      },
    ];
  });
}

/** Products ranked by units sold in the window (cancelled orders excluded). */
async function topProducts(since: Date) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { ...REVENUE_ORDERS, placedAt: { gte: since } },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 5,
  });

  const products = await prisma.storeProduct.findMany({
    where: { id: { in: grouped.map((g) => g.productId!) } },
    select: { id: true, name: true, slug: true, store: { select: { name: true, slug: true } } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return grouped.flatMap((row) => {
    const product = productById.get(row.productId!);
    if (!product) return [];
    return [
      {
        id: product.id,
        name: product.name,
        storeName: product.store.name,
        storeSlug: product.store.slug,
        unitsSold: row._sum.quantity ?? 0,
        revenue: row._sum.lineTotal ?? new Prisma.Decimal(0),
      },
    ];
  });
}

export async function getDashboard(query: RangeQuery) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Window start, aligned to midnight so the chart's buckets are whole days.
  const since = new Date(startOfToday);
  since.setDate(since.getDate() - (query.days - 1));

  const [
    storeCounts,
    customers,
    sellers,
    blockedCustomers,
    products,
    orderTotals,
    todayOrders,
    ordersByStatus,
    paymentsByStatus,
    codRevenue,
    onlineRevenue,
    series,
    stores,
    productsRanked,
    recentOrders,
    lowStock,
  ] = await Promise.all([
    prisma.store.groupBy({ by: ["isPublished"], _count: { _all: true } }),
    prisma.customer.count(),
    prisma.customer.count({ where: { stores: { some: {} } } }),
    prisma.customer.count({ where: { blockedAt: { not: null } } }),
    prisma.storeProduct.count(),
    prisma.order.aggregate({
      where: REVENUE_ORDERS,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...REVENUE_ORDERS, placedAt: { gte: startOfToday } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["paymentStatus"],
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...REVENUE_ORDERS, paymentMethod: "COD" },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...REVENUE_ORDERS, paymentMethod: "ONLINE" },
      _sum: { total: true },
    }),
    dailySeries(since),
    topStores(since),
    topProducts(since),
    prisma.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        storeName: true,
        storeSlug: true,
        customerName: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
      },
    }),
    prisma.storeProduct.findMany({
      // "Live listings" means what shoppers can actually see: the same
      // visibility rules as the storefront, in a store that is published.
      where: {
        ...PUBLIC_PRODUCT_VISIBILITY,
        store: PUBLIC_STORE_VISIBILITY,
        stockTotal: { lte: LOW_STOCK_THRESHOLD },
      },
      orderBy: { stockTotal: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        stockTotal: true,
        store: { select: { name: true, slug: true } },
      },
    }),
  ]);

  const publishedStores =
    storeCounts.find((row) => row.isPublished)?._count._all ?? 0;
  const draftStores =
    storeCounts.find((row) => !row.isPublished)?._count._all ?? 0;
  const statusCount = new Map(
    ordersByStatus.map((row) => [row.status, row._count._all]),
  );
  const paymentCount = new Map(
    paymentsByStatus.map((row) => [row.paymentStatus, row]),
  );

  return {
    range: { days: query.days, since },
    totals: {
      stores: publishedStores + draftStores,
      publishedStores,
      draftStores,
      customers,
      sellers,
      blockedCustomers,
      products,
      orders: orderTotals._count._all,
      revenue: orderTotals._sum.total ?? new Prisma.Decimal(0),
    },
    today: {
      orders: todayOrders._count._all,
      revenue: todayOrders._sum.total ?? new Prisma.Decimal(0),
    },
    orderStatus: {
      pending: statusCount.get("PENDING") ?? 0,
      confirmed: statusCount.get("CONFIRMED") ?? 0,
      packed: statusCount.get("PACKED") ?? 0,
      shipped: statusCount.get("SHIPPED") ?? 0,
      delivered: statusCount.get("DELIVERED") ?? 0,
      cancelled: statusCount.get("CANCELLED") ?? 0,
    },
    payments: {
      paid: paymentCount.get("PAID")?._count._all ?? 0,
      pending: paymentCount.get("PENDING")?._count._all ?? 0,
      failed: paymentCount.get("FAILED")?._count._all ?? 0,
      refunded: paymentCount.get("REFUNDED")?._count._all ?? 0,
      collected: paymentCount.get("PAID")?._sum.total ?? new Prisma.Decimal(0),
      codRevenue: codRevenue._sum.total ?? new Prisma.Decimal(0),
      onlineRevenue: onlineRevenue._sum.total ?? new Prisma.Decimal(0),
    },
    series: fillDays(series, since, query.days),
    topStores: stores,
    topProducts: productsRanked,
    recentOrders,
    lowStock: lowStock.map(({ store, ...product }) => ({
      ...product,
      storeName: store.name,
      storeSlug: store.slug,
    })),
    // Integration health — surfaced on the dashboard so a missing key is
    // noticed before a customer hits it, not after.
    integrations: { paymentGateway: cashfreeConfigured, push: pushConfigured },
  };
}
