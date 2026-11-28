import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { decimalToPaise, indiaDateTime } from "../payouts/payouts.rules.js";
import { SELLER_VISIBLE } from "../orders/orders.service.js";
import { versionsByIds } from "../../package/policy/index.js";
import {
  bpToPercent,
  computeFinancials,
  nextAdvanceOutcome,
  orderLegs,
  paiseToAmount,
  payoutLegs,
  percentToBp,
  resolveRule,
  settlementStatus,
  amountToPaise,
  sellerHoldsMoney,
  type Method,
  type ComputedFinancials,
  type Leg,
} from "./finance.rules.js";
import { lockBalance, postLegs, type PostActor } from "./ledger.service.js";
import type {
  AdjustmentInput,
  BalanceListQuery,
  FeeRuleCreateInput,
  LedgerListQuery,
  TransactionListQuery,
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
  const ctx = (method: Method) => ({ storeId, categoryId: null, method, at: now });
  const platform = resolveRule(rules, "PLATFORM", ctx("ONLINE"));
  const platformCod = resolveRule(rules, "PLATFORM", ctx("COD"));
  const platformOffline = resolveRule(rules, "PLATFORM", ctx("OFFLINE"));
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
    /** Bills paid to the seller directly — `platform` until an OFFLINE rule exists. */
    platformOffline: show(platformOffline),
    gateway: show(gateway),
    upcoming: upcoming.map((rule) => ({
      kind: rule.kind,
      paymentMethod: rule.paymentMethod,
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
      // A platform fee for one payment method only (e.g. OFFLINE bills).
      paymentMethod: input.kind === "PLATFORM" ? (input.paymentMethod ?? null) : null,
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
  items: { select: { id: true, lineTotal: true, fulfilledBy: true } },
} satisfies Prisma.OrderSelect;

type OrderForFin = Prisma.OrderGetPayload<{ select: typeof ORDER_FOR_FIN }>;

const method = (order: { paymentMethod: string }): Method =>
  order.paymentMethod === "COD" ? "COD" : order.paymentMethod === "OFFLINE" ? "OFFLINE" : "ONLINE";

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
    // Advances paid before delivery now come out of this earning.
    await syncOrderAdvances(tx, orderId);
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
      isAdvance: true,
      advanceOutcome: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          storeId: true,
          status: true,
          paymentStatus: true,
          financials: { select: { postedAt: true } },
        },
      },
      events: { where: { toStatus: "SUCCEEDED" }, select: { id: true }, take: 1 },
    },
  });
  if (!payout) return;
  // An advance is cleared once its order ends (delivered, or cancelled /
  // refunded) — decided here, once, and kept on the row.
  const advanceOutcome = payout.isAdvance
    ? nextAdvanceOutcome(payout.advanceOutcome, payout.status, {
        posted: Boolean(payout.order.financials?.postedAt),
        ended: advanceOrderEnded(payout.order),
      })
    : null;
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
      isAdvance: payout.isAdvance,
      advanceOutcome,
    });
    await postLegs(tx, payout.order.storeId, legs);
  }
  await tx.orderPayout.update({
    where: { id: payout.id },
    data: { ledgerStatus: payout.status, ...(advanceOutcome !== payout.advanceOutcome ? { advanceOutcome } : {}) },
  });
}

/** The advanced order ended without delivery: the customer gets (or got) the money back. */
function advanceOrderEnded(order: { status: string; paymentStatus: string }): boolean {
  return order.status === "CANCELLED" || order.paymentStatus === "REFUNDED";
}

/** Bring every advance on one order in line (inside the caller's transaction). */
async function syncOrderAdvances(tx: Tx, orderId: string): Promise<void> {
  const advances = await tx.orderPayout.findMany({
    where: { orderId, isAdvance: true, advanceOutcome: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const { id } of advances) await syncPayoutLedger(tx, id);
}

/**
 * The order was cancelled or refunded: any advance on it becomes the
 * seller's dues. Called from the order-status event; the sweep catches the
 * rest (refunds included). Idempotent.
 */
export async function resolveOrderAdvances(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Order row first, then the balance row — the lock order used everywhere.
    await tx.$queryRaw`SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    await syncOrderAdvances(tx, orderId);
  });
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
  // Advances whose order has ended (delivered + posted, cancelled or
  // refunded) but that are not cleared yet — a missed event.
  const openAdvances = await prisma.orderPayout.findMany({
    where: {
      isAdvance: true,
      advanceOutcome: null,
      status: { in: ["PENDING", "PROCESSING", "SUCCEEDED"] },
      order: {
        OR: [{ status: "CANCELLED" }, { paymentStatus: "REFUNDED" }, { financials: { postedAt: { not: null } } }],
      },
    },
    take: SWEEP_BATCH,
    select: { orderId: true },
  });
  for (const orderId of new Set(openAdvances.map((row) => row.orderId))) {
    try {
      await resolveOrderAdvances(orderId);
      syncedPayouts += 1;
    } catch (err) {
      log.error({ err, orderId }, "finance sweep: advance clearing failed");
    }
  }
  return { orders: postedOrders, payouts: syncedPayouts };
}

// ---------------------------------------------------------------------------
// Admin reads + adjustments
// ---------------------------------------------------------------------------

const money = (value: Prisma.Decimal) => value.toFixed(2);

function shapeBalance(
  row: { payable: Prisma.Decimal; inPayout: Prisma.Decimal; owed: Prisma.Decimal; advance: Prisma.Decimal; updatedAt: Date } | null,
) {
  if (!row) return { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: "0.00", net: "0.00", updatedAt: null };
  const net = decimalToPaise(row.payable) - decimalToPaise(row.owed);
  return {
    payable: money(row.payable),
    inPayout: money(row.inPayout),
    owed: money(row.owed),
    /** Paid ahead on orders not delivered yet — not part of `net`. */
    advance: money(row.advance),
    net: paiseToAmount(net),
    updatedAt: row.updatedAt,
  };
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
    ...(query.filter === "ADVANCE" ? { advance: { gt: 0 } } : {}),
  };
  const [total, rows, sums] = await Promise.all([
    prisma.sellerBalance.count({ where }),
    prisma.sellerBalance.findMany({
      where,
      orderBy: [{ payable: "desc" }, { owed: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.sellerBalance.aggregate({ where, _sum: { payable: true, inPayout: true, owed: true, advance: true } }),
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
      advance: money(sums._sum.advance ?? new Prisma.Decimal(0)),
    },
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** One store's money: balances, fee totals, rates. */
export async function getStoreFinance(storeId: string) {
  const [store, balance, fees, rates] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, advancePayoutsAllowed: true } }),
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
  // "cod" = every sale the seller holds the money for (COD + OFFLINE bills).
  const pick = (m: "ONLINE" | "COD") => {
    const rows = fees.filter((f) => (m === "COD") === sellerHoldsMoney(f.paymentMethod ?? ""));
    const sum = (k: "orderTotal" | "platformFee" | "gatewayFee") =>
      rows.reduce((acc, r) => acc.add(r._sum[k] ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    return {
      orders: rows.reduce((acc, r) => acc + r._count._all, 0),
      sales: money(sum("orderTotal")),
      platformFees: money(sum("platformFee")),
      gatewayFees: money(sum("gatewayFee")),
    };
  };
  return {
    store: store ? { id: store.id, name: store.name, slug: store.slug } : { id: storeId, name: "(deleted store)", slug: null },
    /** UnieMax may pay this seller before delivery (§9). */
    advancePayoutsAllowed: store?.advancePayoutsAllowed ?? false,
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

/**
 * Let (or stop) UnieMax paying this seller before delivery. Turning it off
 * stops new advances only — ones already paid stay and clear as normal.
 */
export async function setAdvancePayouts(storeId: string, allowed: boolean) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { advancePayoutsAllowed: true } });
  if (!store) throw HttpError.notFound("Store not found");
  const changed = store.advancePayoutsAllowed !== allowed;
  if (changed) await prisma.store.update({ where: { id: storeId }, data: { advancePayoutsAllowed: allowed } });
  return { storeId, advancePayoutsAllowed: allowed, changed };
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
        isAdvance: true,
        createdAt: true,
        policyVersionId: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
  ]);
  // "Paid under Payout Policy vN" (docs/policyhub §10). Display only — a
  // PolicyHub failure shows no version rather than failing the page.
  const versions = await versionsByIds(
    payouts.flatMap((p) => (p.policyVersionId ? [p.policyVersionId] : [])),
  ).catch(() => new Map<string, { version: number; effectiveFrom: Date }>());
  return {
    balance: summary.balance,
    delivered: summary.delivered,
    rates: summary.rates,
    ledger: {
      rows: ledger.rows.map(({ createdById: _a, createdByEmail: _b, meta: _c, idempotencyKey: _d, ...row }) => row),
      meta: ledger.meta,
    },
    payouts: payouts.map(({ policyVersionId, ...p }) => ({
      ...p,
      policyVersion: (policyVersionId && versions.get(policyVersionId)) || null,
    })),
  };
}

const TRANSACTION_SELECT = {
  ...ORDER_FOR_FIN,
  customerName: true,
  deliveredAt: true,
  financials: true,
  payouts: {
    select: { status: true, amount: true, duesDeducted: true, paidAt: true, paidAtTimeKnown: true, utr: true, createdAt: true, isAdvance: true },
    orderBy: { createdAt: "asc" },
  },
  fulfilment: true,
  refunds: { select: { status: true, amount: true } },
} satisfies Prisma.OrderSelect;

type OrderForTransaction = Prisma.OrderGetPayload<{ select: typeof TRANSACTION_SELECT }>;

/** One order's Transactions row — the list and the order page's Money card share it. */
function shapeTransaction(order: OrderForTransaction, rules: Awaited<ReturnType<typeof loadRules>>) {
  const { financials, payouts, refunds, customerName, deliveredAt, fulfilment, ...forFin } = order;
  const fin = financials
    ? fromSnapshot(financials)
    : computeFinancials(
        {
          storeId: forFin.storeId,
          method: method(forFin),
          placedAt: forFin.placedAt,
          totalPaise: decimalToPaise(forFin.total),
          shippingPaise: decimalToPaise(forFin.shippingCharge),
          lines: forFin.items.map((item) => ({ orderItemId: item.id, lineTotalPaise: decimalToPaise(item.lineTotal), categoryId: null })),
        },
        rules,
      );
  const settlement = settlementStatus({
    method: method(forFin),
    status: forFin.status,
    paymentStatus: forFin.paymentStatus,
    earningPaise: fin.sellerEarningPaise,
    payouts: payouts.map((p) => ({
      status: p.status,
      amountPaise: decimalToPaise(p.amount),
      duesPaise: decimalToPaise(p.duesDeducted),
      createdAt: p.createdAt,
    })),
    refunds,
  });
  const lastPaid = [...payouts].reverse().find((p) => p.status === "SUCCEEDED") ?? null;
  // Paid (or on its way) before delivery. On an order that ended without
  // delivery this is what the seller owes back.
  const advancePaise = payouts
    .filter((p) => p.isAdvance && (p.status === "SUCCEEDED" || p.status === "PENDING" || p.status === "PROCESSING"))
    .reduce((acc, p) => acc + decimalToPaise(p.amount), 0n);
  const refundedPaise = refunds
    .filter((r) => r.status === "SUCCEEDED")
    .reduce((acc, r) => acc + decimalToPaise(r.amount), 0n);
  return {
    id: forFin.id,
    orderNumber: forFin.orderNumber,
    placedAt: forFin.placedAt,
    deliveredAt,
    customerName,
    orderStatus: forFin.status,
    /** DELIVERY · PICKUP (the customer collects — wording changes). */
    fulfilment,
    /**
     * Another party (a supplier) ships lines of this order (`OrderItem.fulfilledBy`).
     * On COD their courier collects the cash, not the seller; the seller's share is
     * settled with that party (docs/dropshipping/money).
     */
    shippedByOthers: forFin.items.some((item) => item.fulfilledBy !== null),
    /** Money sent back to the customer (SUCCEEDED refunds), part or full. */
    refundedAmount: paiseToAmount(refundedPaise),
    /** COD · ONLINE (legacy rows may hold UPI / CARD / NETBANKING / RAZORPAY). */
    paymentMethod: forFin.paymentMethod,
    paymentStatus: forFin.paymentStatus,
    billAmount: forFin.total.toFixed(2),
    platformFee: paiseToAmount(fin.platformFeePaise),
    gatewayFee: paiseToAmount(fin.gatewayFeePaise),
    gatewayFeeBearer: fin.gatewayFeeBearer,
    youGet: paiseToAmount(fin.sellerEarningPaise),
    settlement: {
      status: settlement.status,
      paidOut: paiseToAmount(settlement.totals.paidOut),
      onItsWay: paiseToAmount(settlement.totals.inProgress),
      duesDeducted: paiseToAmount(settlement.totals.duesDeducted),
      remaining: paiseToAmount(settlement.totals.remaining),
      lastPayoutFailed: settlement.lastPayoutFailed,
      /** Paid before delivery (part of paidOut / onItsWay). */
      advance: paiseToAmount(advancePaise),
      paidAt: lastPaid?.paidAt ?? null,
      paidAtTimeKnown: lastPaid?.paidAtTimeKnown ?? false,
      utr: lastPaid?.utr ?? null,
    },
  };
}

/** One order's Transactions row — the order page's Money card. 404 like the order itself. */
export async function getSellerTransaction(storeId: string, orderId: string) {
  const [order, rules] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, storeId, ...SELLER_VISIBLE }, select: TRANSACTION_SELECT }),
    loadRules(prisma),
  ]);
  if (!order) throw HttpError.notFound("Order not found");
  return shapeTransaction(order, rules);
}

/**
 * Transactions — one row per order (the seller's "bill book"): what the
 * customer paid, how, and whether the seller has the money yet
 * (`settlementStatus`). Earnings is the same money seen as balances and
 * ledger entries; this is the per-order view. Same orders as the seller's
 * order list (SELLER_VISIBLE), newest first.
 */
export async function getSellerTransactions(storeId: string, query: TransactionListQuery) {
  const placedAt =
    query.from || query.to
      ? {
          ...(query.from ? { gte: indiaDateTime(query.from).at } : {}),
          // The whole `to` day counts: before midnight that ends it.
          ...(query.to ? { lt: new Date(indiaDateTime(query.to).at.getTime() + 24 * 60 * 60 * 1000) } : {}),
        }
      : undefined;
  // Sellers often type "#48203917" — the order number itself has no "#".
  const q = query.q?.replace(/^#+/, "").trim() || null;
  const where: Prisma.OrderWhereInput = {
    storeId,
    ...SELLER_VISIBLE,
    ...(placedAt ? { placedAt } : {}),
    // "Cash" = the seller holds the money: COD and OFFLINE (paid on a bill).
    ...(query.mode === "COD" ? { paymentMethod: { in: ["COD", "OFFLINE"] } } : {}),
    ...(query.mode === "ONLINE" ? { paymentMethod: { notIn: ["COD", "OFFLINE"] } } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, orders, billed, payoutSums, rules] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: TRANSACTION_SELECT,
    }),
    // Billed = every order in range except cancelled ones.
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { AND: [where, { status: { not: "CANCELLED" } }] },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.orderPayout.groupBy({
      by: ["status"],
      where: { order: where, status: { in: ["SUCCEEDED", "PENDING", "PROCESSING"] } },
      _sum: { amount: true },
    }),
    loadRules(prisma),
  ]);

  const sumPayouts = (statuses: string[]) =>
    paiseToAmount(
      payoutSums
        .filter((row) => statuses.includes(row.status))
        .reduce((acc, row) => acc + decimalToPaise(row._sum.amount ?? new Prisma.Decimal(0)), 0n),
    );
  const sumBilled = (cod: boolean) => {
    const rows = billed.filter((row) => sellerHoldsMoney(row.paymentMethod) === cod);
    return {
      orders: rows.reduce((acc, row) => acc + row._count._all, 0),
      paise: rows.reduce((acc, row) => acc + decimalToPaise(row._sum.total ?? new Prisma.Decimal(0)), 0n),
    };
  };
  const online = sumBilled(false);
  const cod = sumBilled(true);
  const shapeBilled = (b: { orders: number; paise: bigint }) => ({ orders: b.orders, amount: paiseToAmount(b.paise) });

  const rows = orders.map((order) => shapeTransaction(order, rules));

  return {
    summary: {
      billed: shapeBilled({ orders: online.orders + cod.orders, paise: online.paise + cod.paise }),
      online: shapeBilled(online),
      cod: shapeBilled(cod),
      /** Payouts on these orders: SUCCEEDED · PENDING + PROCESSING. */
      paidToYou: sumPayouts(["SUCCEEDED"]),
      onItsWay: sumPayouts(["PENDING", "PROCESSING"]),
    },
    rows,
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}
