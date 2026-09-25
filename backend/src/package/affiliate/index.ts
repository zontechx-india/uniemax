import type { FastifyInstance } from "fastify";
import { deps } from "./deps.js";
import { startJobs, subscribe } from "./events.js";
import { adminRoutes } from "./routes/admin.js";
import { partnerRoutes } from "./routes/partner.js";
import { publicRoutes } from "./routes/public.js";
import { sellerRoutes } from "./routes/seller.js";
import type { AffiliateDeps } from "./types.js";

/**
 * PUBLIC facade of the affiliate package — the only file the app imports.
 *
 * Wires the package into a host: the Prisma client it should use, and an
 * `AffiliateHost` that answers for the platform (stores, products, orders,
 * mail). Mounts every affiliate route under /api/v1/affiliate and subscribes
 * to the order events that drive commissions. See docs/AFFILIATE.md.
 */
export async function registerAffiliate(
  app: FastifyInstance,
  options: AffiliateDeps,
): Promise<void> {
  Object.assign(deps, options);
  subscribe();
  const stopJobs = startJobs(app.log);
  app.addHook("onClose", async () => stopJobs());

  await app.register(
    async (affiliate) => {
      await affiliate.register(partnerRoutes, { prefix: "/me" });
      await affiliate.register(sellerRoutes, { prefix: "/seller/stores/:storeId" });
      await affiliate.register(publicRoutes, { prefix: "/public" });
    },
    { prefix: "/api/v1/affiliate" },
  );
  // Platform oversight lives INSIDE the admin API subtree, not under
  // /api/v1/affiliate: the admin session cookies are path-scoped to
  // /api/v1/admin, so a browser never sent them to /api/v1/affiliate/admin
  // and the admin Affiliates page could only ever answer 401.
  await app.register(adminRoutes, { prefix: "/api/v1/admin/affiliate" });
}

export { createInProcessHost } from "./hosts/inProcess.js";
export type { AffiliateHost } from "./types.js";
