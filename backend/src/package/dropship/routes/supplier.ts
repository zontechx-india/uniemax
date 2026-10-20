import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { requireOwnedStore, requireSupplier } from "../guards.js";
import {
  linkParam,
  productParam,
  supplierLinkUpdateSchema,
  supplierProfileUpdateSchema,
  supplyBulkSchema,
  supplyUpdateSchema,
} from "../schema.js";
import * as suppliers from "../services/suppliers.js";
import * as supply from "../services/supply.js";
import { linkTerms } from "../services/terms.js";

/** Mounted at /stores/:storeId — the supplier side; the store must be an ACTIVE supplier. */
export const supplierRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.addHook("preHandler", requireOwnedStore);
  app.addHook("preHandler", requireSupplier);

  app.get("/supplier", async (request) =>
    ok(await suppliers.getProfile(request.dropshipSupplier!.id)),
  );

  app.patch("/supplier", async (request) => {
    const input = supplierProfileUpdateSchema.parse(request.body);
    return ok(
      await suppliers.updateProfile(request.dropshipSupplier!.id, request.customer!.id, input),
    );
  });

  app.get("/sellers", async (request) =>
    ok(await suppliers.supplierSellers(request.dropshipSupplier!.id)),
  );

  app.patch("/sellers/:linkId", async (request) => {
    const { linkId } = linkParam.parse(request.params);
    const { status } = supplierLinkUpdateSchema.parse(request.body);
    await suppliers.updateLinkAsSupplier(request.dropshipSupplier!.id, linkId, status);
    return ok(await suppliers.supplierSellers(request.dropshipSupplier!.id));
  });

  app.get("/sellers/:linkId/terms", async (request) => {
    const { linkId } = linkParam.parse(request.params);
    await suppliers.assertSupplierLink(request.dropshipSupplier!.id, linkId);
    return ok(await linkTerms(linkId));
  });

  app.get("/supply", async (request) => {
    const { id, storeId } = request.dropshipSupplier!;
    return ok(await supply.listSupply(id, storeId));
  });

  app.put("/supply/:productId", async (request) => {
    const { productId } = productParam.parse(request.params);
    const input = supplyUpdateSchema.parse(request.body);
    const { id, storeId } = request.dropshipSupplier!;
    return ok(await supply.updateSupply(id, storeId, request.customer!.id, productId, input));
  });

  app.post("/supply/bulk", async (request) => {
    const input = supplyBulkSchema.parse(request.body);
    const { id, storeId } = request.dropshipSupplier!;
    return ok(await supply.bulkOffer(id, storeId, request.customer!.id, input));
  });
};
