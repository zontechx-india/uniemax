import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, list } from "../../../utils/response.js";
import { HttpError } from "../../../utils/httpError.js";
import { issueSession } from "../core/session.service.js";
import { emit } from "../../events/index.js";
import { sessionMeta } from "../core/cookies.js";
import { deliverWeb, deliverMobile } from "../core/delivery.js";
import {
  registerRequestSchema,
  registerVerifySchema,
  passwordLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  googleSignInSchema,
  otpRequestSchema,
  otpVerifySchema,
  linkRequestSchema,
  linkVerifySchema,
  customerUpdateSchema,
} from "./customer.schema.js";
import type { CustomerAuthResult } from "./customer.shared.js";
import * as passwordStrategy from "./strategies/password.strategy.js";
import * as googleStrategy from "./strategies/google.strategy.js";
import * as otpStrategy from "./strategies/otp.strategy.js";
import * as service from "./customer.service.js";

/**
 * Thin controllers. Every login handler follows the same shape regardless of
 * strategy: parse → strategy resolves a `CustomerAuthResult` → `issueSession`
 * → deliver per client profile (web cookies / mobile JSON). Adding a provider
 * (e.g. Apple) is one strategy + two of these handlers.
 */

/** Strategy result → session → response, shaped for the client profile. */
async function deliverLogin(
  request: FastifyRequest,
  reply: FastifyReply | null,
  result: CustomerAuthResult,
  extra: Record<string, unknown> = {},
) {
  const tokens = await issueSession(result.principal, sessionMeta(request));
  // Listeners (e.g. seller bills linking orders made for this phone) never block a login.
  emit("customer.signedIn", { customerId: result.customer.id });
  const payload = { customer: result.customer, isNewUser: result.isNewUser, ...extra };
  return reply ? deliverWeb(reply, tokens, payload) : deliverMobile(tokens, payload);
}

// ---- Email + password (primary) — verify-first registration ---------------

/** Step 1 (shared): validate the form, check the email is free, send the code. */
export async function requestRegistration(request: FastifyRequest, reply: FastifyReply) {
  const input = registerRequestSchema.parse(request.body);
  return reply.status(201).send(ok(await passwordStrategy.requestRegistration(input)));
}

/** Step 2: code + credentials → account created (verified) + signed in. */
export async function webVerifyRegistration(request: FastifyRequest, reply: FastifyReply) {
  const input = registerVerifySchema.parse(request.body);
  reply.status(201);
  return deliverLogin(request, reply, await passwordStrategy.verifyRegistration(input));
}

export async function mobileVerifyRegistration(request: FastifyRequest, reply: FastifyReply) {
  const input = registerVerifySchema.parse(request.body);
  reply.status(201);
  return deliverLogin(request, null, await passwordStrategy.verifyRegistration(input));
}

export async function webLogin(request: FastifyRequest, reply: FastifyReply) {
  const input = passwordLoginSchema.parse(request.body);
  return deliverLogin(request, reply, await passwordStrategy.login(input));
}

export async function mobileLogin(request: FastifyRequest) {
  const input = passwordLoginSchema.parse(request.body);
  return deliverLogin(request, null, await passwordStrategy.login(input));
}

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  const input = forgotPasswordSchema.parse(request.body);
  return reply.status(201).send(ok(await passwordStrategy.forgotPassword(input)));
}

export async function resetPassword(request: FastifyRequest) {
  const input = resetPasswordSchema.parse(request.body);
  return ok(await passwordStrategy.resetPassword(input));
}

// ---- Google sign-in --------------------------------------------------------

export async function webGoogle(request: FastifyRequest, reply: FastifyReply) {
  const { idToken } = googleSignInSchema.parse(request.body);
  return deliverLogin(request, reply, await googleStrategy.signInWithGoogle(idToken));
}

export async function mobileGoogle(request: FastifyRequest) {
  const { idToken } = googleSignInSchema.parse(request.body);
  return deliverLogin(request, null, await googleStrategy.signInWithGoogle(idToken));
}

// ---- Phone OTP login ---------------------------------------------------------

export async function requestOtp(request: FastifyRequest, reply: FastifyReply) {
  const input = otpRequestSchema.parse(request.body);
  return reply.status(201).send(ok(await otpStrategy.requestLoginCode(input)));
}

export async function webVerifyOtp(request: FastifyRequest, reply: FastifyReply) {
  const input = otpVerifySchema.parse(request.body);
  return deliverLogin(request, reply, await otpStrategy.verifyLoginCode(input));
}

export async function mobileVerifyOtp(request: FastifyRequest) {
  const input = otpVerifySchema.parse(request.body);
  return deliverLogin(request, null, await otpStrategy.verifyLoginCode(input));
}

// ---- Authenticated customer ("me") --------------------------------------

function currentCustomerId(request: FastifyRequest): string {
  if (!request.customer) throw HttpError.unauthorized();
  return request.customer.id;
}

export async function me(request: FastifyRequest) {
  return ok(await service.getProfile(currentCustomerId(request)));
}

export async function updateMe(request: FastifyRequest) {
  const input = customerUpdateSchema.parse(request.body);
  return ok(await service.updateProfile(currentCustomerId(request), input));
}

export async function myOrders(request: FastifyRequest) {
  const orders = await service.listOwnOrders(currentCustomerId(request));
  return list(orders, {
    total: orders.length,
    page: 1,
    pageSize: orders.length,
    totalPages: 1,
  });
}

export async function changePassword(request: FastifyRequest) {
  const input = changePasswordSchema.parse(request.body);
  // The current session survives the change; all others are revoked.
  return ok(
    await passwordStrategy.changePassword(
      currentCustomerId(request),
      input,
      request.customer?.sessionId,
    ),
  );
}

// ---- Link a second identifier (add phone / second sign-in path) ----------

export async function requestLink(request: FastifyRequest, reply: FastifyReply) {
  const input = linkRequestSchema.parse(request.body);
  const result = await service.requestLink(currentCustomerId(request), input);
  return reply.status(201).send(ok(result));
}

export async function verifyLink(request: FastifyRequest) {
  const input = linkVerifySchema.parse(request.body);
  return ok(await service.verifyLink(currentCustomerId(request), input));
}
