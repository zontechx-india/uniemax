import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { decimalToPaise } from "../payouts/payouts.rules.js";
import {
  bpToPercent,
  computeFinancials,
  orderLegs,
  paiseToAmount,
  payoutLegs,
  percentToBp,
  resolveRule,
  amountToPaise,
  type ComputedFinancials,
  type Leg,
} from "./finance.rules.js";
import { lockBalance, postLegs, type PostActor } from "./ledger.service.js";
import type {
  AdjustmentInput,
  BalanceListQuery,
  FeeRuleCreateInput,
  LedgerListQuery,
} from "./finance.schema.js";

/**
 * Seller finance (docs/seller-finance/README.md).
 *
 *   Fee rules     versioned, never edited; the rule in force when an order
 *                 was PLACED is the one it pays. Seeded at 0%.
 *   Snapshot      `order_financials`, written when the order is delivered.
 *                 Before that, the same numbers are computed on the fly —
 *                 identical, because rules can't be back-dated.
 *   Ledger        delivered online order → sale − fees into PAYABLE;
 *                 delivered COD order → platform fee into OWED;
 *                 payouts move PAYABLE → IN_PAYOUT → out (payouts module).
 *
 * The platform fee is never shown to customers: nothing here is reachable
 * from a public or customer route.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

// ---------------------------------------------------------------------------
// Fee rules
// ---------------------------------------------------------------------------

function loadRules(db: Db) {
  return db.feeRule.findMany({ orderBy: { effectiveFrom: "asc" } });
}

/** The rates in force now (and any scheduled change) for a store. */
export async function currentRates(storeId: string | null = null) {
  const rules = await loadRules(prisma);
  const now = new Date();
  const ctx = (method: "ONLINE" | "COD") => ({ storeId, categoryId: null, method, at: now });
  const platform = resolveRule(rules, "PLATFORM", ctx("ONLINE"));
  const platformCod = resolveRule(rules, "PLATFORM", ctx("COD"));
  const gateway = resolveRule(rules, "GATEWAY", ctx("ONLINE"));
  const upcoming = rules.filter((rule) => rule.effectiveFrom > now && rule.scope === "GLOBAL" && !rule.retiredAt);
  const show = (rule: (typeof rules)[number] | null) =>
    rule
      ? { ruleId: rule.id, percent: rule.percent.toFixed(2), bearer: rule.bearer, effectiveFrom: rule.effectiveFrom }
      : { ruleId: null, percent: "0.00", bearer: "PLATFORM" as const, effectiveFrom: null };
  return {
    platform: show(platform),
    /** Same as `platform` until a COD-only rule exists. */
    platformCod: show(platformCod),
    gateway: show(gateway),
    upcoming: upcoming.map((rule) => ({
      kind: rule.kind,
      percent: rule.percent.toFixed(2),
      bearer: rule.bearer,
      effectiveFrom: rule.effectiveFrom,
    })),
  };
}

/** Admin: every version, newest first, plus what is in force now. */
export async function listFeeRules() {
  const [rules, current] = await Promise.all([
    prisma.feeRule.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] }),
    currentRates(null),
  ]);
  return { current, rules };
}

/** A new version. Today only GLOBAL rules; never back-dated. */
export async function createFeeRule(input: FeeRuleCreateInput, actor: PostActor) {
  const bp = percentToBp(input.percent);
  if (bp === null) throw HttpError.badRequest("Enter a percent between 0 and 100, at most 2 decimals");
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  // A rule dated in the past would change the fee of orders already placed.
  if (effectiveFrom.getTime() < Date.now() - 5 * 60_000) {
    throw new HttpError(422, "The start date can't be in the past — past orders keep the fee they were placed with.");
  }
  return prisma.feeRule.create({
    data: {
      kind: input.kind,
      scope: "GLOBAL",
      percent: new Prisma.Decimal(bpToPercent(bp)),
      // The platform fee is always the seller's; the gateway fee is whoever's chosen.
      bearer: input.kind === "PLATFORM" ? "SELLER" : (input.bearer ?? "PLATFORM"),
      effectiveFrom,
      note: input.note ?? null,
      createdById: actor.id,
      createdByEmail: actor.email,
    },
  });
}

// ---------------------------------------------------------------------------
// Order financials
// ---------------------------------------------------------------------------

const ORDER_FOR_FIN = {
  id: true,
  orderNumber: true,
  storeId: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  total: true,
  shippingCharge: true,
  placedAt: true,
  items: { select: { id: true, lineTotal: true } },
} satisfies Prisma.OrderSelect;

type OrderForFin = Prisma.OrderGetPayload<{ select: typeof ORDER_FOR_FIN }>;

const method = (order: { paymentMethod: string }) => (order.paymentMethod === "COD" ? "COD" : "ONLINE") as "ONLINE" | "COD";

async function compute(db: Db, order: OrderForFin): Promise<ComputedFinancials> {
  return computeFinancials(
    {
      storeId: order.storeId,
      method: method(order),
      placedAt: order.placedAt,
      totalPaise: decimalToPaise(order.total),
      shippingPaise: decimalToPaise(order.shippingCharge),
      // categoryId: filled when CATEGORY-scoped rules are offered.
      lines: order.items.map((item) => ({ orderItemId: item.id, lineTotalPaise: decimalToPaise(item.lineTotal), categoryId: null })),
    },
    await loadRules(db),
  );
}

/** The API shape of an order's fee breakdown (from the snapshot or computed). */
function shapeFinancials(order: OrderForFin, fin: ComputedFinancials, posted: { saved: boolean; postedAt: Date | null }) {
  return {
    paymentMethod: method(order),
    orderTotal: order.total.toFixed(2),
    itemsAmount: paiseToAmount(fin.itemsPaise),
    shippingAmount: order.shippingCharge.toFixed(2),
    platformFee: paiseToAmount(fin.platformFeePaise),
    platformFeePercent: fin.platformFeeBp === null ? null : bpToPercent(fin.platformFeeBp),
    gatewayFee: paiseToAmount(fin.gatewayFeePaise),
    gatewayFeePercent: bpToPercent(fin.gatewayFeeBp),
    gatewayFeeBearer: fin.gatewayFeeBearer,
    sellerEarning: paiseToAmount(fin.sellerEarningPaise),
    lines: fin.lines,
    /** false = computed now; it is frozen when the order is delivered. */
    frozen: posted.saved,
    postedAt: posted.postedAt,
  };
}

function fromSnapshot(row: Prisma.OrderFinancialsGetPayload<object>): ComputedFinancials {
  return {
    itemsPaise: decimalToPaise(row.itemsAmount),
    platformFeePaise: decimalToPaise(row.platformFee),
    platformFeeBp: row.platformFeePercent ? percentToBp(row.platformFeePercent.toFixed(2)) : null,
    gatewayFeePaise: decimalToPaise(row.gatewayFee),
    gatewayFeeBp: percentToBp(row.gatewayFeePercent.toFixed(2)) ?? 0,
    gatewayFeeBearer: row.gatewayFeeBearer,
    gatewayFeeRuleId: row.gatewayFeeRuleId,
    sellerEarningPaise: decimalToPaise(row.sellerEarning),
    lines: row.lines as ComputedFinancials["lines"],
  };
}

/** Admin / seller: an order's fee breakdown. */
export async function getOrderFinancials(orderId: string, db: Db = prisma) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { ...ORDER_FOR_FIN, financials: true } });
  if (!order) throw HttpError.notFound("Order not found");
  const { financials, ...rest } = order;
  const fin = financials ? fromSnapshot(financials) : await compute(db, rest);
  return { ...shapeFinancials(rest, fin, { saved: Boolean(financials), postedAt: financials?.postedAt ?? null }), sellerEarningPaise: fin.sellerEarningPaise };
}

/**
 * Freeze a delivered order's fees and post its ledger entries — once.
 * Online orders post only when PAID (UnieMax holds the money); COD orders
 * post their fee as the seller's due. Anything else is left alone.
 */
export async function postDeliveredOrder(orderId: string): Promise<"posted" | "skipped"> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { ...ORDER_FOR_FIN, financials: true } });
    if (!order || order.status !== "DELIVERED" || !order.storeId) return "skipped";
    if (order.financials?.postedAt) return "skipped";
    const m = method(order);
    if (m === "ONLINE" && order.paymentStatus !== "PAID") return "skipped";

    const { financials, ...rest } = order;
    const fin = financials ? fromSnapshot(financials) : await compute(tx, rest);
    if (!financials) {
      await tx.orderFinancials.create({
        data: {
          orderId,
          paymentMethod: order.paymentMethod,
          itemsAmount: new Prisma.Decimal(paiseToAmount(fin.itemsPaise)),
          shippingAmount: order.shippingCharge,
          orderTotal: order.total,
          platformFee: new Prisma.Decimal(paiseToAmount(fin.platformFeePaise)),
          platformFeePercent: fin.platformFeeBp === null ? null : new Prisma.Decimal(bpToPercent(fin.platformFeeBp)),
          gatewayFee: new Prisma.Decimal(paiseToAmount(fin.gatewayFeePaise)),
          gatewayFeePercent: new Prisma.Decimal(bpToPercent(fin.gatewayFeeBp)),
          gatewayFeeBearer: fin.gatewayFeeBearer,
          gatewayFeeRuleId: fin.gatewayFeeRuleId,
          sellerEarning: new Prisma.Decimal(paiseToAmount(fin.sellerEarningPaise)),
          lines: fin.lines as unknown as Prisma.InputJsonArray,
        },
      });
    }
    const legs = orderLegs(
      { id: order.id, orderNumber: order.orderNumber, method: m },
      {
        totalPaise: decimalToPaise(order.total),
        platformFeePaise: fin.platformFeePaise,
        gatewayFeePaise: fin.gatewayFeePaise,
        gatewayFeeBearer: fin.gatewayFeeBearer,
      },
    );
    await postLegs(tx, order.storeId, legs);
    await tx.orderFinancials.update({ where: { orderId }, data: { postedAt: new Date() } });
    return "posted";
  });
}

// ---------------------------------------------------------------------------
// Payouts → ledger
// ---------------------------------------------------------------------------

/**
 * Bring the ledger in line with a payout's current state (payoutLegs).
 * Call inside the same transaction as every payout change; the sweep catches
 * anything older. Idempotent.
 */
export async function syncPayoutLedger(tx: Tx, payoutId: string): Promise<void> {
  const payout = await tx.orderPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      status: true,
      amount: true,
      duesDeducted: true,
      order: { select: { id: true, orderNumber: true, storeId: true } },
      events: { where: { toStatus: "SUCCEEDED" }, select: { id: true }, take: 1 },
    },
  });
  if (!payout) return;
  if (payout.order.storeId) {
    // The payouts module posts the order's own earning (postDeliveredOrder)
    // before it creates a payout, so the sale is on the ledger first.
    const legs = payoutLegs({
      id: payout.id,
      orderId: payout.order.id,
      orderNumber: payout.order.orderNumber,
      status: payout.status,
      amountPaise: decimalToPaise(payout.amount),
      duesPaise: decimalToPaise(payout.duesDeducted),
      wasPaid: payout.events.length > 0,
    });
    await postLegs(tx, payout.order.storeId, legs);
  }
  await tx.orderPayout.update({ where: { id: payout.id }, data: { ledgerStatus: payout.status } });
}

/** The store's balances, locked — payouts read the seller's dues with this. */
export async function lockedBalances(tx: Tx, storeId: string) {
  return lockBalance(tx, storeId);
}

// ---------------------------------------------------------------------------
// Sweep — backfill + safety net for missed events
// ---------------------------------------------------------------------------

const SWEEP_BATCH = 100;

export async function sweep(log: FastifyBaseLogger): Promise<{ orders: number; payouts: number }> {
  const orders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      storeId: { not: null },
      OR: [{ paymentMethod: "COD" }, { paymentStatus: "PAID" }],
      AND: [{ OR: [{ financials: { is: null } }, { financials: { postedAt: null } }] }],
    },
    orderBy: { deliveredAt: "asc" },
    take: SWEEP_BATCH,
    select: { id: true },
  });
  let postedOrders = 0;
  for (const { id } of orders) {
    try {
      if ((await postDeliveredOrder(id)) === "posted") postedOrders += 1;
    } catch (err) {
      log.error({ err, orderId: id }, "finance sweep: order posting failed");
    }
  }

  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "public"."order_payouts"
    WHERE "ledgerStatus" IS DISTINCT FROM "status"
    ORDER BY "createdAt" ASC LIMIT ${SWEEP_BATCH}`;
  let syncedPayouts = 0;
  for (const { id } of stale) {
    try {
      await prisma.$transaction((tx) => syncPayoutLedger(tx, id));
      syncedPayouts += 1;
    } catch (err) {
      log.error({ err, payoutId: id }, "finance sweep: payout sync failed");
    }
  }
  return { orders: postedOrders, payouts: syncedPayouts };
}

// ---------------------------------------------------------------------------
// Admin reads + adjustments
// ---------------------------------------------------------------------------

const money = (value: Prisma.Decimal) => value.toFixed(2);

function shapeBalance(row: { payable: Prisma.Decimal; inPayout: Prisma.Decimal; owed: Prisma.Decimal; updatedAt: Date } | null) {
  if (!row) return { payable: "0.00", inPayout: "0.00", owed: "0.00", net: "0.00", updatedAt: null };
  const net = decimalToPaise(row.payable) - decimalToPaise(row.owed);
  return { payable: money(row.payable), inPayout: money(row.inPayout), owed: money(row.owed), net: paiseToAmount(net), updatedAt: row.updatedAt };
}

/** Every store with a balance row, largest amounts first. */
export async function listBalances(query: BalanceListQuery) {
  const storeFilter = query.q
    ? await prisma.store.findMany({
        where: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { slug: { contains: query.q, mode: "insensitive" } }] },
        select: { id: true },
        take: 500,
      })
    : null;
  const where: Prisma.SellerBalanceWhereInput = {
    ...(storeFilter ? { storeId: { in: storeFilter.map((s) => s.id) } } : {}),
    ...(query.filter === "PAYABLE" ? { payable: { gt: 0 } } : {}),
    ...(query.filter === "OWED" ? { owed: { gt: 0 } } : {}),
  };
  const [total, rows, sums] = await Promise.all([
    prisma.sellerBalance.count({ where }),
    prisma.sellerBalance.findMany({
      where,
      orderBy: [{ payable: "desc" }, { owed: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.sellerBalance.aggregate({ where, _sum: { payable: true, inPayout: true, owed: true } }),
  ]);
  const stores = await prisma.store.findMany({
    where: { id: { in: rows.map((row) => row.storeId) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(stores.map((store) => [store.id, store]));
  return {
    rows: rows.map((row) => ({
      storeId: row.storeId,
      storeName: byId.get(row.storeId)?.name ?? "(deleted store)",
      storeSlug: byId.get(row.storeId)?.slug ?? null,
      ...shapeBalance(row),
    })),
    totals: {
      payable: money(sums._sum.payable ?? new Prisma.Decimal(0)),
      inPayout: money(sums._sum.inPayout ?? new Prisma.Decimal(0)),
      owed: money(sums._sum.owed ?? new Prisma.Decimal(0)),
    },
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** One store's money: balances, fee totals, rates. */
export async function getStoreFinance(storeId: string) {
  const [store, balance, fees, rates] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true } }),
    prisma.sellerBalance.findUnique({ where: { storeId } }),
    prisma.orderFinancials.groupBy({
      by: ["paymentMethod"],
      where: { order: { storeId }, postedAt: { not: null } },
      _count: { _all: true },
      _sum: { orderTotal: true, platformFee: true, gatewayFee: true },
    }),
    currentRates(storeId),
  ]);
  if (!store && !balance) throw HttpError.notFound("Store not found");
  const pick = (m: "ONLINE" | "COD") => {
    const row = fees.find((f) => (m === "COD" ? f.paymentMethod === "COD" : f.paymentMethod !== "COD"));
    return {
      orders: row?._count._all ?? 0,
      sales: money(row?._sum.orderTotal ?? new Prisma.Decimal(0)),
      platformFees: money(row?._sum.platformFee ?? new Prisma.Decimal(0)),
      gatewayFees: money(row?._sum.gatewayFee ?? new Prisma.Decimal(0)),
    };
  };
  return {
    store: store ?? { id: storeId, name: "(deleted store)", slug: null },
    balance: shapeBalance(balance),
    /** Delivered orders only (they are the ones on the ledger). */
    delivered: { online: pick("ONLINE"), cod: pick("COD") },
    rates,
  };
}

export async function listLedger(storeId: string, query: LedgerListQuery) {
  const where: Prisma.SellerLedgerEntryWhereInput = {
    storeId,
    ...(query.bucket ? { bucket: query.bucket } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.sellerLedgerEntry.count({ where }),
    prisma.sellerLedgerEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const orderIds = [...new Set(rows.map((row) => row.orderId).filter((id): id is string => Boolean(id)))];
  const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } });
  const numbers = new Map(orders.map((o) => [o.id, o.orderNumber]));
  return {
    rows: rows.map((row) => ({ ...row, orderNumber: row.orderId ? (numbers.get(row.orderId) ?? null) : null })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** An admin's correction — a new entry with a reason, never an edit. */
export async function addAdjustment(storeId: string, input: AdjustmentInput, actor: PostActor) {
  const paise = amountToPaise(input.amount);
  if (paise === null || paise <= 0n) throw HttpError.badRequest("Enter a valid amount");
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw HttpError.notFound("Store not found");
  const signed = input.direction === "INCREASE" ? paise : -paise;
  const leg: Leg = {
    bucket: input.bucket,
    type: "ADJUSTMENT",
    amount: signed,
    key: `adjustment:${storeId}:${input.idempotencyKey}`,
    description: input.reason,
  };
  await prisma.$transaction((tx) => postLegs(tx, storeId, [leg], { actor }));
  return getStoreFinance(storeId);
}

// ---------------------------------------------------------------------------
// Seller view (store owner) — no admin emails, no hub internals
// ---------------------------------------------------------------------------

export async function getSellerEarnings(storeId: string, page: number, pageSize: number) {
  const [summary, ledger, payouts] = await Promise.all([
    getStoreFinance(storeId),
    listLedger(storeId, { page, pageSize }),
    prisma.orderPayout.findMany({
      where: { order: { storeId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        amount: true,
        duesDeducted: true,
        paidAt: true,
        paidAtTimeKnown: true,
        utr: true,
        method: true,
        createdAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
  ]);
  return {
    balance: summary.balance,
    delivered: summary.delivered,
    rates: summary.rates,
    ledger: {
      rows: ledger.rows.map(({ createdById: _a, createdByEmail: _b, meta: _c, idempotencyKey: _d, ...row }) => row),
      meta: ledger.meta,
    },
    payouts,
  };
}
