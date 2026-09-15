import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { idParamSchema } from "../../../utils/zodHelpers.js";
import { list, ok } from "../../../utils/response.js";
import { requireAffiliate } from "../guards.js";
import {
  commissionListQuery,
  linkCreateSchema,
  linkUpdateSchema,
  productListQuery,
  storeParam,
} from "../schema.js";
import * as partner from "../services/partner.js";
import * as commissions from "../services/commissions.js";

/** Mounted at /me — the signed-in affiliate's own portal. */
export const partnerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.addHook("preHandler", requireAffiliate);

  app.get("/", async (request) => ok(await partner.getMe(request.affiliate!.id)));

  app.get("/stores", async (request) => ok(await partner.listStores(request.affiliate!.id)));

  app.get("/stores/:storeId/products", async (request) => {
    const { storeId } = storeParam.parse(request.params);
    const query = productListQuery.parse(request.query);
    const { items, meta } = await partner.listStoreProducts(
      request.affiliate!.id,
      storeId,
      query,
    );
    return list(items, meta);
  });

  app.get("/links", async (request) => ok(await partner.listLinks(request.affiliate!.id)));

  app.post("/links", async (request, reply) => {
    const input = linkCreateSchema.parse(request.body);
    const link = await partner.createLink(request.affiliate!.id, input);
    return reply.status(201).send(ok(link));
  });

  app.patch("/links/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = linkUpdateSchema.parse(request.body);
    return ok(await partner.updateLink(request.affiliate!.id, id, input));
  });

  app.get("/commissions", async (request) => {
    const query = commissionListQuery.parse(request.query);
    const { items, meta } = await commissions.listCommissions(
      { affiliateId: request.affiliate!.id },
      query,
    );
    return list(items, meta);
  });
};
