import type { FastifyPluginAsync } from "fastify";
import * as controller from "./discovery.controller.js";

/**
 * Marketplace discovery — anonymous, read-only, platform-wide.
 * Mounted at /api/v1/public (alongside /public/stores).
 */
export const publicDiscoveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/search", controller.search);
  app.get("/products", controller.newProducts);
  app.get("/categories", controller.popularCategories);
  app.get("/stats", controller.stats);
  // Global category landing pages (`/c/{slug}`) — the taxonomy-wide browse
  // surface. `/browse` (the browsable set) is static and so cannot be
  // swallowed by `/browse/:slug`.
  app.get("/browse", controller.browsableCategories);
  app.get("/browse/:slug", controller.browseCategory);
};
