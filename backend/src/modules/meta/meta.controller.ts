import type { FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { sellerSignupSchema } from "./meta.schema.js";
import { sendSellerSignup } from "./meta.service.js";

/**
 * `POST /api/v1/analytics/meta/seller-signup` — fires the server half of the
 * seller `CompleteRegistration` event via the Conversions API. Only an
 * already signed-in customer may claim their own signup; a repeat call is a
 * no-op (`sent: false, reason: 'already_sent'`).
 */
export async function sellerSignup(request: FastifyRequest) {
  if (!request.customer) throw HttpError.unauthorized();
  const input = sellerSignupSchema.parse(request.body);
  const result = await sendSellerSignup({
    customerId: request.customer.id,
    eventId: input.eventId,
    method: input.method,
    fbp: input.fbp ?? null,
    fbc: input.fbc ?? null,
    eventSourceUrl: input.eventSourceUrl ?? null,
    clientIp: request.ip ?? null,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null,
  });
  return ok(result);
}
