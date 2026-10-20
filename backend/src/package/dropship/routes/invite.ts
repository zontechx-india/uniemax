import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { inviteAcceptSchema, tokenParam } from "../schema.js";
import * as invites from "../services/invites.js";

/** Mounted at /invites — the token in the path is the authority (SU-2). */
export const inviteRoutes: FastifyPluginAsync = async (app) => {
  const limited = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.get("/:token", limited, async (request) => {
    const { token } = tokenParam.parse(request.params);
    return ok(await invites.previewInvite(token));
  });

  app.get("/:token/stores", { ...limited, preHandler: requireCustomer }, async (request) => {
    const { token } = tokenParam.parse(request.params);
    return ok(await invites.inviteStores(token, request.customer!.id));
  });

  app.post("/:token/accept", { ...limited, preHandler: requireCustomer }, async (request) => {
    const { token } = tokenParam.parse(request.params);
    const input = inviteAcceptSchema.parse(request.body);
    return ok(await invites.acceptInvite(token, request.customer!.id, input));
  });
};
