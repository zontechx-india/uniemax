import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../guards.js";
import { sessionRoutes } from "../core/session.routes.js";
import * as controller from "./customer.controller.js";

/**
 * Customer authentication + self-service. Mounted at /api/v1/auth
 *
 * Three sign-in strategies (Apple planned), each delivered per client profile
 * (web → httpOnly cookies, mobile → tokens in the JSON body):
 *
 *   Email + password  → /register/request → /{web,mobile}/register/verify
 *                       (verify-first — the account exists only after the
 *                       emailed code is confirmed) · /{web,mobile}/login
 *                       + /password/forgot · /password/reset
 *   Google            → /{web,mobile}/google
 *   Phone OTP         → /otp/request → /{web,mobile}/otp/verify
 *                       (sign in or sign up — a number nobody owns gets a
 *                       new phone-only account on first verify)
 *
 * plus the generic session endpoints (refresh / logout / logout-all) and the
 * authenticated /me surface.
 */
/**
 * Per-route rate limits (per IP, on top of the app's global ceiling):
 *   SEND_CODE — endpoints that dispatch an email/SMS: strict, they cost
 *               money and can spam a victim's inbox/phone.
 *   VERIFY    — credential/code checks: loose enough for honest retries,
 *               tight enough to make brute force impractical (codes also
 *               have OTP_MAX_ATTEMPTS server-side).
 */
const SEND_CODE = { rateLimit: { max: 5, timeWindow: "5 minutes" } };
const VERIFY = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ---- Public: email + password (primary, verify-first) -------------------
  app.post("/register/request", { config: SEND_CODE }, controller.requestRegistration);
  app.post("/web/register/verify", { config: VERIFY }, controller.webVerifyRegistration);
  app.post("/mobile/register/verify", { config: VERIFY }, controller.mobileVerifyRegistration);
  app.post("/web/login", { config: VERIFY }, controller.webLogin);
  app.post("/mobile/login", { config: VERIFY }, controller.mobileLogin);
  app.post("/password/forgot", { config: SEND_CODE }, controller.forgotPassword);
  app.post("/password/reset", { config: VERIFY }, controller.resetPassword);

  // ---- Public: Google sign-in ---------------------------------------------
  app.post("/web/google", { config: VERIFY }, controller.webGoogle);
  app.post("/mobile/google", { config: VERIFY }, controller.mobileGoogle);

  // ---- Public: phone OTP (sign in, or sign up on first verify) ------------
  app.post("/otp/request", { config: SEND_CODE }, controller.requestOtp);
  app.post("/web/otp/verify", { config: VERIFY }, controller.webVerifyOtp);
  app.post("/mobile/otp/verify", { config: VERIFY }, controller.mobileVerifyOtp);

  // ---- Sessions (refresh / logout / logout-all, web + mobile) -------------
  await app.register(sessionRoutes("customer"));

  // ---- Protected: the logged-in customer's own data -----------------------
  app.get("/me", { preHandler: requireCustomer }, controller.me);
  app.patch("/me", { preHandler: requireCustomer }, controller.updateMe);
  app.get("/me/orders", { preHandler: requireCustomer }, controller.myOrders);
  app.post("/me/password", { preHandler: requireCustomer, config: VERIFY }, controller.changePassword);

  // Protected: link a second identifier (e.g. add a phone for OTP sign-in)
  app.post("/me/link/request", { preHandler: requireCustomer, config: SEND_CODE }, controller.requestLink);
  app.post("/me/link/verify", { preHandler: requireCustomer, config: VERIFY }, controller.verifyLink);
};
