import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { emit } from "../../package/events/index.js";
import { publicWebUrl } from "../../package/mail/index.js";
import {
  notifyOrderPlaced,
  notifyPaymentOnCancelledOrder,
} from "../orders/orders.notifications.js";
import {
  cashfreeConfigured,
  cashfreeMode,
  createCashfreeOrder,
  getCashfreeOrder,
  getCashfreePayments,
  terminateCashfreeOrder,
} from "./cashfree.client.js";
import {
  cancelIntent,
  createIntent,
  getIntent,
  HubApiError,
  retryIntent,
  type HubIntent,
} from "./paymenthub.client.js";
import { decide, rupeesToPaise, type OrderSnapshot } from "./paymenthub.webhook.js";

/**
 * Two providers behind one lifecycle. With PAYMENTS_VIA_HUB=true, new ONLINE
 * orders pay through PaymentHub (Order.paymentIntentId); otherwise straight
 * through Cashfree (Order.cfOrderId). Each order stays on the provider it
 * started with — every function below dispatches on which id the order has.
 *
 * Cashfree payment lifecycle around an Order:
 *
 *   placement (ONLINE)  → createPaymentSession()   → payment_session_id
 *   customer retries    → getOrCreatePaySession()  → reuse or new attempt
 *   Cashfree calls back → handleCashfreeWebhook()  → verify HMAC → mark PAID
 *   success page loads  → reconcilePendingPayment()→ poll Cashfree (webhook
 *                                                    fallback, e.g. local dev)
 *
 * The order_id registered with Cashfree is our orderNumber; a retry after an
 * expired session registers "orderNumber~R<n>" (Cashfree order ids are
 * one-shot). The webhook maps back by stripping the "~" suffix. Marking PAID
 * is a guarded update, so webhook retries and a concurrent reconcile are
 * naturally idempotent.
 */

export interface PaymentSession {
  paymentSessionId: string;
  /** Cashfree order id, or the PaymentHub intent id for hub orders. */
  cfOrderId: string;
  /** Which SDK environment to load on the client. */
  mode: "sandbox" | "production";
}

/** The slice of a just-created order the session call needs. */
export interface SessionOrder {
  id: string;
  orderNumber: string;
  storeSlug: string;
  total: { toString(): string; toFixed(digits: number): string };
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

const viaHub = env.PAYMENTS_VIA_HUB;

/** Some payment provider is live — ONLINE orders take real payments. */
export const gatewayConfigured = viaHub || cashfreeConfigured;

function returnUrlFor(order: { storeSlug: string; id: string }): string | null {
  // The storefront success page — it polls the order until the webhook (or
  // the reconcile fallback below) settles the payment status.
  return publicWebUrl
    ? `${publicWebUrl}/order/${order.storeSlug}/${order.id}`
    : null;
}

function notifyUrl(): string | null {
  const base = env.PUBLIC_API_URL?.replace(/\/+$/, "");
  return base ? `${base}/api/v1/payments/webhooks/cashfree` : null;
}

/**
 * Register a Cashfree order for this Order and persist the session. `attempt`
 * 0 uses the plain orderNumber; retries suffix "~R<n>" because a Cashfree
 * order id can never be reused.
 */
export async function createPaymentSession(
  order: SessionOrder,
  attempt = 0,
): Promise<PaymentSession> {
  if (viaHub) return createHubSession(order, `order:${order.id}:intent:${attempt}`);
  const cfOrderId =
    attempt === 0 ? order.orderNumber : `${order.orderNumber}~R${attempt}`;

  const created = await createCashfreeOrder({
    orderId: cfOrderId,
    amount: order.total.toString(),
    customer: {
      id: order.customerId ?? `guest-${order.id}`,
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
    },
    returnUrl: returnUrlFor(order),
    notifyUrl: notifyUrl(),
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { cfOrderId, paymentSessionId: created.payment_session_id },
  });

  return {
    paymentSessionId: created.payment_session_id,
    cfOrderId,
    mode: cashfreeMode,
  };
}

// ---------------------------------------------------------------------------
// PaymentHub path
// ---------------------------------------------------------------------------

const HUB_PAID = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);
const HUB_OPEN = new Set(["CREATED", "PENDING", "FAILED"]);

/** Open a hub intent for the order; the reference is the orderNumber. */
async function createHubSession(
  order: SessionOrder,
  idempotencyKey: string,
): Promise<PaymentSession> {
  const amountMinor = rupeesToPaise(order.total);
  if (amountMinor === null || amountMinor <= 0n) {
    throw new Error(`Order ${order.orderNumber} has an unpayable total ${order.total.toString()}`);
  }
  const returnUrl = returnUrlFor(order);
  const intent = await createIntent(
    {
      reference: order.orderNumber,
      amountMinor: Number(amountMinor),
      customer: {
        id: order.customerId ?? `guest-${order.id}`,
        ...(order.customerName ? { name: order.customerName.slice(0, 100) } : {}),
        ...(order.customerEmail ? { email: order.customerEmail } : {}),
        ...(order.customerPhone ? { phone: order.customerPhone.slice(0, 20) } : {}),
      },
      ...(returnUrl ? { returnUrl } : {}),
      metadata: { orderId: order.id, storeSlug: order.storeSlug },
    },
    idempotencyKey,
  );
  return saveHubSession(order.id, intent);
}

async function saveHubSession(orderId: string, intent: HubIntent): Promise<PaymentSession> {
  if (!intent.checkout) {
    throw HttpError.badGateway(`PaymentHub returned no checkout for a ${intent.status} payment`);
  }
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentIntentId: intent.id, paymentSessionId: intent.checkout.sessionId },
  });
  return {
    paymentSessionId: intent.checkout.sessionId,
    cfOrderId: intent.id,
    mode: intent.checkout.mode,
  };
}

/**
 * Settle the order when the hub says the intent was paid — through the same
 * checks as the webhook (reference, store, amount). True when it is paid.
 */
async function settleIfHubPaid(order: OrderSnapshot, intent: HubIntent): Promise<boolean> {
  if (!HUB_PAID.has(intent.status)) return false;
  const decision = decide({ kind: "payment", type: "payment.succeeded", intent }, order);
  if (decision.action === "markPaid") {
    await markOrderPaid(order.id, decision.paymentRef);
    return true;
  }
  if (decision.action !== "ignore") return false; // unreachable for a success
  if (decision.level === "error") {
    // eslint-disable-next-line no-console
    console.error(`PaymentHub reconcile for ${order.orderNumber}: ${decision.reason}`);
    return false;
  }
  return true; // already PAID/REFUNDED on our side
}

/** "Pay now / retry" for an order already on the hub. */
async function hubPaySession(
  order: OrderSnapshot & SessionOrder & { paymentIntentId: string },
): Promise<{ paymentStatus: "PAID" } | { paymentStatus: "PENDING"; payment: PaymentSession }> {
  let intent = await getIntent(order.paymentIntentId, true);
  if (await settleIfHubPaid(order, intent)) return { paymentStatus: "PAID" };

  if (HUB_OPEN.has(intent.status)) {
    try {
      // A live session comes back unchanged; a failed/expired one is replaced.
      intent = await retryIntent(intent.id, `order:${order.id}:retry:${randomUUID()}`);
      if (await settleIfHubPaid(order, intent)) return { paymentStatus: "PAID" };
      if (intent.checkout) {
        return { paymentStatus: "PENDING", payment: await saveHubSession(order.id, intent) };
      }
    } catch (err) {
      // Past the intent's expiry → INVALID_STATE; start a fresh intent below.
      if (!(err instanceof HubApiError && err.hubCode === "INVALID_STATE")) throw err;
    }
    // The old intent may still hold the reference — release it first.
    try {
      await cancelIntent(intent.id, `order:${order.id}:cancel:${intent.id}`);
    } catch (err) {
      if (!(err instanceof HubApiError && err.hubCode === "INVALID_STATE")) throw err;
      intent = await getIntent(intent.id);
      if (await settleIfHubPaid(order, intent)) return { paymentStatus: "PAID" };
    }
  }

  const payment = await createHubSession(order, `order:${order.id}:after:${intent.id}`);
  return { paymentStatus: "PENDING", payment };
}

/**
 * "Pay now / retry payment" — returns a usable session for an unpaid ONLINE
 * order the signed-in customer owns. Reconciles against Cashfree first (the
 * payment may have landed without us hearing the webhook), reuses the
 * existing session while its Cashfree order is still ACTIVE, and registers a
 * fresh attempt once it expired.
 */
export async function getOrCreatePaySession(
  storeSlug: string,
  orderId: string,
  customerId: string,
): Promise<{ paymentStatus: "PAID" } | { paymentStatus: "PENDING"; payment: PaymentSession }> {
  if (!gatewayConfigured) {
    throw new HttpError(503, "Online payment is not available right now");
  }
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeSlug, customerId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      storeSlug: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      cfOrderId: true,
      paymentIntentId: true,
      paymentSessionId: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
    },
  });
  if (!order) throw HttpError.notFound("Order not found");
  if (order.paymentMethod !== "ONLINE") {
    throw HttpError.conflict("This order is not an online-payment order");
  }
  if (order.status === "CANCELLED") {
    throw HttpError.conflict("This order was cancelled");
  }
  if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
    return { paymentStatus: "PAID" };
  }

  if (order.paymentIntentId) {
    return hubPaySession({ ...order, paymentIntentId: order.paymentIntentId });
  }

  if (order.cfOrderId && cashfreeConfigured) {
    const remote = await getCashfreeOrder(order.cfOrderId);
    if (remote.order_status === "PAID") {
      await settlePaidOrder(order.id, order.cfOrderId);
      return { paymentStatus: "PAID" };
    }
    if (remote.order_status === "ACTIVE" && order.paymentSessionId) {
      return {
        paymentStatus: "PENDING",
        payment: {
          paymentSessionId: order.paymentSessionId,
          cfOrderId: order.cfOrderId,
          mode: cashfreeMode,
        },
      };
    }
  }

  const attempt = nextAttempt(order.orderNumber, order.cfOrderId);
  const payment = await createPaymentSession(order, attempt);
  return { paymentStatus: "PENDING", payment };
}

/** "UM-X" → 1 (first retry), "UM-X~R2" → 3. */
function nextAttempt(orderNumber: string, cfOrderId: string | null): number {
  if (!cfOrderId || cfOrderId === orderNumber) return cfOrderId ? 1 : 0;
  const match = /~R(\d+)$/.exec(cfOrderId);
  return match ? Number(match[1]) + 1 : 1;
}

// ---------------------------------------------------------------------------
// Settling a payment (shared by webhook + reconcile + retry endpoint)
// ---------------------------------------------------------------------------

/**
 * Flip an order to PAID exactly once and send the deferred placement
 * notifications (gateway orders don't email on placement — money first).
 * The guarded update makes duplicate webhooks / concurrent reconciles no-ops.
 *
 * A payment can still land on an order the seller ALREADY CANCELLED — the
 * customer was sitting on the hosted checkout when the cancellation happened
 * and `voidPaymentSession` either lost the race or failed. The money is real,
 * so it is recorded (losing it would be worse than recording it), but the
 * order stays cancelled: its stock was already returned to the catalog and
 * may have been resold. Such an order gets the refund-required alert instead
 * of a "your order is placed" confirmation, which would be a lie.
 */
async function markOrderPaid(
  orderId: string,
  cfPaymentId: string,
): Promise<void> {
  const updated = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: { in: ["PENDING", "FAILED"] } },
    data: { paymentStatus: "PAID", paymentRef: cfPaymentId },
  });
  if (updated.count === 0) return; // already settled
  await afterOrderPaid(orderId);
}

/**
 * Everything that follows a successful PENDING/FAILED → PAID flip: the
 * `order.paid` event plus the deferred placement notifications (or the
 * refund-required alert for an already-cancelled order). Call it only after
 * the guarded update that won the flip — exactly once per order. Shared with
 * the PaymentHub webhook, which flips inside its own transaction.
 */
export async function afterOrderPaid(orderId: string): Promise<void> {
  emit("order.paid", { orderId });

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
      items: { select: { productName: true, quantity: true } },
      store: { select: { owner: { select: { id: true, email: true } } } },
    },
  });
  if (!order) return;

  const seller = order.store?.owner ?? null;
  if (order.status === "CANCELLED") {
    notifyPaymentOnCancelledOrder(order, order.customerId, seller?.email ?? null);
    return;
  }
  // The store is gone (SetNull) only if it was deleted mid-payment — there is
  // no seller left to alert, but the customer still gets their confirmation.
  if (seller) notifyOrderPlaced(order, order.customerId ?? "", seller);
}

/**
 * Seller cancelled an unpaid ONLINE order — terminate its Cashfree order so
 * a customer sitting on the hosted checkout can no longer pay for stock that
 * has just gone back on sale. Best-effort and never throws: cancellation
 * itself must succeed even when the gateway is unreachable, and anything
 * that slips through is caught by the CANCELLED branch of `markOrderPaid`.
 */
export async function voidPaymentSession(orderId: string): Promise<void> {
  if (!gatewayConfigured) return;
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentMethod: true, paymentStatus: true, cfOrderId: true, paymentIntentId: true },
    });
    if (
      !order ||
      order.paymentMethod !== "ONLINE" ||
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "REFUNDED"
    ) {
      return;
    }
    if (order.paymentIntentId) {
      // A payment that already landed comes back as INVALID_STATE; the hub
      // then sends payment.succeeded and the CANCELLED branch alerts ops.
      await cancelIntent(order.paymentIntentId, `order:${orderId}:cancel:${order.paymentIntentId}`);
    } else if (order.cfOrderId && cashfreeConfigured) {
      await terminateCashfreeOrder(order.cfOrderId);
    } else {
      return;
    }
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ["PENDING", "FAILED"] } },
      data: { paymentSessionId: null },
    });
  } catch (err) {
    // Already paid, already terminated, or the gateway is down — the
    // markOrderPaid guard is the backstop.
    // eslint-disable-next-line no-console
    console.error("Payment void failed:", err);
  }
}

/** Ask Cashfree for the successful payment of a cf order and settle ours. */
async function settlePaidOrder(orderId: string, cfOrderId: string) {
  const payments = await getCashfreePayments(cfOrderId);
  const success = payments.find((p) => p.payment_status === "SUCCESS");
  await markOrderPaid(orderId, String(success?.cf_payment_id ?? cfOrderId));
}

/**
 * Webhook fallback: when the success page loads an ONLINE order that is
 * still PENDING/FAILED, ask Cashfree directly. Best-effort — a gateway
 * hiccup must never break the confirmation page.
 */
export async function reconcilePendingPayment(orderId: string): Promise<void> {
  if (!gatewayConfigured) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      storeSlug: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      cfOrderId: true,
      paymentIntentId: true,
    },
  });
  if (
    !order ||
    order.paymentMethod !== "ONLINE" ||
    (order.paymentStatus !== "PENDING" && order.paymentStatus !== "FAILED")
  ) {
    return;
  }
  if (order.paymentIntentId) {
    try {
      await settleIfHubPaid(order, await getIntent(order.paymentIntentId, true));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("PaymentHub reconcile failed:", err);
    }
    return;
  }
  if (!order.cfOrderId || !cashfreeConfigured) return;
  try {
    const remote = await getCashfreeOrder(order.cfOrderId);
    if (remote.order_status === "PAID") {
      await settlePaidOrder(order.id, order.cfOrderId);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Cashfree reconcile failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Verify x-webhook-signature: Base64(HMAC-SHA256(timestamp + rawBody)) keyed
 * with the API secret. Computed over the EXACT raw bytes — the route parses
 * the body as a buffer for this reason.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
): boolean {
  if (!cashfreeConfigured || !signature || !timestamp) return false;
  const expected = createHmac("sha256", env.CASHFREE_SECRET_KEY!)
    .update(timestamp + rawBody.toString("utf8"))
    .digest();
  const received = Buffer.from(signature, "base64");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

interface WebhookPayload {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: {
      cf_payment_id?: number | string;
      payment_status?: string;
      payment_amount?: number;
    };
  };
}

/**
 * Process a verified webhook. Success flips the order to PAID (after an
 * amount check), failure marks FAILED but keeps the order retryable, and
 * everything else (USER_DROPPED, refund/settlement events we don't consume
 * yet) is acknowledged and ignored. Replays are harmless — see markOrderPaid.
 */
export async function processWebhook(payload: WebhookPayload): Promise<void> {
  const type = payload.type ?? "";
  if (
    type !== "PAYMENT_SUCCESS_WEBHOOK" &&
    type !== "PAYMENT_FAILED_WEBHOOK"
  ) {
    return;
  }

  const cfOrderId = payload.data?.order?.order_id;
  if (!cfOrderId) return;
  // "UM-X~R2" → "UM-X" (retry attempts share the underlying order).
  const orderNumber = cfOrderId.split("~")[0]!;
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, total: true, paymentStatus: true },
  });
  if (!order) return;

  if (type === "PAYMENT_SUCCESS_WEBHOOK") {
    const amount = payload.data?.payment?.payment_amount;
    if (
      typeof amount !== "number" ||
      !new Prisma.Decimal(amount).equals(order.total)
    ) {
      // A success for the wrong amount is never marked PAID silently.
      // eslint-disable-next-line no-console
      console.error(
        `Cashfree webhook amount mismatch for ${orderNumber}: got ${amount}, expected ${order.total.toString()}`,
      );
      return;
    }
    await markOrderPaid(
      order.id,
      String(payload.data?.payment?.cf_payment_id ?? cfOrderId),
    );
    return;
  }

  // PAYMENT_FAILED_WEBHOOK — only downgrade a still-pending order; a later
  // (or earlier) success always wins.
  await prisma.order.updateMany({
    where: { orderNumber, paymentStatus: "PENDING" },
    data: { paymentStatus: "FAILED" },
  });
}
