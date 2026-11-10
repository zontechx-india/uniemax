import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { publicWebUrl, sendMail } from "../../package/mail/index.js";
import { HttpError } from "../../utils/httpError.js";
import { notify, notifyAdmins } from "../notifications/notifications.service.js";
import { escapeHtml } from "../orders/couriers.js";
import {
  createRefund,
  getIntent,
  getRefund,
  HubApiError,
  listIntentsByReference,
  paymentHubConfigured,
} from "./paymenthub.client.js";
import { rupeesToPaise } from "./paymenthub.webhook.js";
import {
  afterFailedAttempt,
  coversOrder,
  isPermanentHubRefusal,
  pickIntentToRefund,
  refundStatusFromHub,
} from "./refunds.rules.js";

/**
 * Refunds to the customer, through PaymentHub.
 *
 *   queueRefund()      a PENDING row, written in the SAME transaction that
 *                      cancels a paid order — so a refund is never forgotten,
 *                      even if the server stops right after the cancel.
 *   sendRefund()       asks the hub (idempotency key = the row id, so a retry
 *                      can never refund twice).
 *   applyHubRefund()   the hub's `refund.succeeded` / `refund.failed` webhook
 *                      settles the row. A refund an operator made by hand in
 *                      the hub dashboard is recorded the same way.
 *   retryRefunds()     the payments job: rows not sent yet are sent again;
 *                      rows waiting too long are read back from the hub.
 *
 * A refund that can't be made (not paid through the hub, the hub keeps
 * refusing) becomes FAILED and every admin is told — a person then refunds it
 * from the hub (or Cashfree) dashboard.
 */

const log = (what: string) => (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`Refund ${what} failed:`, err);
};

const rupees = (amount: { toFixed(digits: number): string }) =>
  `₹${Number(amount.toFixed(2)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Queue a full refund for a paid ONLINE order. Returns the row id, or null
 * when there is no real payment to send back (cash on delivery, the dev
 * simulation). Call `sendRefundSoon(id)` once the transaction committed.
 */
export async function queueRefund(
  db: Prisma.TransactionClient,
  orderId: string,
  reason: string | null,
): Promise<string | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { paymentMethod: true, paymentRef: true, total: true },
  });
  if (!order || order.paymentMethod !== "ONLINE" || order.paymentRef === "DEV-SIMULATED") {
    return null;
  }
  const row = await db.orderRefund.create({
    data: { orderId, amount: order.total, reason: reason?.slice(0, 200) ?? null },
    select: { id: true },
  });
  return row.id;
}

/** Fire-and-forget send — the job retries whatever this leaves behind. */
export function sendRefundSoon(refundId: string): void {
  void sendRefund(refundId).catch(log("send"));
}

const REFUND_SELECT = {
  id: true,
  status: true,
  amount: true,
  reason: true,
  intentId: true,
  hubRefundId: true,
  attempts: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      storeName: true,
      storeSlug: true,
      total: true,
      paymentIntentId: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
    },
  },
} satisfies Prisma.OrderRefundSelect;

type RefundRow = Prisma.OrderRefundGetPayload<{ select: typeof REFUND_SELECT }>;

/** Ask the hub to send the money back. Safe to call again and again. */
export async function sendRefund(refundId: string): Promise<void> {
  const row = await prisma.orderRefund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
  if (!row || row.status !== "PENDING" || row.hubRefundId) return;

  if (!paymentHubConfigured || !row.order.paymentIntentId) {
    await fail(row, "This order was not paid through PaymentHub — refund it by hand from the Cashfree dashboard");
    return;
  }

  const amountMinor = rupeesToPaise(row.amount);
  if (amountMinor === null || amountMinor <= 0n) {
    await fail(row, `Not a refundable amount: ${row.amount.toFixed(2)}`);
    return;
  }

  try {
    // The payment usually sits on the order's latest intent; one paid late on
    // an older intent is found by the order number.
    let intentId = row.intentId;
    if (!intentId) {
      const latest = await getIntent(row.order.paymentIntentId);
      let choice = pickIntentToRefund([latest], latest.id);
      if (choice.kind === "none") {
        choice = pickIntentToRefund(await listIntentsByReference(row.order.orderNumber), latest.id);
      }
      if (choice.kind === "alreadyRefunded") {
        await prisma.orderRefund.update({ where: { id: row.id }, data: { intentId: choice.intentId } });
        await settle(row.id, "SUCCEEDED", {});
        return;
      }
      if (choice.kind === "none") {
        await retryLater(row, "PaymentHub shows no completed payment for this order yet", false);
        return;
      }
      intentId = choice.intentId;
      // Saved BEFORE the call: the hub's webhook can arrive before its answer.
      await prisma.orderRefund.update({ where: { id: row.id }, data: { intentId } });
    }

    const refund = await createRefund(
      intentId,
      { amountMinor: Number(amountMinor), ...(row.reason ? { reason: row.reason } : {}) },
      `refund:${row.id}`,
    );
    await prisma.orderRefund.updateMany({
      where: { id: row.id, hubRefundId: null },
      data: {
        hubRefundId: refund.id,
        gatewayRefundId: refund.gatewayRefundId ?? null,
        requestedAt: new Date(),
        attempts: { increment: 1 },
        failureReason: null,
      },
    });
    const status = refundStatusFromHub(refund.status);
    if (status !== "PENDING") await settle(row.id, status, { reason: "The gateway refused the refund" });
  } catch (err) {
    const permanent = err instanceof HubApiError && isPermanentHubRefusal(err.hubStatus);
    await retryLater(row, err instanceof Error ? err.message : "PaymentHub call failed", permanent);
  }
}

/** A hub call didn't work: count it, and give up when a retry can't help. */
async function retryLater(row: RefundRow, reason: string, permanent: boolean): Promise<void> {
  const next = afterFailedAttempt(row.attempts, permanent);
  if (next.giveUp) {
    await fail(row, reason, next.attempts);
    return;
  }
  await prisma.orderRefund.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { attempts: next.attempts, failureReason: reason.slice(0, 300) },
  });
}

/** PENDING → FAILED, once — and every admin is told to refund it by hand. */
async function fail(row: RefundRow, reason: string, attempts = row.attempts): Promise<void> {
  const updated = await prisma.orderRefund.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "FAILED", failureReason: reason.slice(0, 300), attempts },
  });
  if (updated.count === 0) return;
  notifyAdmins({
    kind: "PAYMENT",
    title: `Refund needs you — order ${row.order.orderNumber}`,
    body: `${rupees(row.amount)} could not be refunded automatically (${reason}). Refund it by hand.`,
    url: `/orders/${row.order.id}`,
    data: { orderId: row.order.id, refundId: row.id },
  });
}

/**
 * Settle a refund. SUCCEEDED wins over everything (a refund that failed and
 * was then made by hand ends SUCCEEDED); FAILED only ends a pending one.
 * Returns whether this call changed the row.
 */
async function settle(
  refundId: string,
  status: "SUCCEEDED" | "FAILED",
  extra: { reason?: string; gatewayRefundId?: string | null },
): Promise<boolean> {
  if (status === "FAILED") {
    const row = await prisma.orderRefund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
    if (!row || row.status !== "PENDING") return false;
    await fail(row, extra.reason ?? "The refund failed at the gateway");
    return true;
  }

  const updated = await prisma.orderRefund.updateMany({
    where: { id: refundId, status: { not: "SUCCEEDED" } },
    data: {
      status: "SUCCEEDED",
      processedAt: new Date(),
      failureReason: null,
      ...(extra.gatewayRefundId ? { gatewayRefundId: extra.gatewayRefundId } : {}),
    },
  });
  if (updated.count === 0) return false;

  const row = await prisma.orderRefund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
  if (!row) return true;
  const refunded = rupeesToPaise(row.amount);
  const total = rupeesToPaise(row.order.total);
  if (refunded !== null && total !== null && coversOrder(refunded, total)) {
    // A payment that landed on an already-cancelled order is still PAID.
    await prisma.order.updateMany({
      where: { id: row.order.id, paymentStatus: "PAID" },
      data: { paymentStatus: "REFUNDED" },
    });
  }
  tellCustomerRefunded(row);
  return true;
}

/** Push + email: the money is on its way back. */
function tellCustomerRefunded(row: RefundRow): void {
  const { order } = row;
  const line = `Your refund of ${rupees(row.amount)} for order ${order.orderNumber} at ${order.storeName} has been sent. It usually reaches your account within 5–7 working days.`;
  if (order.customerId) {
    notify({
      principalType: "CUSTOMER",
      principalId: order.customerId,
      kind: "PAYMENT",
      title: `Refund sent — order ${order.orderNumber}`,
      body: line,
      url: `/order/${order.storeSlug}/${order.id}`,
      data: { orderId: order.id },
    });
  }
  void (async () => {
    let to = order.customerEmail;
    if (!to && order.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: order.customerId },
        select: { email: true },
      });
      to = customer?.email ?? null;
    }
    if (!to) return;
    const orderUrl = publicWebUrl ? `${publicWebUrl}/order/${order.storeSlug}/${order.id}` : null;
    await sendMail({
      to,
      subject: `Refund sent for order ${order.orderNumber}`,
      text: `Hi${order.customerName ? ` ${order.customerName}` : ""},\n\n${line}${orderUrl ? `\n\nView your order: ${orderUrl}` : ""}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px;font-size:18px;color:#111">Your refund has been sent</h2>
        <p style="margin:0;font-size:14px;color:#444">${escapeHtml(line)}</p>
        ${orderUrl ? `<p style="margin:16px 0 0"><a href="${orderUrl}" style="font-size:14px;color:#6c3ef4">View your order</a></p>` : ""}
      </div>`,
    });
  })().catch(log("customer email"));
}

/**
 * An admin starts a FAILED refund again (the admin order page). The failed
 * row stays as history; a NEW row is made and sent now, with its own
 * idempotency key. Refused while another refund of the order is on its way
 * or already went through — the hub also never pays back more than was paid.
 */
export async function retryFailedRefund(orderId: string, refundId: string) {
  const failed = await prisma.orderRefund.findFirst({
    where: { id: refundId, orderId },
    select: { status: true, amount: true, reason: true },
  });
  if (!failed) throw HttpError.notFound("Refund not found");
  if (failed.status !== "FAILED") {
    throw HttpError.conflict("Only a failed refund can be started again");
  }
  const other = await prisma.orderRefund.count({
    where: { orderId, status: { in: ["PENDING", "SUCCEEDED"] } },
  });
  if (other > 0) {
    throw HttpError.conflict("This order already has a refund that is on its way or sent");
  }
  const created = await prisma.orderRefund.create({
    data: { orderId, amount: failed.amount, reason: failed.reason },
    select: { id: true },
  });
  await sendRefund(created.id);
  return prisma.orderRefund.findUniqueOrThrow({
    where: { id: created.id },
    select: { id: true, status: true, amount: true, failureReason: true, hubRefundId: true },
  });
}

// ---------------------------------------------------------------------------
// Hub webhook
// ---------------------------------------------------------------------------

export interface HubRefundEvent {
  id: string;
  intentId: string;
  reference: string;
  amountMinor: number;
  status: string;
}

export type RefundEventResult = "applied" | "ignored" | "unknown";

/**
 * `refund.succeeded` / `refund.failed`. Finds our row by the hub's refund id,
 * else the row we were just sending for that intent (the webhook can beat the
 * hub's own answer). A successful refund with no row of ours was made by hand
 * in the hub dashboard: it is recorded so the order tells the truth.
 */
export async function applyHubRefund(refund: HubRefundEvent): Promise<RefundEventResult> {
  const status = refundStatusFromHub(refund.status);
  if (status === "PENDING") return "ignored";

  let row = await prisma.orderRefund.findUnique({
    where: { hubRefundId: refund.id },
    select: { id: true },
  });
  if (!row) {
    const waiting = await prisma.orderRefund.findFirst({
      where: { intentId: refund.intentId, hubRefundId: null, status: { not: "SUCCEEDED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (waiting) {
      await prisma.orderRefund.updateMany({
        where: { id: waiting.id, hubRefundId: null },
        data: { hubRefundId: refund.id, requestedAt: new Date() },
      });
      row = waiting;
    }
  }
  if (row) {
    const changed = await settle(row.id, status, {});
    return changed ? "applied" : "ignored";
  }

  const order = await prisma.order.findFirst({
    where: { OR: [{ paymentIntentId: refund.intentId }, { orderNumber: refund.reference }] },
    select: { id: true },
  });
  if (!order) return "unknown";
  if (status === "FAILED") return "ignored"; // a hand attempt that failed — nothing of ours changed

  const created = await prisma.orderRefund.create({
    data: {
      orderId: order.id,
      amount: new Prisma.Decimal(refund.amountMinor).div(100),
      reason: "Refunded from the PaymentHub dashboard",
      intentId: refund.intentId,
      hubRefundId: refund.id,
      requestedAt: new Date(),
    },
    select: { id: true },
  });
  await settle(created.id, "SUCCEEDED", {});
  return "applied";
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

/** Leave a fresh row to the request that is still handling it. */
const RESEND_AFTER_MS = 2 * 60_000;
/** A refund the hub accepted but never reported on: read it back. */
const POLL_AFTER_MS = 15 * 60_000;

/** The payments job's refund step. Returns how many rows it looked at. */
export async function retryRefunds(now = Date.now()): Promise<number> {
  const pending = await prisma.orderRefund.findMany({
    where: { status: "PENDING", updatedAt: { lt: new Date(now - RESEND_AFTER_MS) } },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true, hubRefundId: true, updatedAt: true },
  });
  let looked = 0;
  for (const row of pending) {
    if (!row.hubRefundId) {
      await sendRefund(row.id).catch(log("retry"));
      looked++;
    } else if (paymentHubConfigured && row.updatedAt.getTime() < now - POLL_AFTER_MS) {
      try {
        const refund = await getRefund(row.hubRefundId);
        const status = refundStatusFromHub(refund.status);
        if (status === "PENDING") {
          // Still on its way — touch the row so it is asked about later, not every run.
          await prisma.orderRefund.update({ where: { id: row.id }, data: { updatedAt: new Date() } });
        } else {
          await settle(row.id, status, { gatewayRefundId: refund.gatewayRefundId ?? null });
        }
      } catch (err) {
        log("poll")(err);
      }
      looked++;
    }
  }
  return looked;
}
