import type { FastifyRequest } from "fastify";
import { list, ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { recordAudit } from "../admin/adminAudit.js";
import { resolveActor } from "../payouts/payouts.service.js";
import * as schema from "./finance.schema.js";
import * as service from "./finance.service.js";

/** Seller finance — admin console. Parse, call, audit every write. */

async function actor(request: FastifyRequest) {
  if (!request.admin) throw HttpError.unauthorized();
  return resolveActor(request.admin.id);
}

export async function listFeeRules() {
  return ok(await service.listFeeRules());
}

export async function createFeeRule(request: FastifyRequest) {
  const input = schema.feeRuleCreateSchema.parse(request.body);
  const rule = await service.createFeeRule(input, await actor(request));
  recordAudit(request, {
    action: "finance.feeRule.create",
    entityType: "feeRule",
    entityId: rule.id,
    meta: {
      kind: rule.kind,
      percent: rule.percent.toFixed(2),
      bearer: rule.bearer,
      effectiveFrom: rule.effectiveFrom.toISOString(),
    },
  });
  return ok(await service.listFeeRules());
}

export async function listBalances(request: FastifyRequest) {
  const query = schema.balanceListQuery.parse(request.query);
  const { rows, meta, totals } = await service.listBalances(query);
  return { ...list(rows, meta), totals };
}

export async function getStoreFinance(request: FastifyRequest) {
  const { storeId } = schema.storeIdParams.parse(request.params);
  return ok(await service.getStoreFinance(storeId));
}

export async function listLedger(request: FastifyRequest) {
  const { storeId } = schema.storeIdParams.parse(request.params);
  const query = schema.ledgerListQuery.parse(request.query);
  const { rows, meta } = await service.listLedger(storeId, query);
  return list(rows, meta);
}

export async function addAdjustment(request: FastifyRequest) {
  const { storeId } = schema.storeIdParams.parse(request.params);
  const input = schema.adjustmentSchema.parse(request.body);
  const result = await service.addAdjustment(storeId, input, await actor(request));
  recordAudit(request, {
    action: "finance.adjustment",
    entityType: "store",
    entityId: storeId,
    meta: { bucket: input.bucket, direction: input.direction, amount: input.amount, reason: input.reason },
  });
  return ok(result);
}

export async function getOrderFinancials(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const { sellerEarningPaise: _, ...fin } = await service.getOrderFinancials(id);
  return ok(fin);
}
