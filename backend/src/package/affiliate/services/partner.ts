import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { buildListMeta } from "../../../utils/response.js";
import { deps } from "../deps.js";
import { commissionAmount, compact, money, newToken, resolveRate } from "../domain.js";
import type { ProductQuery } from "../types.js";
import type { LinkCreateInput, LinkUpdateInput } from "../schema.js";
import { totals } from "./commissions.js";

const linkSelect = {
  id: true,
  token: true,
  storeId: true,
  storeSlug: true,
  productId: true,
  productName: true,
  productSlug: true,
  channel: true,
  label: true,
  enabled: true,
  clickCount: true,
  createdAt: true,
  storeAffiliate: { select: { storeName: true } },
} satisfies Prisma.AffiliateLinkSelect;

type LinkRow = Prisma.AffiliateLinkGetPayload<{ select: typeof linkSelect }>;

function shapeLink({ storeAffiliate, ...row }: LinkRow) {
  const path = `/a/${row.token}`;
  return {
    ...row,
    storeName: storeAffiliate.storeName,
    url: deps.host.webUrl ? `${deps.host.webUrl}${path}` : path,
  };
}

/** The relationship must be live on both sides before an affiliate can act on a store. */
async function activeRelation(affiliateId: string, storeId: string) {
  const [relation, program] = await Promise.all([
    deps.prisma.storeAffiliate.findFirst({
      where: { affiliateId, storeId, status: "ACTIVE" },
    }),
    deps.prisma.affiliateProgram.findUnique({ where: { storeId } }),
  ]);
  if (!relation || !program?.enabled) {
    throw HttpError.notFound("You are not an active partner of this store");
  }
  return { relation, program };
}

export async function getMe(affiliateId: string) {
  const [affiliate, stores, clicks, earnings] = await Promise.all([
    deps.prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } }),
    deps.prisma.storeAffiliate.count({ where: { affiliateId, status: "ACTIVE" } }),
    deps.prisma.affiliateLink.aggregate({ where: { affiliateId }, _sum: { clickCount: true } }),
    totals({ affiliateId }),
  ]);
  return {
    id: affiliate.id,
    displayName: affiliate.displayName,
    status: affiliate.status,
    joinedAt: affiliate.createdAt,
    stores,
    clicks: clicks._sum.clickCount ?? 0,
    ...earnings,
  };
}

export async function listStores(affiliateId: string) {
  const rows = await deps.prisma.storeAffiliate.findMany({
    where: { affiliateId, status: { not: "REMOVED" } },
    orderBy: { joinedAt: "desc" },
  });
  const programs = await deps.prisma.affiliateProgram.findMany({
    where: { storeId: { in: rows.map((r) => r.storeId) } },
  });
  const programByStore = new Map(programs.map((p) => [p.storeId, p]));

  return rows.map((row) => {
    const program = programByStore.get(row.storeId);
    const rate = program ? resolveRate(program, row) : null;
    return {
      id: row.id,
      storeId: row.storeId,
      storeName: row.storeName,
      storeSlug: row.storeSlug,
      status: row.status,
      programEnabled: program?.enabled ?? false,
      commissionType: rate?.type ?? null,
      commissionRate: money(rate?.rate),
      joinedAt: row.joinedAt,
    };
  });
}

/** Products the affiliate may promote in one store, with what each would earn. */
export async function listStoreProducts(affiliateId: string, storeId: string, query: ProductQuery) {
  const { relation, program } = await activeRelation(affiliateId, storeId);
  const page = await deps.host.listProducts(storeId, query);
  const rules = await deps.prisma.affiliateProductRule.findMany({
    where: { programId: program.id, productId: { in: page.items.map((p) => p.id) } },
  });
  const ruleByProduct = new Map(rules.map((r) => [r.productId, r]));

  const items = page.items.flatMap((product) => {
    const rate = resolveRate(program, relation, ruleByProduct.get(product.id));
    if (!rate) return [];
    const estimate =
      product.price == null
        ? null
        : commissionAmount(rate, new Prisma.Decimal(product.price), 1);
    return [
      {
        ...product,
        commissionType: rate.type,
        commissionRate: money(rate.rate),
        estimatedCommission: money(estimate),
      },
    ];
  });
  return { items, meta: buildListMeta(page.total, query.page, query.pageSize) };
}

export async function createLink(affiliateId: string, input: LinkCreateInput) {
  const { relation, program } = await activeRelation(affiliateId, input.storeId);

  let product = null;
  if (input.productId) {
    [product] = await deps.host.getProducts(input.storeId, [input.productId]);
    if (!product) throw HttpError.notFound("Product not found");
    const rule = await deps.prisma.affiliateProductRule.findUnique({
      where: { programId_productId: { programId: program.id, productId: product.id } },
    });
    if (!resolveRate(program, relation, rule)) {
      throw HttpError.badRequest("This product is not open to affiliates");
    }
  }

  const row = await deps.prisma.affiliateLink.create({
    data: {
      token: newToken(8),
      affiliateId,
      storeAffiliateId: relation.id,
      storeId: relation.storeId,
      storeSlug: relation.storeSlug,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      productSlug: product?.slug ?? null,
      channel: input.channel ?? null,
      label: input.label,
    },
    select: linkSelect,
  });
  return shapeLink(row);
}

export async function listLinks(affiliateId: string) {
  const rows = await deps.prisma.affiliateLink.findMany({
    where: { affiliateId },
    select: linkSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(shapeLink);
}

export async function updateLink(affiliateId: string, id: string, input: LinkUpdateInput) {
  const result = await deps.prisma.affiliateLink.updateMany({
    where: { id, affiliateId },
    data: compact(input),
  });
  if (result.count === 0) throw HttpError.notFound("Link not found");
  const row = await deps.prisma.affiliateLink.findUnique({ where: { id }, select: linkSelect });
  return shapeLink(row!);
}

// ---- platform admin ------------------------------------------------------

export async function adminList(page: number, pageSize: number) {
  const [rows, total] = await Promise.all([
    deps.prisma.affiliate.findMany({
      include: { _count: { select: { stores: true, links: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    deps.prisma.affiliate.count(),
  ]);
  const items = rows.map(({ _count, ...row }) => ({
    ...row,
    stores: _count.stores,
    links: _count.links,
  }));
  return { items, meta: buildListMeta(total, page, pageSize) };
}

/**
 * Everything the platform knows about one affiliate: the person behind the
 * account, every store partnership (with its rate, links, clicks and money),
 * every link, the invitations they took and any fraud flags. Commissions are
 * paged separately through `GET /admin/commissions?affiliateId=`.
 */
export async function adminDetail(id: string) {
  const affiliate = await deps.prisma.affiliate.findUnique({ where: { id } });
  if (!affiliate) throw HttpError.notFound("Affiliate not found");

  const [relations, linkRows, commissionGroups, lastClicks, invitations, fraudEvents, earnings, customer] =
    await Promise.all([
      deps.prisma.storeAffiliate.findMany({
        where: { affiliateId: id },
        orderBy: { joinedAt: "desc" },
      }),
      deps.prisma.affiliateLink.findMany({
        where: { affiliateId: id },
        select: { ...linkSelect, storeAffiliateId: true },
        orderBy: { createdAt: "desc" },
      }),
      deps.prisma.affiliateCommission.groupBy({
        by: ["storeAffiliateId", "status"],
        where: { affiliateId: id },
        _sum: { amount: true, lineTotal: true },
        _count: { _all: true },
      }),
      deps.prisma.affiliateClick.groupBy({
        by: ["linkId"],
        where: { link: { affiliateId: id } },
        _max: { createdAt: true },
      }),
      deps.prisma.affiliateInvitation.findMany({
        where: { affiliateId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storeId: true,
          storeName: true,
          name: true,
          email: true,
          commissionType: true,
          commissionRate: true,
          createdAt: true,
          acceptedAt: true,
        },
      }),
      deps.prisma.affiliateFraudEvent.findMany({
        where: { affiliateId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      totals({ affiliateId: id }),
      deps.host.getCustomer(affiliate.customerId),
    ]);

  const storeIds = relations.map((r) => r.storeId);
  const [programs, stores] = await Promise.all([
    deps.prisma.affiliateProgram.findMany({ where: { storeId: { in: storeIds } } }),
    Promise.all(storeIds.map((storeId) => deps.host.getStore(storeId))),
  ]);
  const owners = await Promise.all(
    stores.map((store) => (store ? deps.host.getCustomer(store.ownerId) : null)),
  );
  const programByStore = new Map(programs.map((p) => [p.storeId, p]));
  const lastClickByLink = new Map(lastClicks.map((c) => [c.linkId, c._max.createdAt]));

  const links = linkRows.map(({ storeAffiliateId, ...row }) => ({
    ...shapeLink(row),
    storeAffiliateId,
    lastClickAt: lastClickByLink.get(row.id) ?? null,
  }));

  const dead = new Set(["CANCELLED", "REVERSED", "REJECTED"]);
  const partnerships = relations.map((row, i) => {
    const program = programByStore.get(row.storeId);
    const rate = program ? resolveRate(program, row) : null;
    const store = stores[i];
    const owner = owners[i];
    const groups = commissionGroups.filter((g) => g.storeAffiliateId === row.id);
    const sum = (status: string) =>
      money(groups.find((g) => g.status === status)?._sum.amount) ?? 0;
    const storeLinks = links.filter((l) => l.storeAffiliateId === row.id);
    return {
      id: row.id,
      storeId: row.storeId,
      // The live name wins; the snapshot covers a store that has since gone.
      storeName: store?.name ?? row.storeName,
      storeSlug: store?.slug ?? row.storeSlug,
      storeExists: store !== null,
      storePublished: store?.isPublished ?? false,
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone } : null,
      status: row.status,
      programEnabled: program?.enabled ?? false,
      commissionType: rate?.type ?? null,
      commissionRate: money(rate?.rate),
      hasOverride: row.commissionRate != null,
      links: storeLinks.length,
      clicks: storeLinks.reduce((n, l) => n + l.clickCount, 0),
      commissions: groups.reduce((n, g) => n + g._count._all, 0),
      sales: groups
        .filter((g) => !dead.has(g.status))
        .reduce((n, g) => n + (money(g._sum.lineTotal) ?? 0), 0),
      pending: sum("PENDING"),
      approved: sum("APPROVED"),
      paid: sum("PAID"),
      joinedAt: row.joinedAt,
    };
  });

  return {
    id: affiliate.id,
    customerId: affiliate.customerId,
    displayName: affiliate.displayName,
    status: affiliate.status,
    createdAt: affiliate.createdAt,
    updatedAt: affiliate.updatedAt,
    account: customer
      ? { name: customer.name, email: customer.email, phone: customer.phone }
      : null,
    ...earnings,
    clicks: links.reduce((n, l) => n + l.clickCount, 0),
    stores: partnerships,
    links: links.map(({ storeAffiliateId: _drop, ...link }) => link),
    invitations: invitations.map((inv) => ({
      ...inv,
      commissionRate: money(inv.commissionRate),
    })),
    fraudEvents,
  };
}

export async function adminSetStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
  return deps.prisma.affiliate.update({ where: { id }, data: { status } });
}
