import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./support.controller.js";

/**
 * Support ticket routes.
 *
 * Four trees, mounted in `routes.ts` as:
 *   /api/v1/public/support-contact   (no auth — the email/phone to reach us)
 *   /api/v1/support                  (the reporter: requireCustomer)
 *   /api/v1/stores/:id/support       (a seller's own inbox — see storeRoutes)
 *   /api/v1/admin/support            (the platform team, inside /admin's guard)
 *
 * The reporter's tree carries **both** conversations they can have — with
 * UnieMax (`/tickets`) and with a shop (`/stores/:storeRef/tickets`) — because
 * opening, replying to and closing a thread is the same act either way. Only
 * *starting* one differs, which is why only that is store-scoped.
 */

/** Contact details. Public by definition — they are printed on a page. */
export const publicSupportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/support-contact", controller.getSupportContact);
};

export const customerSupportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);

  app.get("/tickets", controller.listTickets);
  // Raising a ticket fans out a notification to every admin, so it is
  // rate-limited well below the global ceiling — one frustrated seller
  // hammering the button must not become a console-wide alert storm.
  app.post(
    "/tickets",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    controller.createTicket,
  );
  app.get("/tickets/:ticketId", controller.getTicket);
  app.post(
    "/tickets/:ticketId/messages",
    { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } },
    controller.addMessage,
  );
  app.post("/tickets/:ticketId/close", controller.closeTicket);

  // Writing to a SHOP rather than to UnieMax. Only list + create are
  // store-scoped; the thread endpoints above serve both, since a reporter's
  // own ticket behaves the same whoever answers it.
  app.get("/stores/:storeRef/tickets", controller.listStoreTickets);
  app.post(
    "/stores/:storeRef/tickets",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    controller.createStoreTicket,
  );
};

/**
 * A seller answering their own customers. Mounted **inside** `storeRoutes`
 * (`/api/v1/stores/:id/support`), which already requires a customer session;
 * the service proves store ownership on every call.
 */
export const storeOwnerSupportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tickets", controller.sellerListTickets);
  app.get("/tickets/:ticketId", controller.sellerGetTicket);
  app.post("/tickets/:ticketId/messages", controller.sellerAddMessage);
  app.patch("/tickets/:ticketId", controller.sellerUpdateTicket);
};

export const adminSupportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tickets", controller.adminListTickets);
  app.get("/tickets/:ticketId", controller.adminGetTicket);
  app.post("/tickets/:ticketId/messages", controller.adminAddMessage);
  app.patch("/tickets/:ticketId", controller.adminUpdateTicket);
};
