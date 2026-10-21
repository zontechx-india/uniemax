import type { FastifyPluginAsync } from "fastify";
import { requireAdmin, requireAdminCsrf } from "../../auth/index.js";
import { idParamSchema } from "../../../utils/zodHelpers.js";
import { list, ok } from "../../../utils/response.js";
import { adminNoteSchema, adminSupplierQuery, needsActionQuery, payoutsQuery } from "../schema.js";
import * as orders from "../services/supplierOrders.js";
import * as views from "../services/orderViews.js";
import * as suppliers from "../services/suppliers.js";

/** Mounted at /api/v1/admin/dropship — inside the admin subtree its cookies are scoped to (D-29). */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAdmin);
  app.addHook("preHandler", requireAdminCsrf);

  app.get("/suppliers", async (request) => {
    const { status, page, pageSize } = adminSupplierQuery.parse(request.query);
    const { items, meta } = await suppliers.adminList(status, page, pageSize);
    return list(items, meta);
  });

  app.post("/suppliers/:id/suspend", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = adminNoteSchema.parse(request.body);
    return ok(await suppliers.adminSetStatus(id, "SUSPENDED", note));
  });

  app.post("/suppliers/:id/restore", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = adminNoteSchema.parse(request.body);
    return ok(await suppliers.adminSetStatus(id, "ACTIVE", note));
  });

  // Needs action: everything a person has to look at (Phase 4).
  app.get("/needs-action", async (request) => {
    const { kind, page } = needsActionQuery.parse(request.query);
    const { items, meta } = await views.needsAction(kind, page);
    return list(items, meta);
  });

  // Payouts: every order paid by Easy Split (sandbox or live) and where its split stands. Read-only.
  app.get("/payouts", async (request) => {
    const { page } = payoutsQuery.parse(request.query);
    const { items, meta } = await views.adminPayouts(page);
    return list(items, meta);
  });

  app.post("/needs-action/:id/resolve", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = adminNoteSchema.parse(request.body);
    await orders.resolve(id, request.admin!.id, note);
    return ok({ resolved: true });
  });
};
