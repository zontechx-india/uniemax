import type { FastifyRequest } from "fastify";
import { list, ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { recordAudit } from "../admin/adminAudit.js";
import * as schema from "./payouts.schema.js";
import * as service from "./payouts.service.js";
import * as messages from "./payouts.notifications.js";

/**
 * Seller payouts — admin console. Parse, call the service, audit every write.
 */

export async function previewPayoutMessage(request: FastifyRequest) {
  const { id, payoutId } = schema.payoutParams.parse(request.params);
  const { channel } = schema.payoutMessageSchema.parse(request.query);
  return ok(await messages.previewPayoutMessage(id, payoutId, channel, request.log));
}

export async function sendPayoutMessage(request: FastifyRequest) {
  const { id, payoutId } = schema.payoutParams.parse(request.params);
  const { channel } = schema.payoutMessageSchema.parse(request.body);
  const sent = await messages.sendPayoutMessage(id, payoutId, channel, request.log);
  recordAudit(request, {
    action: "payout.message.send",
    entityType: "order",
    entityId: id,
    meta: { payoutId, channel, to: sent.to },
  });
  return ok(sent);
}

async function actor(request: FastifyRequest) {
  if (!request.admin) throw HttpError.unauthorized();
  return service.resolveActor(request.admin.id);
}

export async function getOrderPayouts(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.getOrderPayouts(id));
}

export async function recordManualPayout(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = schema.manualPayoutSchema.parse(request.body);
  const payout = await service.recordManualPayout(id, input, await actor(request), request.log);
  recordAudit(request, {
    action: "payout.manual.record",
    entityType: "order",
    entityId: id,
    meta: {
      payoutId: payout.id,
      amount: payout.amount.toFixed(2),
      status: payout.status,
      senderName: payout.senderName,
      utr: payout.utr,
    },
  });
  return ok(payout);
}

export async function triggerGatewayPayout(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = schema.gatewayPayoutSchema.parse(request.body);
  const payout = await service.triggerGatewayPayout(id, input, await actor(request), request.log);
  recordAudit(request, {
    action: "payout.gateway.trigger",
    entityType: "order",
    entityId: id,
    meta: { payoutId: payout.id, amount: payout.amount.toFixed(2), status: payout.status },
  });
  return ok(payout);
}

export async function resendGatewayPayout(request: FastifyRequest) {
  const { id, payoutId } = schema.payoutParams.parse(request.params);
  const payout = await service.resendGatewayPayout(id, payoutId, request.log);
  recordAudit(request, {
    action: "payout.gateway.resend",
    entityType: "order",
    entityId: id,
    meta: { payoutId, status: payout.status },
  });
  return ok(payout);
}

export async function updatePayoutStatus(request: FastifyRequest) {
  const { id, payoutId } = schema.payoutParams.parse(request.params);
  const input = schema.payoutStatusSchema.parse(request.body);
  const { from, payout } = await service.updateManualStatus(id, payoutId, input, await actor(request), request.log);
  recordAudit(request, {
    action: "payout.status",
    entityType: "order",
    entityId: id,
    meta: { payoutId, from, to: payout.status, reason: input.reason ?? null },
  });
  return ok(payout);
}

export async function listPayouts(request: FastifyRequest) {
  const query = schema.payoutListQuery.parse(request.query);
  const { rows, meta, totals } = await service.listPayouts(query);
  return { ...list(rows, meta), totals };
}

export async function listAwaitingPayout(request: FastifyRequest) {
  const query = schema.awaitingPayoutQuery.parse(request.query);
  const { rows, meta, totalAmount } = await service.listAwaitingPayout(query);
  return { ...list(rows, meta), totalAmount };
}
