import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./stores.controller.js";
import * as catalogController from "./storeCatalog.controller.js";
import * as bankController from "./storeBank.controller.js";
import * as publicController from "./publicStore.controller.js";
import * as ordersController from "../orders/orders.controller.js";
import { storeOwnerSupportRoutes } from "../support/support.routes.js";

/**
 * Customer-owned stores. Mounted at /api/v1/stores — every route requires a
 * signed-in customer and only ever touches that customer's own stores.
 * `:id` accepts the store's id or slug.
 */
export const storeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);

  app.get("/", controller.listStores);
  app.post("/", controller.createStore);
  // Seller dashboard — order counters + latest orders for one store.
  app.get("/:id/dashboard", ordersController.getStoreDashboard);
  // Seller order management — list/detail, forward status progression
  // (confirm → pack → ship → deliver) and cancellation (restores stock).
  app.get("/:id/orders", ordersController.listStoreOrders);
  app.get("/:id/orders/:orderId", ordersController.getStoreOrder);
  app.patch("/:id/orders/:orderId/status", ordersController.updateStoreOrderStatus);
  app.post("/:id/orders/:orderId/cancel", ordersController.cancelStoreOrder);
  // Customer support — the shop's own inbox: threads shoppers opened with
  // this store. (Its Help & Support *with UnieMax* is /api/v1/support.)
  await app.register(storeOwnerSupportRoutes, { prefix: "/:id/support" });
  app.get("/:id", controller.getStore);
  app.patch("/:id", controller.updateStore);
  app.patch("/:id/theme", controller.updateStoreTheme);
  app.patch("/:id/homepage", controller.updateStoreHomepage);
  app.patch("/:id/footer", controller.updateStoreFooter);
  app.patch("/:id/profile", controller.updateStoreProfile);
  app.patch("/:id/payments", controller.updateStorePayments);
  app.patch("/:id/shipping", controller.updateStoreShipping);
  app.patch("/:id/checkout", controller.updateStoreCheckout);
  app.patch("/:id/publish", controller.setStorePublished);
  // Logo — multipart upload to the dedicated logo bucket. Replace only: a
  // store's logo is mandatory (set at creation), so there is no delete.
  app.put("/:id/logo", controller.updateStoreLogo);

  // Payout bank accounts — several per store, exactly one primary (the
  // payout target). Verification (third-party + admin) is provisioned in
  // the model; those endpoints arrive with the payments/admin modules.
  app.get("/:id/bank-accounts", bankController.listBankAccounts);
  app.post("/:id/bank-accounts", bankController.createBankAccount);
  app.patch("/:id/bank-accounts/:accountId", bankController.updateBankAccount);
  app.delete("/:id/bank-accounts/:accountId", bankController.deleteBankAccount);

  // Store catalog — Store → Category → Subcategory (optional) → Product →
  // Option types → Variants. Categories must exist before products can be
  // added (product creation requires a category — root or subcategory — of
  // the same store). Variants are the cartesian product of the option types
  // and change only as a set, through the options PUT; per-variant PATCH is
  // for price / stock / on-off alone.
  app.get("/:id/categories", catalogController.listCategories);
  app.post("/:id/categories", catalogController.createCategory);
  app.patch("/:id/categories/:categoryId", catalogController.updateCategory);
  app.delete("/:id/categories/:categoryId", catalogController.deleteCategory);
  app.get("/:id/products", catalogController.listProducts);
  app.post("/:id/products", catalogController.createProduct);
  app.patch("/:id/products/:productId", catalogController.updateProduct);
  app.delete("/:id/products/:productId", catalogController.deleteProduct);
  app.put(
    "/:id/products/:productId/options",
    catalogController.replaceProductOptions,
  );
  app.patch(
    "/:id/products/:productId/variants/:variantId",
    catalogController.updateVariant,
  );

  // Product media — up to 8 images + 1 video; first image = cover. Uploads
  // are multipart; every mutation returns the full parent product.
  app.post("/:id/products/:productId/media", catalogController.addProductMedia);
  app.put(
    "/:id/products/:productId/media/order",
    catalogController.reorderProductMedia,
  );
  app.patch(
    "/:id/products/:productId/media/:mediaId",
    catalogController.updateProductMedia,
  );
  app.put(
    "/:id/products/:productId/media/:mediaId/file",
    catalogController.replaceProductMediaFile,
  );
  app.delete(
    "/:id/products/:productId/media/:mediaId",
    catalogController.deleteProductMedia,
  );
};

/**
 * Public storefront. Mounted at /api/v1/public/stores — no auth required;
 * only published stores are ever returned (unpublished → 404), with one
 * exception: a signed-in customer viewing their OWN unpublished store gets it
 * served as a draft preview (the controller resolves the session best-effort).
 *
 * Split by page so a large catalog is never shipped in one payload: the shell
 * carries branding + the category tree, and products are queried per page with
 * server-side filtering, sorting and pagination.
 */
export const publicStoreRoutes: FastifyPluginAsync = async (app) => {
  // Marketplace index — published stores, newest publish first (homepage
  // "New Stores" rail). Static path registered before the :slug matcher.
  app.get("/", publicController.listStores);
  app.get("/:slug", publicController.getStore);
  app.get("/:slug/home", publicController.getHome);
  app.get("/:slug/products", publicController.listProducts);
  app.get("/:slug/products/:productSlug", publicController.getProduct);
  app.get("/:slug/categories/:categorySlug", publicController.getCategory);
  // Delivery-area check — the product page (customer's default address) and
  // the checkout (chosen address) ask whether products reach one pincode.
  app.get("/:slug/delivery-check", publicController.checkDelivery);
};
