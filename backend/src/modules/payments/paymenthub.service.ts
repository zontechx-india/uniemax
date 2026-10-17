import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { afterOrderPaid } from "./payments.service.js";
import {
  decide,
  FAILED_FROM,
  PAID_FROM,
  type HubEnvelope,
  type HubEvent,
  type OrderSnapshot,
} from "./paymenthub.webhook.js";

/**
 * PaymentHub webhook processing — dedupe, find the order, apply the forward-
 * only decision from paymenthub.webhook.ts.
 *
 *   1. Insert the event id into payment_hub_events. Already there with
 *      processedAt set → duplicate delivery, done.
 *   2. Resolve the order: Order.paymentIntentId, then metadata.orderId.
 *   3. One transaction: the guarded order update + processedAt. A crash
 *      before commit leaves processedAt null, so the hub's retry redoes it;
 *      the guards make the redo harmless.
 *   4. After commit, if this delivery won the PAID flip: the order.paid event
 *      and notifications (afterOrderPaid) — exactly once per order.
 *
 * Throws only on infrastructure errors (→ 500, the hub retries). Every
 * business outcome, including "unknown order", is a 2xx so retries drain.
 */

export type HubOutcome = "processed" | "duplicate" | "ignored";

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  storeSlug: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  paymentIntentId: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Record the delivery; false when this event was already fully processed. */
async function claimEvent(envelope: HubEnvelope): Promise<boolean> {
  try {
    await prisma.paymentHubEvent.create({ data: { id: envelope.id, type: envelope.type } });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.paymentHubEvent.findUnique({
      where: { id: envelope.id },
      select: { processedAt: true },
    });
    // processedAt still null = an earlier attempt failed mid-way: reprocess.
    return !existing?.processedAt;
  }
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.paymentHubEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date() },
  });
}

async function findOrder(
  intent: Extract<HubEvent, { kind: "payment" }>["intent"],
): Promise<OrderSnapshot | null> {
  const byIntent = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
    select: ORDER_SELECT,
  });
  if (byIntent) return byIntent;
  const orderId = intent.metadata?.orderId;
  if (!orderId) return null;
  return prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
}

export async function handlePaymentHubEvent(
  envelope: HubEnvelope,
  event: HubEvent,
  log: FastifyBaseLogger,
): Promise<HubOutcome> {
  const ctx = { eventId: envelope.id, type: envelope.type };

  if (!(await claimEvent(envelope))) {
    log.info(ctx, "PaymentHub webhook: duplicate delivery");
    return "duplicate";
  }

  if (event.kind === "unknown") {
    log.warn(ctx, "PaymentHub webhook: unhandled event type — acknowledged");
    await markProcessed(envelope.id);
    return "ignored";
  }

  if (event.kind === "refund") {
    // UnieMax has no refund records yet — they arrive with the hub migration.
    log.info(
      { ...ctx, refundId: event.refund.id, intentId: event.refund.intentId, reference: event.refund.reference },
      "PaymentHub webhook: refund event received — no refund records yet, acknowledged",
    );
    await markProcessed(envelope.id);
    return "ignored";
  }

  const { intent } = event;
  const order = await findOrder(intent);
  if (!order) {
    log.error(
      { ...ctx, intentId: intent.id, reference: intent.reference },
      "PaymentHub webhook: no order matches this intent",
    );
    await markProcessed(envelope.id);
    return "ignored";
  }

  const decision = decide(event, order);
  const orderCtx = { ...ctx, intentId: intent.id, orderId: order.id };

  if (decision.action === "ignore") {
    log[decision.level]({ ...orderCtx, reason: decision.reason }, "PaymentHub webhook: no change");
    await markProcessed(envelope.id);
    return "ignored";
  }

  if (decision.action === "markFailed") {
    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: order.id, paymentStatus: { in: [...FAILED_FROM] } },
        data: { paymentStatus: "FAILED" },
      });
      await tx.paymentHubEvent.update({
        where: { id: envelope.id },
        data: { processedAt: new Date() },
      });
    });
    log.info(orderCtx, "PaymentHub webhook: payment marked FAILED");
    return "processed";
  }

  // markPaid
  const won = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: { in: [...PAID_FROM] } },
      data: { paymentStatus: "PAID", paymentRef: decision.paymentRef },
    });
    await tx.paymentHubEvent.update({
      where: { id: envelope.id },
      data: { processedAt: new Date() },
    });
    return updated.count > 0;
  });

  if (decision.lateCapture) {
    log.warn(orderCtx, "PaymentHub webhook: LATE CAPTURE — paid after the intent was cancelled/expired; review for refund");
  }
  if (won) {
    log.info(orderCtx, "PaymentHub webhook: order marked PAID");
    try {
      await afterOrderPaid(order.id);
    } catch (error) {
      // The payment is committed; a notification failure must not make the
      // hub retry (the retry would be a duplicate and notify nobody anyway).
      log.error({ ...orderCtx, err: error }, "PaymentHub webhook: post-payment notifications failed");
    }
  }
  return "processed";
}
