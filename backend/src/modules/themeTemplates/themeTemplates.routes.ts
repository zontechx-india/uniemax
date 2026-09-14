import type { FastifyPluginAsync } from "fastify";
import { requireCustomer, requireSuperAdmin } from "../../package/auth/index.js";
import * as controller from "./themeTemplates.controller.js";

/**
 * Seller-facing catalogue of appearance templates. Read-only, and only ever
 * the ACTIVE rows.
 *
 * It is not on the public surface because it exists to serve the
 * store-management screens; a shopper has no use for the list, and
 * storefronts render from the store's own copied colors.
 *
 * Mounted twice, for the same reason `storeRoutes` is: the Appearance screen
 * is one component serving a seller and an admin, and it reads this list
 * either way.
 *
 *   owner → /api/v1/theme-templates               guarded here
 *   admin → /api/v1/admin/manage/theme-templates  inside `requireAdmin`
 *
 * The admin console's CRUD over the same table is separate
 * (`adminThemeTemplateRoutes`): it returns inactive rows too, which is
 * precisely what the Appearance picker must not offer.
 */
export interface ThemeTemplateRoutesOptions {
  mode: "owner" | "admin";
}

export const sellerThemeTemplateRoutes: FastifyPluginAsync<
  ThemeTemplateRoutesOptions
> = async (app, opts) => {
  if (opts.mode === "owner") {
    app.addHook("preHandler", requireCustomer);
  } else {
    // Read alongside the store-management mount it serves, so the same
    // people see the same screen (`stores.routes.ts`).
    app.addHook("preHandler", requireSuperAdmin);
  }
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
