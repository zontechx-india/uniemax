import type { FastifyPluginAsync } from "fastify";
import { requireSuperAdmin } from "../auth/index.js";
import * as controller from "./controller.js";

/**
 * Admin — mounted at /api/v1/admin/policies inside the `requireAdmin` +
 * CSRF subtree (routes.ts). Any admin reads and edits the draft; only a
 * SUPER_ADMIN creates a policy or publishes (decision P3).
 */
export const adminPolicyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.listPolicies);
  app.get("/:code", controller.getPolicy);
  app.post("/", { preHandler: requireSuperAdmin }, controller.createPolicy);

  app.post("/:code/draft", controller.startDraft);
  app.patch("/:code/draft", controller.updateDraft);
  app.post("/:code/draft/reset", controller.resetDraft);
  app.post("/:code/draft/publish", { preHandler: requireSuperAdmin }, controller.publishDraft);
};

/** Public — mounted at /api/v1/policies. Published, started versions only. */
export const publicPolicyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:code", controller.getPublicPolicy);
  app.get("/:code/versions", controller.getPublicHistory);
};
