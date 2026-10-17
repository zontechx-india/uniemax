import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { payParamSchema } from "./payments.schema.js";
import * as service from "./payments.service.js";
import * as hub from "./paymenthub.webhook.js";
import { handlePaymentHubEvent } from "./paymenthub.service.js";
import { env } from "../../config/env.js";

/**
 * Cashfree webhook receiver. The route's scope parses application/json to a
 * raw Buffer so the HMAC is computed over the exact bytes Cashfree signed.
 * Bad signature → 401 (and Cashfree stops retrying); verified events answer
 * 200 even when they are business no-ops, so retries drain instead of
 * looping. A thrown DB error still bubbles to a 5xx — that IS a retry-worthy
 * failure.
 */
export async function handleCashfreeWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const rawBody = request.body as Buffer;
  const signature = request.headers["x-webhook-signature"];
  const timestamp = request.headers["x-webhook-timestamp"];
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    typeof timestamp !== "string" ||
    !service.verifyWebhookSignature(rawBody, signature, timestamp)
  ) {
    throw HttpError.unauthorized("Invalid webhook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw HttpError.badRequest("Invalid webhook payload");
  }

  await service.processWebhook(payload as Parameters<typeof service.processWebhook>[0]);
  return reply.status(200).send({ received: true });
}

/**
 * PaymentHub webhook receiver — same raw-Buffer scope as the Cashfree route.
 *
 *   secret unset          → 503 (fail closed; the hub retries)
 *   bad/stale signature   → 401, nothing processed
 *   signed but malformed  → 400
 *   wrong mode for env    → 200, ignored (prod takes LIVE only)
 *   anything else         → processed or deduped → 200; a DB error → 500
 *
 * Never logs the secret, the signature header or the body.
 */
export async function handlePaymentHubWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const secret = env.PAYMENTHUB_WEBHOOK_SECRET;
  if (!secret) {
    request.log.error("PaymentHub webhook received but PAYMENTHUB_WEBHOOK_SECRET is not set");
    throw new HttpError(503, "PaymentHub webhooks are not configured");
  }

  const rawBody = request.body;
  const signature = request.headers["paymenthub-signature"];
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !hub.verifyPaymentHubSignature(rawBody, signature, secret)
  ) {
    throw HttpError.unauthorized("Invalid webhook signature");
  }

  let envelope: hub.HubEnvelope;
  let event: hub.HubEvent;
  try {
    envelope = hub.envelopeSchema.parse(JSON.parse(rawBody.toString("utf8")));
    event = hub.parseEventData(envelope);
  } catch {
    request.log.warn("PaymentHub webhook: signed but malformed payload");
    throw HttpError.badRequest("Invalid webhook payload");
  }

  if (!hub.acceptsMode(envelope.mode, env.NODE_ENV === "production")) {
    request.log.warn(
      { eventId: envelope.id, type: envelope.type, mode: envelope.mode },
      "PaymentHub webhook: event mode does not match this environment — ignored",
    );
    return reply.status(200).send({ received: true });
  }

  await handlePaymentHubEvent(envelope, event, request.log);
  return reply.status(200).send({ received: true });
}

/** Runs behind `requireCustomer` — "Pay now / Retry payment" on an order. */
export async function createPaySession(request: FastifyRequest) {
  const { slug, orderId } = payParamSchema.parse(request.params);
  return ok(
    await service.getOrCreatePaySession(slug, orderId, request.customer!.id),
  );
}
