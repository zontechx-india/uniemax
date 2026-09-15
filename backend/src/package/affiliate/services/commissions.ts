import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { buildListMeta } from "../../../utils/response.js";
import { deps } from "../deps.js";
import { commissionAmount, daysFromNow, money, resolveRate } from "../domain.js";
import type { CommissionListQuery } from "../schema.js";

/** Statuses that no longer count towards anyone's earnings. */
const DEAD = ["CANCELLED", "REVERSED", "REJECTED"] as const;

const commissionSelect = {
  id: true,
  storeId: true,
  storeName: true,
  orderId: true,
  orderNumber: true,
  productName: true,
  lineTotal: true,
  commissionType: true,
  commissionRate: true,
  amount: true,
  status: true,
  maturesAt: true,
  approvedAt: true,
  paidAt: true,
  note: true,
  createdAt: true,
  affiliate: { select: { id: true, displayName: true } },
} satisfies Prisma.AffiliateCommissionSelect;

type CommissionRow = Prisma.AffiliateCommissionGetPayload<{ select: typeof commissionSelect }>;

function shape(row: CommissionRow) {
  return {
    ...row,
    lineTotal: money(row.lineTotal),
    commissionRate: money(row.commissionRate),
    amount: money(row.amount),
  };
}

/**
 * order.placed → turn the order's attribution token into per-line commissions.
 * Idempotent: `orderItemId` is unique, so a redelivered event adds nothing.
 */
export async function createForOrder(orderId: string): Promise<void> {
  const { prisma, host } = deps;
  const order = await host.getOrder(orderId);
  if (!order?.affiliateRef || !order.storeId) return;

  const attribution = await prisma.affiliateAttribution.findUnique({
    where: { token: order.affiliateRef },
  });
  if (!attribution || attribution.storeId !== order.storeId) return;
  if (attribution.orderId && attribution.orderId !== order.id) return;
  if (attribution.expiresAt < new Date()) return;

  const [relation, program] = await Promise.all([
    prisma.storeAffiliate.findUnique({
      where: { id: attribution.storeAffiliateId },
      include: { affiliate: true },
    }),
    prisma.affiliateProgram.findUnique({ where: { storeId: order.storeId } }),
  ]);
  if (!relation || relation.status !== "ACTIVE" || !program?.enabled) return;
  if (relation.affiliate.status !== "ACTIVE") return;

  if (order.customerId && order.customerId === relation.affiliate.customerId) {
    await prisma.affiliateFraudEvent.create({
      data: {
        kind: "SELF_PURCHASE",
        affiliateId: relation.affiliateId,
        storeId: order.storeId,
        orderId: order.id,
      },
    });
    return;
  }

  const rules = await prisma.affiliateProductRule.findMany({
    where: {
      programId: program.id,
      productId: { in: order.items.flatMap((i) => (i.productId ? [i.productId] : [])) },
    },
  });
  const ruleByProduct = new Map(rules.map((r) => [r.productId, r]));

  const rows = order.items.flatMap((item) => {
    const rule = item.productId ? ruleByProduct.get(item.productId) : null;
    const rate = resolveRate(program, relation, rule);
    if (!rate) return [];
    const lineTotal = new Prisma.Decimal(item.lineTotal);
    return [
      {
        affiliateId: relation.affiliateId,
        storeAffiliateId: relation.id,
        linkId: attribution.linkId,
        storeId: order.storeId!,
        storeName: order.storeName,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        customerId: order.customerId,
        lineTotal,
        commissionType: rate.type,
        commissionRate: rate.rate,
        amount: commissionAmount(rate, lineTotal, item.quantity),
      },
    ];
  });
  if (rows.length === 0) return;

  await prisma.$transaction([
    prisma.affiliateCommission.createMany({ data: rows, skipDuplicates: true }),
    prisma.affiliateAttribution.update({
      where: { id: attribution.id },
      data: { orderId: order.id },
    }),
  ]);

  const total = rows.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
  host.notify(relation.affiliate.customerId, {
    title: "New affiliate order",
    body: `Order ${order.orderNumber} at ${order.storeName} — ₹${total.toFixed(2)} commission pending`,
    url: "/affiliate/commissions",
  });
}

/** Delivered → the return window starts; approval waits for it to close. */
export async function onDelivered(orderId: string): Promise<void> {
  const order = await deps.host.getOrder(orderId);
  if (!order?.storeId) return;
  const program = await deps.prisma.affiliateProgram.findUnique({
    where: { storeId: order.storeId },
    select: { holdDays: true },
  });
  await deps.prisma.affiliateCommission.updateMany({
    where: { orderId, status: "PENDING" },
    data: { maturesAt: daysFromNow(program?.holdDays ?? 7, order.deliveredAt ?? new Date()) },
  });
}

export async function onCancelled(orderId: string): Promise<void> {
  await deps.prisma.$transaction([
    deps.prisma.affiliateCommission.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
    deps.prisma.affiliateCommission.updateMany({
      where: { orderId, status: "APPROVED" },
      data: { status: "REVERSED", note: "Order cancelled" },
    }),
  ]);
}

/** Job: approve commissions whose hold period has ended on paid, delivered orders. */
export async function approveMatured(): Promise<number> {
  const due = await deps.prisma.affiliateCommission.findMany({
    where: { status: "PENDING", maturesAt: { lte: new Date() } },
    select: { orderId: true },
    distinct: ["orderId"],
  });

  let approved = 0;
  for (const { orderId } of due) {
    const order = await deps.host.getOrder(orderId);
    if (!order) continue;
    if (order.status === "CANCELLED") {
      await onCancelled(orderId);
    } else if (order.status === "DELIVERED" && order.paymentStatus === "PAID") {
      const result = await deps.prisma.affiliateCommission.updateMany({
        where: { orderId, status: "PENDING" },
        data: { status: "APPROVED", approvedAt: new Date() },
      });
      approved += result.count;
    }
  }
  return approved;
}

export async function listCommissions(
  where: Prisma.AffiliateCommissionWhereInput,
  query: CommissionListQuery,
) {
  const filter = { ...where, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    deps.prisma.affiliateCommission.findMany({
      where: filter,
      select: commissionSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    deps.prisma.affiliateCommission.count({ where: filter }),
  ]);
  return { items: rows.map(shape), meta: buildListMeta(total, query.page, query.pageSize) };
}

/** Earnings rollup for a store or an affiliate — whatever `where` scopes to. */
export async function totals(where: Prisma.AffiliateCommissionWhereInput) {
  const live = { ...where, status: { notIn: [...DEAD] } };
  const [groups, orders] = await Promise.all([
    deps.prisma.affiliateCommission.groupBy({
      by: ["status"],
      where,
      _sum: { amount: true, lineTotal: true },
    }),
    deps.prisma.affiliateCommission.findMany({
      where: live,
      select: { orderId: true },
      distinct: ["orderId"],
    }),
  ]);

  const amount = (status: string) =>
    money(groups.find((g) => g.status === status)?._sum.amount) ?? 0;
  const sales = groups
    .filter((g) => !DEAD.includes(g.status as (typeof DEAD)[number]))
    .reduce((sum, g) => sum + (money(g._sum.lineTotal) ?? 0), 0);

  return {
    orders: orders.length,
    sales,
    pending: amount("PENDING"),
    approved: amount("APPROVED"),
    paid: amount("PAID"),
  };
}

/** Admin override — approve early or reject with a note. */
export async function adminUpdate(id: string, status: "APPROVED" | "REJECTED", note: string | null) {
  const allowedFrom = status === "APPROVED" ? ["PENDING"] : ["PENDING", "APPROVED"];
  const result = await deps.prisma.affiliateCommission.updateMany({
    where: { id, status: { in: allowedFrom as ("PENDING" | "APPROVED")[] } },
    data: {
      status,
      note,
      ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
    },
  });
  if (result.count === 0) throw HttpError.conflict("This commission cannot be changed");
  const row = await deps.prisma.affiliateCommission.findUnique({
    where: { id },
    select: commissionSelect,
  });
  return shape(row!);
}
