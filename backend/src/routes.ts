import type { FastifyInstance } from "fastify";
import { authRoutes, adminAuthRoutes, requireAdmin } from "./package/auth/index.js";
import { mediaRules } from "./package/storage/index.js";
import { ok } from "./utils/response.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import {
  publicCategoryRoutes,
  adminCategoryRoutes,
} from "./modules/category/category.routes.js";
import {
  publicProductRoutes,
  adminProductRoutes,
} from "./modules/product/product.routes.js";
import { storeRoutes, publicStoreRoutes } from "./modules/stores/stores.routes.js";
import { publicDiscoveryRoutes } from "./modules/discovery/discovery.routes.js";
import { addressRoutes } from "./modules/addresses/addresses.routes.js";
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
      await api.register(publicProductRoutes, { prefix: "/products" });
      // Customer-owned stores (guarded inside the plugin — requireCustomer).
      await api.register(storeRoutes, { prefix: "/stores" });
      // Customer address book (guarded inside the plugin — requireCustomer).
      await api.register(addressRoutes, { prefix: "/addresses" });
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
            await guarded.register(adminCategoryRoutes, { prefix: "/categories" });
            await guarded.register(adminProductRoutes, { prefix: "/products" });
            // Notification feed + broadcast for the admin principal.
            await guarded.register(adminNotificationRoutes, {
              prefix: "/notifications",
            });
            // Support ticket queue — the platform team's side of the threads
            // sellers raise from their stores.
            await guarded.register(adminSupportRoutes, { prefix: "/support" });
            // The platform console (dashboard, stores, customers, orders,
            // payments, catalog oversight, audit trail, admin accounts).
            await guarded.register(adminConsoleRoutes);
          });
        },
        { prefix: "/admin" },
      );
    },
    { prefix: "/api/v1" },
  );
}
