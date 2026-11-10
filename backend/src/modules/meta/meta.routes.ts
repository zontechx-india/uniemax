import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./meta.controller.js";

/**
 * The analytics bridge between the browser Meta Pixel and Meta's Conversions
 * API. Customer-authenticated: only the signed-in seller themselves can claim
 * their `CompleteRegistration` event. Mounted at `/analytics/meta` under the
 * versioned API prefix in `src/routes.ts`.
 */
export const metaAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.post("/seller-signup", controller.sellerSignup);
};
