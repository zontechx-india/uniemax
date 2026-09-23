import type { FastifyInstance } from "fastify";
import {
  authRoutes,
  adminAuthRoutes,
  requireAdmin,
  requireAdminCsrf,
} from "./package/auth/index.js";
import { mediaRules } from "./package/storage/index.js";
import { ok } from "./utils/response.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import {
  publicCategoryRoutes,
  adminCategoryRoutes,
} from "./modules/category/category.routes.js";
import { storeRoutes, publicStoreRoutes } from "./modules/stores/stores.routes.js";
import {
  sellerThemeTemplateRoutes,
  adminThemeTemplateRoutes,
} from "./modules/themeTemplates/themeTemplates.routes.js";
import { publicDiscoveryRoutes } from "./modules/discovery/discovery.routes.js";
import { publicSeoRoutes } from "./modules/seo/seo.routes.js";
import {
  adminBannerRoutes,
  publicBannerRoutes,
} from "./modules/banners/banners.routes.js";
import { addressRoutes } from "./modules/addresses/addresses.routes.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import {
  publicOrderRoutes,
  customerOrderRoutes,
} from "./modules/orders/orders.routes.js";
import { paymentRoutes } from "./modules/payments/payments.routes.js";
import { adminConsoleRoutes } from "./modules/admin/admin.routes.js";
import {
  adminNotificationRoutes,
  customerNotificationRoutes,
  publicPushRoutes,
} from "./modules/notifications/notifications.routes.js";
import {
  adminSupportRoutes,
  customerSupportRoutes,
  publicSupportRoutes,
} from "./modules/support/support.routes.js";

/**
 * Central route registrar.
 *
 * Root-level probes (health) live outside the versioned namespace so
 * monitoring URLs stay stable. Everything else mounts under /api/v1, split
 * into public (customer) and admin surfaces.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Infrastructure / probes — no version prefix.
  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      // ---- Public (customer) ------------------------------------------
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(publicCategoryRoutes, { prefix: "/categories" });
      // Customer-owned stores (guarded inside the plugin — requireCustomer).
      await api.register(storeRoutes, { prefix: "/stores", mode: "owner" });
      // Curated storefront palettes a seller applies from Appearance —
      // active templates only (guarded inside the plugin — requireCustomer).
      await api.register(sellerThemeTemplateRoutes, {
        prefix: "/theme-templates",
        mode: "owner",
      });
      // Customer address book (guarded inside the plugin — requireCustomer).
      await api.register(addressRoutes, { prefix: "/addresses" });
      // Durable cart for signed-in customers (guarded — requireCustomer).
      // Guests shop from a localStorage cart that is merged in at sign-in.
      await api.register(cartRoutes, { prefix: "/cart" });
      // Customer order history (guarded inside the plugin — requireCustomer).
      await api.register(customerOrderRoutes, { prefix: "/orders" });
      // Notification feed + push subscriptions (guarded — requireCustomer).
      await api.register(customerNotificationRoutes, { prefix: "/notifications" });
      // Support tickets raised from a store's Support section (requireCustomer).
      await api.register(customerSupportRoutes, { prefix: "/support" });
      // How to reach support without opening a ticket — public by definition.
      await api.register(publicSupportRoutes, { prefix: "/public" });
      // VAPID public key — public by definition (browsers subscribe with it).
      await api.register(publicPushRoutes, { prefix: "/public" });
      // Public storefront pages by slug (published stores only, no auth).
      await api.register(publicStoreRoutes, { prefix: "/public/stores" });
      // Order placement + confirmation lookup (guest checkout, same prefix).
      await api.register(publicOrderRoutes, { prefix: "/public/stores" });
      // Marketplace discovery — global search + platform stats (homepage).
      await api.register(publicDiscoveryRoutes, { prefix: "/public" });
      // XML sitemaps for the storefronts. Under /public so the existing nginx
      // /api proxy serves them without a new location block on every vhost —
      // frontend/public/robots.txt points a crawler at the index.
      await api.register(publicSeoRoutes, { prefix: "/public" });
      // Marketplace homepage banners — anonymous read of the active set.
      await api.register(publicBannerRoutes, { prefix: "/public/banners" });
      // Payment gateway callbacks (Cashfree webhook — signature-guarded).
      await api.register(paymentRoutes, { prefix: "/payments" });

      // Upload rules (max sizes + allowed types) — read by clients so their
      // hints and pre-upload validation always match the server's env config.
      api.get("/public/media-config", async () =>
        ok(
          Object.fromEntries(
            Object.entries(mediaRules).map(([kind, rule]) => [
              kind,
              { maxMB: rule.maxMB, contentTypes: rule.contentTypes },
            ]),
          ),
        ),
      );

      // ---- Admin ------------------------------------------------------
      await api.register(
        async (admin) => {
          // Auth is public (login) / self-guarded (me).
          await admin.register(adminAuthRoutes, { prefix: "/auth" });

          // Everything else under /admin requires a valid admin token.
          await admin.register(async (guarded) => {
            guarded.addHook("preHandler", requireAdmin);
            // Second layer under SameSite=Lax for cookie-authenticated
            // mutations. Skips safe methods and bearer clients — see
            // `requireAdminCsrf`. The console's HTTP client already echoes
            // the `um_admin_csrf` cookie on every non-GET, so this is
            // transparent to it.
            guarded.addHook("preHandler", requireAdminCsrf);
            await guarded.register(adminCategoryRoutes, { prefix: "/categories" });
            // Notification feed + broadcast for the admin principal.
            await guarded.register(adminNotificationRoutes, {
              prefix: "/notifications",
            });
            // Support ticket queue — the platform team's side of the threads
            // sellers raise from their stores.
            await guarded.register(adminSupportRoutes, { prefix: "/support" });
            // Marketplace homepage banners — the platform's own carousel,
            // distinct from the per-store banners sellers manage.
            await guarded.register(adminBannerRoutes, { prefix: "/banners" });
            // Store appearance templates — the palettes sellers pick from.
            await guarded.register(adminThemeTemplateRoutes, {
              prefix: "/theme-templates",
            });
            // The platform console (dashboard, stores, customers, orders,
            // payments, catalog oversight, audit trail, admin accounts).
            await guarded.register(adminConsoleRoutes);
            // Store management ON BEHALF OF A SELLER — the SAME plugin that
            // serves /stores, mounted a second time with an admin actor so
            // support can fix a seller's catalog or storefront without a
            // parallel implementation that could drift from the seller's.
            // Payout accounts, the support inboxes and store creation are
            // not registered on this mount; every write here is audited.
            // Registered after adminConsoleRoutes so the static "manage"
            // segment cannot be swallowed by its "/stores/:id".
            await guarded.register(storeRoutes, {
              prefix: "/manage/stores",
              mode: "admin",
            });
            // The Appearance screen inside that mount reads the seller's
            // template list, so it is served here too — active rows only,
            // unlike the console CRUD above.
            await guarded.register(sellerThemeTemplateRoutes, {
              prefix: "/manage/theme-templates",
              mode: "admin",
            });
          });
        },
        { prefix: "/admin" },
      );
    },
    { prefix: "/api/v1" },
  );
}
