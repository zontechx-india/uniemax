import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { on } from "../../package/events/index.js";
import { claimBillOrders } from "./billOwner.js";

/**
 * Seller bills — background wiring (started from app.ts).
 *
 *   customer.signedIn → bill orders made for this customer's VERIFIED phone
 *                       that no account owned yet become theirs (their order
 *                       history). Fire-and-forget; never blocks the login.
 */
export function startBills(log: FastifyBaseLogger): void {
  on("customer.signedIn", async ({ customerId }) => {
    try {
      const n = await claimBillOrders(prisma, customerId);
      if (n > 0) log.info({ customerId, orders: n }, "bills: linked orders to the customer who signed in");
    } catch (err) {
      log.error({ err, customerId }, "bills: linking orders on sign-in failed");
    }
  });
}
