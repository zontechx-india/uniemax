import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./wishlist.controller.js";

/**
 * The signed-in customer's wishlist ("Saved"). Mounted at /api/v1/wishlist;
 * every route requires a customer token. There is no guest wishlist: a
 * guest who taps a heart is asked to sign in first, and the save completes
 * after — a list that silently lived in one browser would be lost exactly
 * when it mattered (a new phone).
 */
export const wishlistRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);

  const writeLimit = {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  app.get("/", controller.list);
  // Just the ids — what product-card hearts need, without the cards.
  app.get("/ids", controller.ids);
  app.put("/:productId", writeLimit, controller.add);
  app.delete("/:productId", writeLimit, controller.remove);
};
