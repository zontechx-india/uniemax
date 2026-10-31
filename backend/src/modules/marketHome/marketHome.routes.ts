import type { FastifyPluginAsync } from "fastify";
import * as controller from "./marketHome.controller.js";

/**
 * Marketplace homepage sections — order + on/off for `/`.
 *
 * Admin mount: /api/v1/admin/home-sections, INSIDE the `requireAdmin` subtree
 * in `routes.ts`, so no route here repeats the guard.
 */
export const adminMarketHomeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.getSections);
  app.put("/", controller.updateSections);
};

/** The anonymous read — mounted at /api/v1/public/home-sections. */
export const publicMarketHomeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.getSections);
};
