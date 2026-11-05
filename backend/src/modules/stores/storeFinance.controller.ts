import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ok } from "../../utils/response.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { storeActor } from "./storeActor.js";
import { getMyStore } from "./stores.service.js";
import { currentRates, getSellerEarnings } from "../finance/finance.service.js";

/**
 * The seller's side of seller finance (modules/finance). Read-only. Fees
 * are shown to the seller and the platform only — never on a customer route.
 */

/** The platform fee % in force for this store — the product form's note. */
export async function getPlatformFee(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const store = await getMyStore(storeActor(request), id); // ownership check
  const rates = await currentRates(store.id);
  return ok({
    percent: rates.platform.percent,
    effectiveFrom: rates.platform.effectiveFrom,
    upcoming: rates.upcoming.find((rule) => rule.kind === "PLATFORM") ?? null,
  });
}

const earningsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** Balances, delivered-order totals, ledger page, recent payouts. */
export async function getEarnings(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const { page, pageSize } = earningsQuery.parse(request.query);
  const store = await getMyStore(storeActor(request), id); // ownership check
  return ok(await getSellerEarnings(store.id, page, pageSize));
}
