import type { FastifyPluginAsync, onResponseHookHandler } from "fastify";
import { requireCustomer, requireSuperAdmin } from "../../package/auth/index.js";
import * as controller from "./stores.controller.js";
import * as catalogController from "./storeCatalog.controller.js";
import * as bankController from "./storeBank.controller.js";
import * as bannerController from "./storeBanner.controller.js";
import * as publicController from "./publicStore.controller.js";
import * as ordersController from "../orders/orders.controller.js";
import { storeOwnerSupportRoutes } from "../support/support.routes.js";
import { prisma } from "../../config/prisma.js";
import { recordAudit } from "../admin/adminAudit.js";

/**
 * Store management. `:id` accepts the store's id or slug.
 *
 * This ONE plugin is mounted twice (see `routes.ts`):
 *
 *   owner → /api/v1/stores               guarded here by `requireCustomer`,
 *                                        scoped to the caller's own stores
 *   admin → /api/v1/admin/manage/stores  already inside the `requireAdmin`
 *                                        subtree, scoped to every store
 *
 * Which one is running decides only WHO the actor is (`storeActor`) and how
 * `storeScope` resolves a store — the handlers, validation and business rules
 * are literally the same code, so a rule can never hold for a seller and not
 * for support fixing that seller's shop.
 *
 * `mode` also decides which endpoints exist at all. Four groups are owner-only
 * and are simply never registered on the admin mount:
 *
 *   - "my stores" list + create — no admin meaning;
 *   - payout bank accounts — the one capability support must never have
 *     (see `assertOwner` in `storeBank.service.ts`, the second lock);
 *   - the business profile — the seller's own declaration of their legal
 *     identity and tax registration, not support's to restate for them;
 *   - both support inboxes — every message there carries the seller's
 *     identity, so an admin writing into one would appear to be the seller.
 *     Admins have their own side of those threads under /api/v1/admin/support.
 *
 * The common thread: an admin may fix what a shop SELLS and how it LOOKS, but
 * not who it legally is, where its money goes, or what it says to people in
 * the seller's name.
 */
export interface StoreRoutesOptions {
  /** "owner" = the seller's own mount; "admin" = platform support's mount. */
  mode: "owner" | "admin";
}

export const storeRoutes: FastifyPluginAsync<StoreRoutesOptions> = async (
  app,
  opts,
) => {
  const isAdmin = opts.mode === "admin";

  if (!isAdmin) {
    app.addHook("preHandler", requireCustomer);
    app.get("/", controller.listStores);
    app.post("/", controller.createStore);
  } else {
    // Editing a seller's shop in their name is the narrowest capability on
    // the platform, so it is held to the smallest set of people. Most of the
    // console is open to any staff account (`requireAdmin`); this mount is
    // not. A plain ADMIN keeps read-only oversight, suspension and blocking.
    app.addHook("preHandler", requireSuperAdmin);
    // Every successful write through the admin mount lands in the audit
    // trail. Registered as a hook rather than per-handler so a route added
    // later is covered without anyone remembering to log it.
    app.addHook("onResponse", auditAdminStoreWrite);
  }
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
  //
  // Owner mount only: a message posted here is attributed to the seller, so
  // an admin using it would be writing to a shopper (or to UnieMax) in the
  // seller's name. Admins read and answer the platform side of those threads
  // through /api/v1/admin/support instead.
  if (!isAdmin) {
    await app.register(storeOwnerSupportRoutes, { prefix: "/:id/support" });
  }
  app.get("/:id", controller.getStore);
  app.patch("/:id", controller.updateStore);
  app.patch("/:id/theme", controller.updateStoreTheme);
  app.patch("/:id/homepage", controller.updateStoreHomepage);
  app.patch("/:id/footer", controller.updateStoreFooter);
  // Business identity — legal/trading name, the accountable seller, the
  // registered address, PAN/GSTIN. Owner mount only: this is the seller's own
  // declaration of who they legally are, and what the platform holds them to.
  // Correcting a product listing for someone is support; restating their legal
  // identity for them is not, and must not be something they can later
  // disown. Admins read these fields on the console's store detail page.
  if (!isAdmin) {
    app.patch("/:id/profile", controller.updateStoreProfile);
  }
  app.patch("/:id/payments", controller.updateStorePayments);
  app.patch("/:id/shipping", controller.updateStoreShipping);
  app.patch("/:id/checkout", controller.updateStoreCheckout);
  app.patch("/:id/publish", controller.setStorePublished);
  // Logo — multipart upload to the dedicated logo bucket. Replace only: a
  // store's logo is mandatory (set at creation), so there is no delete.
  app.put("/:id/logo", controller.updateStoreLogo);

  // Storefront banners — the homepage promo carousel. Create and image
  // replacement are multipart (the file plus its metadata); everything else
  // is JSON. Every mutation answers with the store's full banner list.
  app.get("/:id/banners", bannerController.listBanners);
  app.post("/:id/banners", bannerController.createBanner);
  // Before "/:bannerId", so "order" is never read as a banner id.
  app.patch("/:id/banners/order", bannerController.reorderBanners);
  app.patch("/:id/banners/:bannerId", bannerController.updateBanner);
  app.put("/:id/banners/:bannerId/image", bannerController.replaceBannerImage);
  app.delete("/:id/banners/:bannerId", bannerController.deleteBanner);

  // Payout bank accounts — several per store, exactly one primary (the
  // payout target). Verification (third-party + admin) is provisioned in
  // the model; those endpoints arrive with the payments/admin modules.
  //
  // Owner mount only, and deliberately so: this is where a store's money
  // lands, the highest-value target on the platform, and no support task
  // needs to change it. `assertOwner` in the service refuses an admin actor
  // as well, so this stays closed even if someone registers it here later.
  // Admins verify (never edit) accounts via /api/v1/admin/stores/:id/...
  if (!isAdmin) {
    app.get("/:id/bank-accounts", bankController.listBankAccounts);
    app.post("/:id/bank-accounts", bankController.createBankAccount);
    app.patch("/:id/bank-accounts/:accountId", bankController.updateBankAccount);
    app.delete("/:id/bank-accounts/:accountId", bankController.deleteBankAccount);
  }

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

  // Product groups — the "Other products" option mode: a family of separate
  // products that are the same item on one axis (Colour). Replaced as a set,
  // like options; the candidates list feeds the picker; copy makes the next
  // member as a draft twin of this one.
  app.put(
    "/:id/products/:productId/groups",
    catalogController.replaceProductGroups,
  );
  app.get(
    "/:id/products/:productId/group-candidates",
    catalogController.listGroupCandidates,
  );
  app.post("/:id/products/:productId/copy", catalogController.copyProduct);

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

/**
 * Records every successful write made through the ADMIN mount.
 *
 * Runs as `onResponse`, so it sees the outcome and can skip failed attempts,
 * and costs the caller nothing — the response has already been sent. The
 * store ref in the URL may be an id or a slug, so it is resolved to the
 * canonical id: the Activity page filters by `entityId`, and a trail where
 * the same store appears under two identifiers is a trail nobody can search.
 *
 * `recordAudit` is fire-and-forget by design (an audit write must never fail
 * the action it describes); the lookup here is wrapped for the same reason.
 */
const auditAdminStoreWrite: onResponseHookHandler = async (request, reply) => {
  if (request.method === "GET") return;
  if (reply.statusCode >= 400) return;

  const storeRef = (request.params as { id?: string } | undefined)?.id;
  if (!storeRef) return;

  const store = await prisma.store
    .findFirst({
      where: { OR: [{ id: storeRef }, { slug: storeRef }] },
      select: { id: true, name: true },
    })
    .catch(() => null);

  recordAudit(request, {
    action: "store.manage",
    entityType: "store",
    entityId: store?.id ?? storeRef,
    meta: {
      method: request.method,
      route: request.routeOptions.url ?? request.url,
      statusCode: reply.statusCode,
      ...(store ? { storeName: store.name } : {}),
    },
  });
};
