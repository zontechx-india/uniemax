import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { requireOwnedStore } from "../guards.js";
import { inviteCreateSchema, inviteParam, linkParam, sellerLinkUpdateSchema } from "../schema.js";
import * as invites from "../services/invites.js";
import * as suppliers from "../services/suppliers.js";
import { linkTerms } from "../services/terms.js";

/** Mounted at /stores/:storeId — the seller side; acts on one store the caller owns. */
export const sellerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.addHook("preHandler", requireOwnedStore);

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

  app.get("/suppliers/:linkId/terms", async (request) => {
    const { linkId } = linkParam.parse(request.params);
    await suppliers.assertSellerLink(request.dropshipStore!.id, linkId);
    return ok(await linkTerms(linkId));
  });
};
