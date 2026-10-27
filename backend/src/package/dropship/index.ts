import type { FastifyInstance } from "fastify";
import { ok } from "../../utils/response.js";
import { requireCustomer } from "../auth/index.js";
import { ownedSupplierStores } from "./services/suppliers.js";
import { deps } from "./deps.js";
import { startJobs, subscribe } from "./events.js";
import { registerHooks } from "./hooks.js";
import { adminRoutes } from "./routes/admin.js";
import { inviteRoutes } from "./routes/invite.js";
import { sellerRoutes } from "./routes/seller.js";
import { supplierRoutes } from "./routes/supplier.js";
import type { DropshipDeps } from "./types.js";

/**
 * PUBLIC facade of the dropship package — the only file the app imports, and
 * only when `DROPSHIP_ENABLED=true` (D-15). Mounts every route under
 * /api/v1/dropship and the admin screens under /api/v1/admin/dropship.
 * Design and status: docs/dropshipping/.
 */
export async function registerDropship(
  app: FastifyInstance,
  options: DropshipDeps,
): Promise<void> {
  Object.assign(deps, options);
  registerHooks();
  subscribe();
  const stopJobs = startJobs(app.log);
  app.addHook("onClose", async () => stopJobs());

  await app.register(
    async (dropship) => {
      // The frontend shows the Suppliers screens only when this answers (D-30).
      dropship.get("/status", async () => ok({ enabled: true }));
      // Which of the caller's stores are supplier accounts — the "My shops" list (D-54).
      dropship.get("/my-stores", { preHandler: requireCustomer }, async (request) =>
        ok(await ownedSupplierStores(request.customer!.id)),
      );
      await dropship.register(inviteRoutes, { prefix: "/invites" });
      await dropship.register(sellerRoutes, { prefix: "/stores/:storeId" });
      await dropship.register(supplierRoutes, { prefix: "/stores/:storeId" });
    },
    { prefix: "/api/v1/dropship" },
  );
  await app.register(adminRoutes, { prefix: "/api/v1/admin/dropship" });
}

export { dropshipConfig } from "./config.js";
export { createInProcessHost } from "./hosts/inProcess.js";
export type { DropshipHost } from "./types.js";
