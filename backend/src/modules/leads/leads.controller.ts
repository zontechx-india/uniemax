import type { FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { storeActor } from "../stores/storeActor.js";
import { getMyStore } from "../stores/stores.service.js";
import { leadListQuery } from "./leads.schema.js";
import * as service from "./leads.service.js";

/** Seller leads — read-only. Mounted on the store routes (owner + admin manage). */
export async function listLeads(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const query = leadListQuery.parse(request.query);
  const store = await getMyStore(storeActor(request), id); // ownership check
  return ok(await service.listLeads(store.id, query));
}
