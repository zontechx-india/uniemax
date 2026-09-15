import type { FastifyPluginAsync } from "fastify";
import { requireAdmin, requireAdminCsrf } from "../../auth/index.js";
import { idParamSchema, paginationQuery } from "../../../utils/zodHelpers.js";
import { list, ok } from "../../../utils/response.js";
import { deps } from "../deps.js";
import {
  adminAffiliateUpdateSchema,
  adminCommissionUpdateSchema,
  commissionListQuery,
} from "../schema.js";
import * as partner from "../services/partner.js";
import * as commissions from "../services/commissions.js";

/** Mounted at /admin — platform oversight, not a seller's programme. */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAdmin);
  app.addHook("preHandler", requireAdminCsrf);

  app.get("/affiliates", async (request) => {
    const { page, pageSize } = paginationQuery.parse(request.query);
    const { items, meta } = await partner.adminList(page, pageSize);
    return list(items, meta);
  });

  app.patch("/affiliates/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { status } = adminAffiliateUpdateSchema.parse(request.body);
    return ok(await partner.adminSetStatus(id, status));
  });

  app.get("/commissions", async (request) => {
    const query = commissionListQuery.parse(request.query);
    const { items, meta } = await commissions.listCommissions({}, query);
    return list(items, meta);
  });

  app.patch("/commissions/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { status, note } = adminCommissionUpdateSchema.parse(request.body);
    return ok(await commissions.adminUpdate(id, status, note));
  });

  app.get("/fraud-events", async () =>
    ok(
      await deps.prisma.affiliateFraudEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ),
  );

  // Runs the approval pass on demand — handy while testing the hold period.
  app.post("/jobs/approve", async () =>
    ok({ approved: await commissions.approveMatured() }),
  );
};
