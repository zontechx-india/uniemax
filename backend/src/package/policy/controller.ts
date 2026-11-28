import type { FastifyReply, FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
// The one UnieMax-side dependency: who the acting admin is. When PolicyHub
// becomes its own service this controller stays in UnieMax and passes the
// actor along (docs/policyhub/README.md §5).
import { resolveActor } from "../../modules/payouts/payouts.service.js";
import * as schema from "./schema.js";
import * as service from "./service.js";

/** PolicyHub — parse, call. Every write is audited by the service (policy_events). */

async function actor(request: FastifyRequest) {
  if (!request.admin) throw HttpError.unauthorized();
  return resolveActor(request.admin.id);
}

// ---- Admin ----------------------------------------------------------------

export async function listPolicies() {
  return ok(await service.listPolicies());
}

export async function getPolicy(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  return ok(await service.getPolicy(code));
}

export async function createPolicy(request: FastifyRequest, reply: FastifyReply) {
  const input = schema.policyCreateSchema.parse(request.body);
  const policy = await service.createPolicy(input, await actor(request));
  return reply.code(201).send(ok(await service.getPolicy(policy.code)));
}

export async function startDraft(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  await service.startDraft(code, await actor(request));
  return ok(await service.getPolicy(code));
}

export async function updateDraft(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  const input = schema.draftUpdateSchema.parse(request.body);
  await service.updateDraft(code, input, await actor(request));
  return ok(await service.getPolicy(code));
}

export async function resetDraft(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  await service.resetDraft(code, await actor(request));
  return ok(await service.getPolicy(code));
}

export async function publishDraft(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  const input = schema.publishSchema.parse(request.body ?? {});
  await service.publishDraft(code, input, await actor(request));
  return ok(await service.getPolicy(code));
}

// ---- Public ---------------------------------------------------------------

export async function getPublicPolicy(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  return ok(await service.getPublicPolicy(code));
}

export async function getPublicHistory(request: FastifyRequest) {
  const { code } = schema.codeParams.parse(request.params);
  const { version } = schema.versionQuery.parse(request.query);
  return ok(await service.getPublicHistory(code, version));
}
