import type { FastifyRequest, FastifyReply } from "fastify";
import { storeActor } from "./storeActor.js";
import { ok } from "../../utils/response.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import {
  bankAccountCreateSchema,
  bankAccountParamSchema,
  bankAccountUpdateSchema,
} from "./storeBank.schema.js";
import * as service from "./storeBank.service.js";

/** All handlers run behind `requireCustomer` (stores.routes.ts). */

export async function listBankAccounts(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.listBankAccounts(storeActor(request), id));
}

export async function listBankHistory(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.listBankHistory(storeActor(request), id));
}

export async function requestBankChangeCode(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.requestBankChangeCode(storeActor(request), id));
}

/** → `{ account, check }` — the check's answer comes back with the save. */
export async function createBankAccount(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = idParamSchema.parse(request.params);
  const input = bankAccountCreateSchema.parse(request.body);
  const result = await service.createBankAccount(
    storeActor(request),
    id,
    input,
    request.log,
  );
  return reply.status(201).send(ok(result));
}

export async function updateBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  const input = bankAccountUpdateSchema.parse(request.body);
  return ok(
    await service.updateBankAccount(storeActor(request), id, accountId, input, request.log),
  );
}

export async function recheckBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  return ok(
    await service.recheckBankAccount(storeActor(request), id, accountId, request.log),
  );
}

export async function discardBankChange(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  return ok(await service.discardBankChange(storeActor(request), id, accountId));
}

export async function deleteBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  return ok(
    await service.deleteBankAccount(storeActor(request), id, accountId),
  );
}
