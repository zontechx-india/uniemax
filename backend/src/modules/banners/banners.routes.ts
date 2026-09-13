import type { FastifyPluginAsync } from "fastify";
import * as controller from "./banners.controller.js";

/**
 * Marketplace banners — the platform-wide homepage carousel.
 *
 * Mounted at /api/v1/admin/banners, INSIDE the `requireAdmin` subtree in
 * `routes.ts`, so no route here repeats the guard. Create and image replace
 * are multipart; everything else is JSON.
 */
export const adminBannerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.listBanners);
  app.post("/", controller.createBanner);
  // Before "/:id", so "order" is never read as a banner id.
  app.patch("/order", controller.reorderBanners);
  app.patch("/:id", controller.updateBanner);
  app.put("/:id/image", controller.replaceBannerImage);
  app.delete("/:id", controller.deleteBanner);
};

/** The one anonymous read — mounted at /api/v1/public/banners. */
export const publicBannerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.listPublicBanners);
};
