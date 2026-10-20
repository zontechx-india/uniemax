import type { FastifyPluginAsync } from "fastify";
import { requireAdmin, requireAdminCsrf } from "../../auth/index.js";
import { idParamSchema } from "../../../utils/zodHelpers.js";
import { list, ok } from "../../../utils/response.js";
import { adminNoteSchema, adminSupplierQuery } from "../schema.js";
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
};
