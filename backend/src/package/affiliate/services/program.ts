import { HttpError } from "../../../utils/httpError.js";
import { buildListMeta } from "../../../utils/response.js";
import { affiliateConfig } from "../config.js";
import { deps } from "../deps.js";
import { compact, money, rateAllowed, resolveRate } from "../domain.js";
import type { ProductQuery } from "../types.js";
import type { PartnerUpdateInput, ProductRuleInput, ProgramUpdateInput } from "../schema.js";
import { totals } from "./commissions.js";

const programSelect = {
  id: true,
  storeId: true,
  enabled: true,
  commissionType: true,
  commissionRate: true,
  attributionDays: true,
  holdDays: true,
  updatedAt: true,
} as const;

/** The store's programme row, created with defaults the first time it is needed. */
export function programRow(storeId: string) {
  return deps.prisma.affiliateProgram.upsert({
    where: { storeId },
    create: { storeId },
    update: {},
    select: programSelect,
  });
}

const rateLimitMessage = `Commission cannot exceed ${affiliateConfig.maxPercent}%`;

export async function getProgram(storeId: string) {
  const row = await programRow(storeId);
  return { ...row, commissionRate: money(row.commissionRate) };
}

export async function updateProgram(storeId: string, input: ProgramUpdateInput) {
  const current = await programRow(storeId);
  const type = input.commissionType ?? current.commissionType;
  const rate = input.commissionRate ?? Number(current.commissionRate);
  if (!rateAllowed(type, rate)) throw HttpError.badRequest(rateLimitMessage);

  const row = await deps.prisma.affiliateProgram.update({
    where: { storeId },
    data: compact(input),
    select: programSelect,
  });
  return { ...row, commissionRate: money(row.commissionRate) };
}

/** Seller view: active products with what an affiliate would earn on each. */
export async function listProducts(storeId: string, query: ProductQuery) {
  const [program, page] = await Promise.all([
    programRow(storeId),
    deps.host.listProducts(storeId, query),
  ]);
  const rules = await deps.prisma.affiliateProductRule.findMany({
    where: { programId: program.id, productId: { in: page.items.map((p) => p.id) } },
  });
  const ruleByProduct = new Map(rules.map((r) => [r.productId, r]));

  const items = page.items.map((product) => {
    const rule = ruleByProduct.get(product.id) ?? null;
    const rate = resolveRate(program, null, rule);
    return {
      ...product,
      enabled: rate != null,
      commissionType: rate?.type ?? null,
      commissionRate: money(rate?.rate),
      hasOverride: rule?.commissionRate != null,
    };
  });
  return { items, meta: buildListMeta(page.total, query.page, query.pageSize) };
}

/**
 * Merge the patch with the existing rule. A rule that ends up equal to the
 * programme default is deleted rather than stored — no row means "default".
 */
export async function updateProductRule(
  storeId: string,
  productId: string,
  input: ProductRuleInput,
) {
  const program = await programRow(storeId);
  const [product] = await deps.host.getProducts(storeId, [productId]);
  if (!product) throw HttpError.notFound("Product not found");

  const key = { programId_productId: { programId: program.id, productId } };
  const existing = await deps.prisma.affiliateProductRule.findUnique({ where: key });

  const next = {
    enabled: input.enabled ?? existing?.enabled ?? true,
    commissionType:
      input.commissionType === undefined
        ? (existing?.commissionType ?? null)
        : input.commissionType,
    commissionRate:
      input.commissionRate === undefined
        ? money(existing?.commissionRate)
        : input.commissionRate,
  };
  if (
    next.commissionRate != null &&
    !rateAllowed(next.commissionType ?? program.commissionType, next.commissionRate)
  ) {
    throw HttpError.badRequest(rateLimitMessage);
  }

  const isDefault = next.enabled && next.commissionRate == null;
  if (isDefault) {
    if (existing) await deps.prisma.affiliateProductRule.delete({ where: key });
  } else {
    await deps.prisma.affiliateProductRule.upsert({
      where: key,
      create: { programId: program.id, productId, ...next },
      update: next,
    });
  }
  return { productId, ...next };
}

export async function summary(storeId: string) {
  const [partners, clicks, earnings] = await Promise.all([
    deps.prisma.storeAffiliate.count({ where: { storeId, status: "ACTIVE" } }),
    deps.prisma.affiliateLink.aggregate({ where: { storeId }, _sum: { clickCount: true } }),
    totals({ storeId }),
  ]);
  return { partners, clicks: clicks._sum.clickCount ?? 0, ...earnings };
}

/** Seller's partner list with each affiliate's effective rate and earnings. */
export async function listPartners(storeId: string) {
  const [program, rows, earnings] = await Promise.all([
    programRow(storeId),
    deps.prisma.storeAffiliate.findMany({
      where: { storeId, status: { not: "REMOVED" } },
      include: { affiliate: { select: { displayName: true, status: true } } },
      orderBy: { joinedAt: "desc" },
    }),
    deps.prisma.affiliateCommission.groupBy({
      by: ["storeAffiliateId"],
      where: { storeId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
      _sum: { amount: true },
      _count: { orderId: true },
    }),
  ]);
  const earned = new Map(earnings.map((e) => [e.storeAffiliateId, e]));

  return rows.map((row) => {
    const rate = resolveRate(program, row);
    const stats = earned.get(row.id);
    return {
      id: row.id,
      affiliateId: row.affiliateId,
      name: row.affiliate.displayName,
      status: row.status,
      accountStatus: row.affiliate.status,
      commissionType: rate?.type ?? null,
      commissionRate: money(rate?.rate),
      hasOverride: row.commissionRate != null,
      commissions: stats?._count.orderId ?? 0,
      earned: money(stats?._sum.amount) ?? 0,
      joinedAt: row.joinedAt,
    };
  });
}

export async function updatePartner(storeId: string, id: string, input: PartnerUpdateInput) {
  const program = await programRow(storeId);
  if (
    input.commissionRate != null &&
    !rateAllowed(input.commissionType ?? program.commissionType, input.commissionRate)
  ) {
    throw HttpError.badRequest(rateLimitMessage);
  }
  const result = await deps.prisma.storeAffiliate.updateMany({
    where: { id, storeId },
    data: compact(input),
  });
  if (result.count === 0) throw HttpError.notFound("Partner not found");
  return (await listPartners(storeId)).find((p) => p.id === id);
}
