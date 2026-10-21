import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { requireOwnedStore, requireSellingStore } from "../guards.js";
import {
  accountParam,
  catalogQuery,
  inviteCreateSchema,
  inviteParam,
  linkParam,
  paymentParam,
  paymentSchema,
  resaleAddSchema,
  resaleOptionSchema,
  resaleParam,
  resaleUpdateSchema,
  problemSchema,
  sellerLinkUpdateSchema,
  sellerPartParam,
  sellerOrderParam,
  sellerShipmentsQuery,
} from "../schema.js";
import { z } from "zod";
import * as catalog from "../services/catalog.js";
import * as resales from "../services/resale.js";
import * as invites from "../services/invites.js";
import * as orders from "../services/supplierOrders.js";
import * as statement from "../services/statement.js";
import * as views from "../services/orderViews.js";
import * as suppliers from "../services/suppliers.js";
import { linkTerms } from "../services/terms.js";

/** Mounted at /stores/:storeId — the seller side; acts on one store the caller owns. */
export const sellerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.addHook("preHandler", requireOwnedStore);
  app.addHook("preHandler", requireSellingStore);

  /** Whether this store supplies and/or has suppliers — drives the nav. */
  app.get("/role", async (request) => ok(await suppliers.storeRole(request.dropshipStore!.id)));

  app.get("/suppliers", async (request) =>
    ok(await suppliers.sellerOverview(request.dropshipStore!.id)),
  );

  app.post("/supplier-invites", async (request, reply) => {
    const input = inviteCreateSchema.parse(request.body);
    const result = await invites.createInvite(request.dropshipStore!, request.customer!.id, input);
    return reply.status(201).send(ok(result));
  });

  app.post("/supplier-invites/:id/resend", async (request) => {
    const { id } = inviteParam.parse(request.params);
    return ok(await invites.resendInvite(request.dropshipStore!, id));
  });

  app.post("/supplier-invites/:id/revoke", async (request) => {
    const { id } = inviteParam.parse(request.params);
    await invites.revokeInvite(request.dropshipStore!.id, id);
    return ok({ revoked: true });
  });

  app.patch("/suppliers/:linkId", async (request) => {
    const { linkId } = linkParam.parse(request.params);
    const input = sellerLinkUpdateSchema.parse(request.body);
    return ok(
      await suppliers.updateLinkAsSeller(request.dropshipStore!, linkId, request.customer!.id, input),
    );
  });

  // ---- Supplier products (Phase 3) ----------------------------------------

  app.get("/catalog", async (request) =>
    ok(await catalog.browseCatalog(request.dropshipStore!.id, catalogQuery.parse(request.query))),
  );

  app.get("/resales", async (request) => {
    const { productId } = z.object({ productId: z.string().min(1).optional() }).parse(request.query);
    return ok(await resales.listResales(request.dropshipStore!.id, productId));
  });

  app.post("/resales", async (request, reply) => {
    const input = resaleAddSchema.parse(request.body);
    const result = await resales.addResales(request.dropshipStore!, request.customer!.id, input);
    return reply.status(201).send(ok(result));
  });

  app.patch("/resales/:id", async (request) => {
    const { id } = resaleParam.parse(request.params);
    const { followCost } = resaleUpdateSchema.parse(request.body);
    return ok(await resales.setFollow(request.dropshipStore!.id, id, followCost));
  });

  app.post("/resales/:id/refresh", async (request) => {
    const { id } = resaleParam.parse(request.params);
    return ok(await resales.refreshResale(request.dropshipStore!, id));
  });

  app.post("/resales/:id/options", async (request) => {
    const { id } = resaleParam.parse(request.params);
    const { supplyVariantId, price } = resaleOptionSchema.parse(request.body);
    return ok(await resales.addResaleOption(request.dropshipStore!.id, id, supplyVariantId, price));
  });

  app.post("/resales/:id/fix-price", async (request) => {
    const { id } = resaleParam.parse(request.params);
    return ok(await resales.fixPrices(request.dropshipStore!.id, id));
  });

  app.delete("/resales/:id", async (request) => {
    const { id } = resaleParam.parse(request.params);
    await resales.removeResale(request.dropshipStore!.id, id);
    return ok({ removed: true });
  });

  app.get("/suppliers/:linkId/terms", async (request) => {
    const { linkId } = linkParam.parse(request.params);
    await suppliers.assertSellerLink(request.dropshipStore!.id, linkId);
    return ok(await linkTerms(linkId));
  });

  // ---- Supplier parts of orders (Phase 4) -------------------------------------

  app.get("/orders/:orderId/parts", async (request) => {
    const { orderId } = sellerOrderParam.parse(request.params);
    return ok(await views.sellerParts(request.dropshipStore!.id, orderId));
  });

  app.post("/orders/:orderId/parts/:id/delivered", async (request) => {
    const { orderId, id } = sellerPartParam.parse(request.params);
    await orders.sellerDelivered(request.dropshipStore!.id, orderId, id, request.customer!.id);
    return ok(await views.sellerParts(request.dropshipStore!.id, orderId));
  });

  app.post("/orders/:orderId/parts/:id/problem", async (request) => {
    const { orderId, id } = sellerPartParam.parse(request.params);
    const { note } = problemSchema.parse(request.body);
    const store = request.dropshipStore!;
    await orders.reportProblem(store.id, request.customer!.id, orderId, id, note);
    return ok(await views.sellerParts(store.id, orderId));
  });

  app.get("/shipments", async (request) => {
    const query = sellerShipmentsQuery.parse(request.query);
    return ok(await views.sellerShipments(request.dropshipStore!.id, query));
  });

  // ---- The account with one supplier (Phase 5) ---------------------------------

  app.get("/suppliers/:linkId/account", async (request) => {
    const { linkId } = accountParam.parse(request.params);
    const ctx = await statement.sellerContext(request.dropshipStore!.id, linkId);
    return ok(await statement.getAccount(ctx, request.customer!.id));
  });

  app.post("/suppliers/:linkId/payments", async (request) => {
    const { linkId } = accountParam.parse(request.params);
    const input = paymentSchema.parse(request.body);
    const ctx = await statement.sellerContext(request.dropshipStore!.id, linkId);
    return ok(await statement.recordPayment(ctx, request.customer!.id, input));
  });

  app.delete("/suppliers/:linkId/payments/:paymentId", async (request) => {
    const { linkId, paymentId } = paymentParam.parse(request.params);
    const ctx = await statement.sellerContext(request.dropshipStore!.id, linkId);
    return ok(await statement.deletePayment(ctx, request.customer!.id, paymentId));
  });
};
