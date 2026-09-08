import type { FastifyPluginAsync } from "fastify";
import * as controller from "./category.controller.js";

/**
 * Customer- and seller-facing category browsing. Mounted at /api/v1/categories
 *
 * Unauthenticated on purpose: the taxonomy is global, public reference data,
 * and the seller product form needs it before anything is saved. Only ACTIVE
 * branches are ever returned here.
 *
 * `/tree`, `/search` and `/children` are declared before `/:slug` for
 * readability — Fastify matches static segments ahead of parametric ones
 * regardless of order, so none of them can be swallowed by `/:slug`.
 */
export const publicCategoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.publicListCategories);
  app.get("/tree", controller.publicCategoryTree);
  app.get("/search", controller.publicCategorySearch);
  app.get("/children", controller.publicCategoryChildren);
  app.get("/:slug", controller.publicGetCategory);
};

/**
 * Admin category management. Mounted at /api/v1/admin/categories inside the
 * `requireAdmin` subtree in routes.ts — every route here is admin-only.
 * Sellers never write to the global taxonomy; they only tag their shelves and
 * products against it (a seller-facing suggestion workflow is separate and
 * not yet built).
 */
export const adminCategoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.adminListCategories);
  app.get("/tree", controller.adminCategoryTree);
  app.get("/search", controller.adminCategorySearch);
  app.get("/children", controller.adminCategoryChildren);
  app.post("/", controller.adminCreateCategory);
  app.get("/:id", controller.adminGetCategory);
  app.patch("/:id", controller.adminUpdateCategory);
  app.delete("/:id", controller.adminDeleteCategory);
};
