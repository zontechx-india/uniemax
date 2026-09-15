import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { idParamSchema } from "../../../utils/zodHelpers.js";
import { list, ok } from "../../../utils/response.js";
import { deps } from "../deps.js";
import {
  commissionListQuery,
  inviteCreateSchema,
  partnerUpdateSchema,
  productListQuery,
  productRuleSchema,
  programUpdateSchema,
  storeParam,
} from "../schema.js";
import * as program from "../services/program.js";
import * as invitations from "../services/invitations.js";
import * as commissions from "../services/commissions.js";

/** Mounted at /seller/stores/:storeId — everything here acts on one store the caller owns. */
export const sellerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);

  const ownedStore = (request: FastifyRequest) => {
    const { storeId } = storeParam.parse(request.params);
    return deps.host.getOwnedStore(request.customer!.id, storeId);
  };

  app.get("/summary", async (request) => {
    const store = await ownedStore(request);
    return ok(await program.summary(store.id));
  });

  app.get("/program", async (request) => {
    const store = await ownedStore(request);
    return ok(await program.getProgram(store.id));
  });

  app.patch("/program", async (request) => {
    const store = await ownedStore(request);
    const input = programUpdateSchema.parse(request.body);
    return ok(await program.updateProgram(store.id, input));
  });

  app.get("/products", async (request) => {
    const store = await ownedStore(request);
    const query = productListQuery.parse(request.query);
    const { items, meta } = await program.listProducts(store.id, query);
    return list(items, meta);
  });

  app.patch("/products/:productId", async (request) => {
    const store = await ownedStore(request);
    const { productId } = request.params as { productId: string };
    const input = productRuleSchema.parse(request.body);
    return ok(await program.updateProductRule(store.id, productId, input));
  });

  app.get("/invitations", async (request) => {
    const store = await ownedStore(request);
    return ok(await invitations.listInvites(store.id));
  });

  app.post("/invitations", async (request, reply) => {
    const store = await ownedStore(request);
    const input = inviteCreateSchema.parse(request.body);
    return reply.status(201).send(ok(await invitations.createInvite(store, input)));
  });

  app.delete("/invitations/:id", async (request) => {
    const store = await ownedStore(request);
    const { id } = idParamSchema.parse(request.params);
    await invitations.cancelInvite(store.id, id);
    return ok({ cancelled: true });
  });

  app.get("/partners", async (request) => {
    const store = await ownedStore(request);
    return ok(await program.listPartners(store.id));
  });

  app.patch("/partners/:id", async (request) => {
    const store = await ownedStore(request);
    const { id } = idParamSchema.parse(request.params);
    const input = partnerUpdateSchema.parse(request.body);
    return ok(await program.updatePartner(store.id, id, input));
  });

  app.get("/commissions", async (request) => {
    const store = await ownedStore(request);
    const query = commissionListQuery.parse(request.query);
    const { items, meta } = await commissions.listCommissions({ storeId: store.id }, query);
    return list(items, meta);
  });
};
