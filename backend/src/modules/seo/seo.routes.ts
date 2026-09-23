import type { FastifyPluginAsync } from "fastify";
import * as controller from "./seo.controller.js";

/**
 * XML sitemaps — anonymous, read-only. Mounted at /api/v1/public alongside
 * the rest of the anonymous surface, which is what lets them be served
 * through the nginx `/api` proxy that already exists rather than needing a
 * new root-level `location` on every vhost. `frontend/public/robots.txt`
 * declares the index, which is how a crawler finds all of this.
 */
export const publicSeoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/sitemap.xml", controller.sitemapIndex);
  app.get("/sitemap-stores.xml", controller.marketplaceSitemap);
  app.get("/sitemap-categories.xml", controller.categorySitemap);
  app.get("/sitemap-store-:slug.xml", controller.storeSitemap);
};
