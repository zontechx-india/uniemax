import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { readUpload } from "../../storage/index.js";
import { requireOwnedStore, requireSupplier } from "../guards.js";
import {
  cameBackSchema,
  cantShipSchema,
  linkParam,
  orderParam,
  productParam,
  slipsQuery,
  supplierInboxQuery,
  trackingSchema,
  supplierLinkUpdateSchema,
  supplierProfileUpdateSchema,
  supplyBulkSchema,
  supplyUpdateSchema,
} from "../schema.js";
import * as orders from "../services/supplierOrders.js";
import * as views from "../services/orderViews.js";
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

  // ---- Orders to ship (Phase 4) ----------------------------------------------

  app.get("/supplier-orders", async (request) => {
    const { tab } = supplierInboxQuery.parse(request.query);
    return ok(await views.supplierInbox(request.dropshipSupplier!.id, tab));
  });

  // Registered before /:id so "slips" isn't read as an id.
  app.get("/supplier-orders/slips", async (request) => {
    const { ids } = slipsQuery.parse(request.query);
    return ok(await views.slips(request.dropshipSupplier!.id, ids));
  });

  app.get("/supplier-orders/:id", async (request) => {
    const { id } = orderParam.parse(request.params);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  app.post("/supplier-orders/:id/confirm", async (request) => {
    const { id } = orderParam.parse(request.params);
    await orders.confirm(request.dropshipSupplier!.id, id, request.customer!.id);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  app.post("/supplier-orders/:id/ship", async (request) => {
    const { id } = orderParam.parse(request.params);
    const tracking = trackingSchema.parse(request.body);
    await orders.ship(request.dropshipSupplier!.id, id, request.customer!.id, tracking);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  app.patch("/supplier-orders/:id/tracking", async (request) => {
    const { id } = orderParam.parse(request.params);
    const tracking = trackingSchema.parse(request.body);
    await orders.editTracking(request.dropshipSupplier!.id, id, request.customer!.id, tracking);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  app.post("/supplier-orders/:id/cant-ship", async (request) => {
    const { id } = orderParam.parse(request.params);
    const { reason, note } = cantShipSchema.parse(request.body);
    await orders.cantShip(request.dropshipSupplier!.id, id, request.customer!.id, reason, note);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  // Multipart with an optional `file` (the proof photo) — or an empty / JSON body.
  app.post("/supplier-orders/:id/delivered", async (request) => {
    const { id } = orderParam.parse(request.params);
    const photo = request.isMultipart() ? await readUpload(request, "image") : null;
    await orders.supplierDelivered(request.dropshipSupplier!.id, id, request.customer!.id, photo);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });

  app.post("/supplier-orders/:id/came-back", async (request) => {
    const { id } = orderParam.parse(request.params);
    const { restock } = cameBackSchema.parse(request.body);
    await orders.cameBack(request.dropshipSupplier!.id, id, request.customer!.id, restock);
    return ok(await views.supplierDetail(request.dropshipSupplier!.id, id));
  });
};
