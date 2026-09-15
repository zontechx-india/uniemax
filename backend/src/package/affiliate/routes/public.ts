import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../auth/index.js";
import { ok } from "../../../utils/response.js";
import { tokenParam } from "../schema.js";
import * as invitations from "../services/invitations.js";
import * as tracking from "../services/tracking.js";

/** Mounted at /public — the invitation flow and the link click, no session needed. */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/invitations/:token", async (request) => {
    const { token } = tokenParam.parse(request.params);
    return ok(await invitations.previewInvite(token));
  });

  app.post(
    "/invitations/:token/accept",
    { preHandler: requireCustomer },
    async (request) => {
      const { token } = tokenParam.parse(request.params);
      return ok(await invitations.acceptInvite(token, request.customer!.id));
    },
  );

  // The storefront's /a/:token page calls this, stores `ref`, then navigates
  // to `path`. Kept as an API call so no nginx rule is needed for the short URL.
  app.post(
    "/click/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const { token } = tokenParam.parse(request.params);
      return ok(
        await tracking.recordClick(token, {
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.slice(0, 300),
          referer: request.headers.referer?.slice(0, 500),
        }),
      );
    },
  );
};
