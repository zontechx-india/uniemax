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

export async function createBankAccount(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = idParamSchema.parse(request.params);
  const input = bankAccountCreateSchema.parse(request.body);
  const account = await service.createBankAccount(
    storeActor(request),
    id,
    input,
  );
  return reply.status(201).send(ok(account));
}

export async function updateBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  const input = bankAccountUpdateSchema.parse(request.body);
  return ok(
    await service.updateBankAccount(storeActor(request), id, accountId, input),
  );
}

export async function deleteBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankAccountParamSchema.parse(request.params);
  return ok(
    await service.deleteBankAccount(storeActor(request), id, accountId),
  );
}
