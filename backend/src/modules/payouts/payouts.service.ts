import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import {
  createPayout,
  HubApiError,
  paymentHubConfigured,
  paymentHubPayoutsEnabled,
  type CreatePayoutInput,
  type HubPayout,
} from "../payments/paymenthub.client.js";
import {
  ACTIVE_STATUSES,
  amountToPaise,
  canMove,
  decimalToPaise,
  hubPayoutStatus,
  IN_FLIGHT_STATUSES,
  indiaDateTime,
  last4,
  NEEDS_REASON,
  nextStatuses,
  paiseToAmount,
  payoutBlockers,
  payoutTotals,
  type PayoutStatus,
} from "./payouts.rules.js";
import type {
  AwaitingPayoutQuery,
  GatewayPayoutInput,
  ManualPayoutInput,
  PayoutListQuery,
  PayoutStatusInput,
} from "./payouts.schema.js";
import { notifySellerPayoutSent } from "./payouts.notifications.js";
import {
  getOrderFinancials,
  lockedBalances,
  postDeliveredOrder,
  syncPayoutLedger,
} from "../finance/finance.service.js";

/**
 * Seller payouts — the money UnieMax sends a seller for an online-paid order.
 *
 * Two ways to pay, one record (`OrderPayout`) and one history
 * (`OrderPayoutEvent`):
 *   MANUAL  — an admin transferred it from a bank account and records it.
 *   GATEWAY — an admin asks PaymentHub to send it; the hub's answer and its
 *             `payout.*` webhooks move the status.
 *
 * No accidental duplicates: every create locks the order row
 * (`SELECT … FOR UPDATE`) and refuses an amount above what is still unpaid
 * (order total − SUCCEEDED − PENDING/PROCESSING), and a repeated
 * idempotency key returns the payout it already made. At most one gateway
 * payout is in flight per order.
 *
 * Payout status is separate from the order's status and payment status — it
 * never changes the order.
 */

export interface PayoutActor {
  id: string;
  email: string;
}

/** The acting admin's email, snapshotted onto the record. */
export async function resolveActor(adminId: string): Promise<PayoutActor> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { email: true } });
  return { id: adminId, email: admin?.email ?? "(deleted admin)" };
}

const ORDER_FACTS = {
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  total: true,
  storeId: true,
  storeSlug: true,
  storeName: true,
  deliveredAt: true,
} satisfies Prisma.OrderSelect;

type OrderFacts = Prisma.OrderGetPayload<{ select: typeof ORDER_FACTS }>;
type Tx = Prisma.TransactionClient;

/** The store's payout target right now — primary account, masked. */
async function primaryAccount(db: Tx | typeof prisma, storeId: string | null) {
  if (!storeId) return null;
  const account = await db.storeBankAccount.findFirst({
    where: { storeId, isPrimary: true },
    select: {
      id: true,
      accountHolderName: true,
      bankName: true,
      ifsc: true,
      accountNumber: true,
      verificationStatus: true,
    },
  });
  if (!account) return null;
  const { accountNumber, ...rest } = account;
  return { ...rest, last4: last4(accountNumber) };
}

/** Locks the order row for the rest of the transaction — one writer at a time. */
async function lockOrder(tx: Tx, orderId: string): Promise<OrderFacts> {
  await tx.$queryRaw`SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: ORDER_FACTS });
  if (!order) throw HttpError.notFound("Order not found");
  return order;
}

/**
 * What has been paid against the order. The base is the seller's EARNING
 * (order total − platform fee …, modules/finance), not the order total.
 */
async function totalsFor(db: Tx | typeof prisma, order: OrderFacts) {
  const [rows, fin] = await Promise.all([
    db.orderPayout.findMany({
      where: { orderId: order.id },
      select: { status: true, amount: true, duesDeducted: true, method: true },
    }),
    getOrderFinancials(order.id, db),
  ]);
  return {
    rows,
    fin,
    totals: payoutTotals(
      fin.sellerEarningPaise,
      rows.map((row) => ({
        status: row.status,
        amountPaise: decimalToPaise(row.amount),
        duesPaise: decimalToPaise(row.duesDeducted),
      })),
    ),
  };
}

/**
 * The money sent + the COD dues settled must fit what is left on the
 * order; the dues can't exceed what the seller owes. A payout may send ₹0
 * only when it settles dues.
 */
function checkAmounts(amount: string, dues: string, remaining: bigint, owed: bigint) {
  const paise = amountToPaise(amount);
  const duesPaise = amountToPaise(dues);
  if (paise === null || duesPaise === null) throw HttpError.badRequest("Enter a valid amount");
  if (paise + duesPaise <= 0n) throw HttpError.badRequest("Enter an amount more than zero");
  if (duesPaise > owed) {
    throw HttpError.conflict(`The seller owes only ₹${paiseToAmount(owed)} in COD dues.`);
  }
  if (paise + duesPaise > remaining) {
    throw HttpError.conflict(
      remaining === 0n
        ? "This order is already fully paid out (or a payout is in progress)."
        : `Only ₹${paiseToAmount(remaining)} is left to pay on this order (amount + dues deducted).`,
    );
  }
  return { paise, duesPaise };
}

const payoutInclude = {
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderPayoutInclude;

type PayoutWithEvents = Prisma.OrderPayoutGetPayload<{ include: typeof payoutInclude }>;

/** The API shape — plus which statuses an admin may move it to. */
function shapePayout(payout: PayoutWithEvents) {
  return {
    ...payout,
    nextStatuses: payout.method === "MANUAL" ? nextStatuses("MANUAL", payout.status) : [],
    // A gateway payout the hub never acknowledged can be sent again (same key).
    canResend: payout.method === "GATEWAY" && payout.status === "PENDING" && !payout.hubPayoutId,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Dues first (up to what is left on the order), the rest as money sent. */
function suggestSplit(remaining: bigint, owed: bigint) {
  const dues = owed > 0n ? (owed < remaining ? owed : remaining) : 0n;
  return { duesDeducted: paiseToAmount(dues), amount: paiseToAmount(remaining - dues) };
}

/** The order page's Payout section: totals, who gets paid, what's allowed, history. */
export async function getOrderPayouts(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_FACTS });
  if (!order) throw HttpError.notFound("Order not found");

  const [{ totals, rows, fin }, payee, payouts, balance] = await Promise.all([
    totalsFor(prisma, order),
    primaryAccount(prisma, order.storeId),
    prisma.orderPayout.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      include: payoutInclude,
    }),
    order.storeId
      ? prisma.sellerBalance.findUnique({ where: { storeId: order.storeId }, select: { owed: true } })
      : null,
  ]);
  const { sellerEarningPaise: _, ...financials } = fin;

  const blockers = payoutBlockers(order);
  const gatewayInFlight = rows.some(
    (row) => row.method === "GATEWAY" && (IN_FLIGHT_STATUSES as readonly string[]).includes(row.status),
  );
  const gatewayBlocker = !paymentHubPayoutsEnabled
    ? paymentHubConfigured
      ? "Gateway payouts are not switched on yet — PaymentHub does not offer payouts yet."
      : "PaymentHub is not set up on this server."
    : !payee
      ? "The store has no primary bank account."
      : payee.verificationStatus !== "VERIFIED"
        ? "The store's bank account is not verified."
        : gatewayInFlight
          ? "A gateway payout is already in progress."
          : null;

  return {
    summary: {
      orderTotal: order.total.toFixed(2),
      platformFee: financials.platformFee,
      /** What the seller earns on this order — the payout base. */
      sellerEarning: paiseToAmount(totals.earning),
      paidOut: paiseToAmount(totals.paidOut),
      inProgress: paiseToAmount(totals.inProgress),
      duesDeducted: paiseToAmount(totals.duesDeducted),
      remaining: paiseToAmount(totals.remaining),
      /** The store's COD dues right now — can be taken from this payout. */
      storeDues: balance ? balance.owed.toFixed(2) : "0.00",
      /** The form's starting split: settle the dues first, send the rest. */
      suggested: suggestSplit(totals.remaining, balance ? decimalToPaise(balance.owed) : 0n),
      financials,
      /** Why no payout can be made at all — empty when one can. */
      blockers,
      canPay: blockers.length === 0 && totals.remaining > 0n,
      payee,
      gateway: { available: gatewayBlocker === null, reason: gatewayBlocker },
    },
    payouts: payouts.map(shapePayout),
  };
}

const listSelect = {
  id: true,
  method: true,
  status: true,
  amount: true,
  payeeName: true,
  payeeBank: true,
  payeeLast4: true,
  senderName: true,
  paidAt: true,
  paidAtTimeKnown: true,
  utr: true,
  gateway: true,
  hubPayoutId: true,
  failureReason: true,
  createdByEmail: true,
  createdAt: true,
  order: { select: { id: true, orderNumber: true, storeId: true, storeName: true, total: true } },
} satisfies Prisma.OrderPayoutSelect;

/** Every payout, newest first — the Payouts page's reconciliation view. */
export async function listPayouts(query: PayoutListQuery) {
  const where: Prisma.OrderPayoutWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.method) where.method = query.method;
  if (query.q) {
    where.OR = [
      { utr: { contains: query.q, mode: "insensitive" } },
      { senderName: { contains: query.q, mode: "insensitive" } },
      { hubPayoutId: { contains: query.q, mode: "insensitive" } },
      { order: { orderNumber: { contains: query.q, mode: "insensitive" } } },
      { order: { storeName: { contains: query.q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, byStatus] = await Promise.all([
    prisma.orderPayout.count({ where }),
    prisma.orderPayout.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
    prisma.orderPayout.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  return {
    rows,
    totals: Object.fromEntries(
      byStatus.map((row) => [
        row.status,
        { count: row._count._all, amount: row._sum.amount ?? new Prisma.Decimal(0) },
      ]),
    ),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/**
 * Orders that should be paid out and have no payout yet (none pending,
 * processing or done): online, paid, delivered. Oldest delivery first — the
 * seller who has waited longest is at the top. An order that was partly
 * paid out is not here; the Payouts list shows it.
 */
export async function listAwaitingPayout(query: AwaitingPayoutQuery) {
  const where: Prisma.OrderWhereInput = {
    paymentMethod: "ONLINE",
    paymentStatus: "PAID",
    status: "DELIVERED",
    payouts: { none: { status: { in: [...ACTIVE_STATUSES] } } },
  };
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: "insensitive" } },
      { storeName: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const [total, rows, sum] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ deliveredAt: "asc" }, { placedAt: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        orderNumber: true,
        storeId: true,
        storeName: true,
        total: true,
        placedAt: true,
        deliveredAt: true,
        _count: { select: { payouts: true } },
      },
    }),
    prisma.order.aggregate({ where, _sum: { total: true } }),
  ]);

  return {
    // Any payout here is failed / reversed / cancelled (none is active).
    rows: rows.map(({ _count, ...row }) => ({ ...row, pastAttempts: _count.payouts })),
    totalAmount: sum._sum.total ?? new Prisma.Decimal(0),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

async function loadPayout(payoutId: string) {
  const payout = await prisma.orderPayout.findUnique({ where: { id: payoutId }, include: payoutInclude });
  if (!payout) throw HttpError.notFound("Payout not found");
  return shapePayout(payout);
}

// ---------------------------------------------------------------------------
// Manual payouts
// ---------------------------------------------------------------------------

/** Record money an admin sent by hand. */
export async function recordManualPayout(
  orderId: string,
  input: ManualPayoutInput,
  actor: PayoutActor,
  log: FastifyBaseLogger,
) {
  let created = false;
  let paid: { at: Date; timeKnown: boolean };
  try {
    paid = indiaDateTime(input.paidOn, input.paidTime);
  } catch {
    throw HttpError.badRequest("Enter a real payment date");
  }
  // A few minutes of clock slack; a transfer can't be dated in the future.
  if (paid.at.getTime() > Date.now() + 10 * 60_000) {
    throw new HttpError(422, "The payment date and time can't be in the future");
  }

  // The order's own sale must be on the ledger before money is paid out of it.
  await postDeliveredOrder(orderId);

  const payoutId = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);

    const repeat = await tx.orderPayout.findUnique({
      where: { orderId_idempotencyKey: { orderId, idempotencyKey: input.idempotencyKey } },
      select: { id: true },
    });
    if (repeat) return repeat.id;

    const blockers = payoutBlockers(order);
    if (blockers.length > 0) throw HttpError.conflict(blockers[0]!);
    const { totals } = await totalsFor(tx, order);
    // Lock order: the order row (above), then the store's balance row.
    const owed = order.storeId ? (await lockedBalances(tx, order.storeId)).owed : 0n;
    const { paise, duesPaise } = checkAmounts(input.amount, input.duesDeducted, totals.remaining, owed > 0n ? owed : 0n);
    const payee = await primaryAccount(tx, order.storeId);

    const payout = await tx.orderPayout.create({
      data: {
        orderId,
        method: "MANUAL",
        status: input.status,
        amount: new Prisma.Decimal(paiseToAmount(paise)),
        duesDeducted: new Prisma.Decimal(paiseToAmount(duesPaise)),
        payeeAccountId: payee?.id ?? null,
        payeeName: payee?.accountHolderName ?? null,
        payeeBank: payee?.bankName ?? null,
        payeeIfsc: payee?.ifsc ?? null,
        payeeLast4: payee?.last4 ?? null,
        senderName: input.senderName,
        senderBank: input.senderBank ?? null,
        senderLast4: input.senderLast4 ?? null,
        paidAt: paid.at,
        paidAtTimeKnown: paid.timeKnown,
        utr: input.utr ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
        createdByEmail: actor.email,
        idempotencyKey: input.idempotencyKey,
        events: {
          create: {
            fromStatus: null,
            toStatus: input.status,
            source: "ADMIN",
            actorId: actor.id,
            actorEmail: actor.email,
            note: duesPaise > 0n ? `Manual payout recorded — ₹${paiseToAmount(duesPaise)} COD dues deducted` : "Manual payout recorded",
          },
        },
      },
      select: { id: true },
    });
    await syncPayoutLedger(tx, payout.id);
    created = true;
    return payout.id;
  });

  // Recorded as already sent → tell the seller (once: a repeat key never gets here).
  if (created && input.status === "SUCCEEDED") notifySellerPayoutSent(payoutId, log);
  return loadPayout(payoutId);
}

/** Move a MANUAL payout along. Gateway payouts move only through PaymentHub. */
export async function updateManualStatus(
  orderId: string,
  payoutId: string,
  input: PayoutStatusInput,
  actor: PayoutActor,
  log: FastifyBaseLogger,
) {
  const payout = await prisma.orderPayout.findFirst({
    where: { id: payoutId, orderId },
    select: { id: true, method: true, status: true, utr: true },
  });
  if (!payout) throw HttpError.notFound("Payout not found on this order");
  if (payout.method !== "MANUAL") {
    throw HttpError.conflict("A gateway payout's status is set by PaymentHub, not by hand.");
  }
  if (!canMove("MANUAL", payout.status, input.status)) {
    throw HttpError.conflict(`A ${payout.status.toLowerCase()} payout can't become ${input.status.toLowerCase()}.`);
  }
  if (NEEDS_REASON.includes(input.status) && !input.reason) {
    throw new HttpError(422, "Write the reason — it stays on the record for reconciliation.");
  }

  await prisma.$transaction(async (tx) => {
    // Guarded on the status we read: two admins can't both move it.
    const moved = await tx.orderPayout.updateMany({
      where: { id: payout.id, status: payout.status },
      data: {
        status: input.status,
        ...(input.utr && !payout.utr ? { utr: input.utr } : {}),
        ...(NEEDS_REASON.includes(input.status) ? { failureReason: input.reason ?? null } : {}),
      },
    });
    if (moved.count === 0) throw HttpError.conflict("Someone else changed this payout — reload and try again.");
    await tx.orderPayoutEvent.create({
      data: {
        payoutId: payout.id,
        fromStatus: payout.status,
        toStatus: input.status,
        source: "ADMIN",
        actorId: actor.id,
        actorEmail: actor.email,
        note: input.reason ?? (input.utr && !payout.utr ? `UTR ${input.utr}` : null),
      },
    });
    await syncPayoutLedger(tx, payout.id);
  });

  // This guarded update won the move to SUCCEEDED → tell the seller once.
  if (input.status === "SUCCEEDED") notifySellerPayoutSent(payout.id, log);
  return { from: payout.status, payout: await loadPayout(payout.id) };
}

// ---------------------------------------------------------------------------
// Gateway payouts (PaymentHub)
// ---------------------------------------------------------------------------

/** Create the payout row (PENDING), then ask the hub to send it. */
export async function triggerGatewayPayout(
  orderId: string,
  input: GatewayPayoutInput,
  actor: PayoutActor,
  log: FastifyBaseLogger,
) {
  if (!paymentHubPayoutsEnabled) {
    throw HttpError.conflict("Gateway payouts are not switched on yet. Record a manual payout instead.");
  }

  await postDeliveredOrder(orderId);

  const created = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);

    const repeat = await tx.orderPayout.findUnique({
      where: { orderId_idempotencyKey: { orderId, idempotencyKey: input.idempotencyKey } },
      select: { id: true },
    });
    if (repeat) return { id: repeat.id, isNew: false };

    const blockers = payoutBlockers(order);
    if (blockers.length > 0) throw HttpError.conflict(blockers[0]!);
    const payee = await primaryAccount(tx, order.storeId);
    if (!payee || !order.storeId) throw HttpError.conflict("The store has no primary bank account.");
    if (payee.verificationStatus !== "VERIFIED") {
      throw HttpError.conflict("The store's bank account must be verified before a gateway payout.");
    }
    const { rows, totals } = await totalsFor(tx, order);
    if (rows.some((row) => row.method === "GATEWAY" && (IN_FLIGHT_STATUSES as readonly string[]).includes(row.status))) {
      throw HttpError.conflict("A gateway payout for this order is already in progress.");
    }
    // Gateway payouts send money only; COD dues are deducted on manual ones.
    const { paise } = checkAmounts(input.amount, "0", totals.remaining, 0n);

    const payout = await tx.orderPayout.create({
      data: {
        orderId,
        method: "GATEWAY",
        status: "PENDING",
        amount: new Prisma.Decimal(paiseToAmount(paise)),
        payeeAccountId: payee.id,
        payeeName: payee.accountHolderName,
        payeeBank: payee.bankName,
        payeeIfsc: payee.ifsc,
        payeeLast4: payee.last4,
        createdById: actor.id,
        createdByEmail: actor.email,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true },
    });
    const hubRequest: CreatePayoutInput = {
      reference: payout.id,
      payeeRef: `store_${order.storeId}`,
      amountMinor: Number(paise),
      currency: "INR",
      metadata: { orderId: order.id, orderNumber: order.orderNumber, storeSlug: order.storeSlug },
    };
    await tx.orderPayout.update({
      where: { id: payout.id },
      data: {
        hubRequest: hubRequest as unknown as Prisma.InputJsonObject,
        events: {
          create: {
            fromStatus: null,
            toStatus: "PENDING",
            source: "ADMIN",
            actorId: actor.id,
            actorEmail: actor.email,
            note: "Gateway payout triggered",
          },
        },
      },
    });
    await syncPayoutLedger(tx, payout.id);
    return { id: payout.id, isNew: true };
  });

  if (created.isNew) await sendToHub(created.id, log);
  return loadPayout(created.id);
}

/** Send a PENDING gateway payout the hub never acknowledged again — same idempotency key. */
export async function resendGatewayPayout(orderId: string, payoutId: string, log: FastifyBaseLogger) {
  if (!paymentHubPayoutsEnabled) throw HttpError.conflict("Gateway payouts are not switched on.");
  const payout = await prisma.orderPayout.findFirst({
    where: { id: payoutId, orderId },
    select: { method: true, status: true, hubPayoutId: true },
  });
  if (!payout) throw HttpError.notFound("Payout not found on this order");
  if (payout.method !== "GATEWAY" || payout.status !== "PENDING" || payout.hubPayoutId) {
    throw HttpError.conflict("Only a gateway payout PaymentHub never answered can be sent again.");
  }
  await sendToHub(payoutId, log);
  return loadPayout(payoutId);
}

/**
 * Call the hub and store its answer. The idempotency key is the payout id,
 * so a resend can never make the hub pay twice.
 *   - hub answers → store its id and response, move to its status
 *   - hub refuses (4xx) → FAILED with the reason; no money moved
 *   - no answer (timeout / 5xx) → stays PENDING; the hub's webhook or a
 *     resend settles it
 */
async function sendToHub(payoutId: string, log: FastifyBaseLogger): Promise<void> {
  const payout = await prisma.orderPayout.findUniqueOrThrow({
    where: { id: payoutId },
    select: { id: true, status: true, hubRequest: true },
  });
  const request = payout.hubRequest as unknown as CreatePayoutInput;

  let response: HubPayout;
  try {
    response = await createPayout(request, payout.id);
  } catch (error) {
    const definitive = error instanceof HubApiError && error.hubStatus >= 400 && error.hubStatus < 500;
    const detail =
      error instanceof HubApiError
        ? { status: error.hubStatus, code: error.hubCode, message: error.message }
        : { message: error instanceof Error ? error.message : String(error) };
    log.error({ payoutId, err: error }, "PaymentHub payout request failed");
    await prisma.$transaction(async (tx) => {
      const moved = definitive
        ? await tx.orderPayout.updateMany({
            where: { id: payout.id, status: "PENDING" },
            data: {
              status: "FAILED",
              failureReason: `PaymentHub refused: ${detail.message}`,
              hubResponse: { error: detail },
            },
          })
        : await tx.orderPayout.updateMany({
            where: { id: payout.id },
            data: { hubResponse: { error: detail } },
          });
      if (moved.count === 0) return;
      await tx.orderPayoutEvent.create({
        data: {
          payoutId: payout.id,
          fromStatus: "PENDING",
          toStatus: definitive ? "FAILED" : "PENDING",
          source: "HUB_RESPONSE",
          note: definitive
            ? "PaymentHub refused the payout — no money moved"
            : "PaymentHub did not answer — send it again, or wait for its webhook",
          payload: { error: detail },
        },
      });
      await syncPayoutLedger(tx, payout.id);
    });
    return;
  }

  await applyHubPayout(response, { source: "HUB_RESPONSE", payload: response as unknown as Prisma.InputJsonObject }, log);
}

// ---------------------------------------------------------------------------
// Hub answers and webhooks — one forward-only path
// ---------------------------------------------------------------------------

export type HubPayoutOutcome = "applied" | "unchanged" | "unknown" | "mismatch";

/**
 * Apply a hub payout object (from its API answer or a webhook) to our row.
 * Finds the row by hub id, then by `reference` (our id). Status moves only
 * forward (GATEWAY moves in payouts.rules.ts); identifiers and the latest
 * response are stored either way.
 */
export async function applyHubPayout(
  hub: HubPayout,
  origin: { source: "HUB_RESPONSE" | "HUB_WEBHOOK"; hubEventId?: string; payload: Prisma.InputJsonObject },
  log: FastifyBaseLogger,
): Promise<HubPayoutOutcome> {
  const payout =
    (await prisma.orderPayout.findUnique({ where: { hubPayoutId: hub.id } })) ??
    (await prisma.orderPayout.findUnique({ where: { id: hub.reference } }));
  if (!payout || payout.method !== "GATEWAY") {
    log.error({ hubPayoutId: hub.id, reference: hub.reference }, "PaymentHub payout: no gateway payout matches");
    return "unknown";
  }
  if (BigInt(hub.amountMinor) !== decimalToPaise(payout.amount)) {
    // Money for a different amount is never marked as paid silently.
    log.error(
      { payoutId: payout.id, hubAmount: hub.amountMinor, amount: payout.amount.toFixed(2) },
      "PaymentHub payout: amount mismatch — not applied",
    );
    return "mismatch";
  }

  const target = hubPayoutStatus(hub.status);
  const moves = target !== null && target !== payout.status && canMove("GATEWAY", payout.status, target);
  const to: PayoutStatus = moves ? target : payout.status;

  const facts = {
    hubPayoutId: payout.hubPayoutId ?? hub.id,
    ...(hub.gateway ? { gateway: hub.gateway } : {}),
    ...(hub.gatewayRef ? { gatewayRef: hub.gatewayRef } : {}),
    ...(hub.utr ? { utr: hub.utr } : {}),
    ...(origin.source === "HUB_RESPONSE" ? { hubResponse: origin.payload } : {}),
  };

  await prisma.$transaction(async (tx) => {
    const updated = await tx.orderPayout.updateMany({
      where: { id: payout.id, status: payout.status },
      data: {
        ...facts,
        status: to,
        ...(moves && to === "SUCCEEDED" ? { paidAt: new Date(), paidAtTimeKnown: true } : {}),
        ...(moves && (to === "FAILED" || to === "REVERSED")
          ? { failureReason: hub.failureReason ?? (to === "REVERSED" ? "Reversed by the bank" : "Failed at the gateway") }
          : {}),
      },
    });
    // Lost a race with another delivery: throw so the webhook is retried
    // (or the API answer re-read) against the new status.
    if (updated.count === 0) throw new Error(`Payout ${payout.id} changed while applying a hub update`);
    await tx.orderPayoutEvent.create({
      data: {
        payoutId: payout.id,
        fromStatus: payout.status,
        toStatus: to,
        source: origin.source,
        hubEventId: origin.hubEventId ?? null,
        note: moves ? null : `PaymentHub says ${hub.status} — no status change`,
        payload: origin.payload,
      },
    });
    await syncPayoutLedger(tx, payout.id);
  });

  log.info({ payoutId: payout.id, from: payout.status, to, source: origin.source }, "PaymentHub payout update");
  if (moves && to === "SUCCEEDED") notifySellerPayoutSent(payout.id, log);
  return moves ? "applied" : "unchanged";
}
