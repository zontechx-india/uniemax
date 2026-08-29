import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./themeTemplates.controller.js";

/**
 * Seller-facing catalogue of appearance templates. Mounted at
 * `/api/v1/theme-templates` — read-only, and only ever the ACTIVE rows.
 *
 * It sits behind `requireCustomer` rather than on the public surface because
 * it exists to serve the store-management screens; a shopper has no use for
 * the list, and storefronts render from the store's own copied colors.
 */
export const sellerThemeTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.get("/", controller.listForSeller);
};

/**
 * Console CRUD. Registered INSIDE the `requireAdmin` subtree in `routes.ts`,
 * so no route repeats the guard.
 */
export const adminThemeTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.adminList);
  app.post("/", controller.adminCreate);
  app.get("/:id", controller.adminGet);
  app.patch("/:id", controller.adminUpdate);
  app.delete("/:id", controller.adminDelete);
};
