import type { FastifyPluginAsync } from "fastify";
import * as controller from "./media.controller.js";

/**
 * Public image derivatives, mounted at /api/v1/public/images — inside the
 * `/api` prefix every vhost already proxies, so no nginx change is needed.
 *
 *   GET /share/:bucket/{key}.jpg     preview-safe JPEG of an original (og:image)
 *   GET /w/:width/:bucket/{key}      the original at a published width (srcset)
 */
export const publicMediaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/share/:bucket/*", controller.shareImage);
  app.get("/w/:width/:bucket/*", controller.sizedImage);
};
