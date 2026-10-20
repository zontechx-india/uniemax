import { HttpError } from "../../../utils/httpError.js";
import { buildListMeta } from "../../../utils/response.js";
import { deps } from "../deps.js";
import { canMoveLink, describeChange, diffTerms } from "../domain.js";
import type { LinkStatus } from "../domain.js";
import type { SellerLinkUpdateInput, SupplierProfileUpdateInput } from "../schema.js";
import type { StoreRef } from "../types.js";
import { shapeInvite } from "./invites.js";
import { syncForLink, syncForSupplier } from "./resale.js";
import { logChanges } from "./terms.js";

type SupplierRow = {
  id: string;
  storeId: string;
  supplyOnly: boolean;
  status: string;
  shippingFee: { toString(): string };
  shipWithinDays: number;
  returnDays: number;
};

const shapeProfile = (s: SupplierRow) => ({
  id: s.id,
  storeId: s.storeId,
  supplyOnly: s.supplyOnly,
  status: s.status,
  shippingFee: Number(s.shippingFee),
  shipWithinDays: s.shipWithinDays,
  returnDays: s.returnDays,
});

const storeCard = (store: StoreRef | undefined) =>
  store
    ? { id: store.id, name: store.name, slug: store.slug, logoUrl: store.logoUrl, phone: store.phone }
    : null;

/** Whether this store supplies, and whether it has suppliers — drives the nav. */
export async function storeRole(storeId: string) {
  const [supplier, links] = await Promise.all([
    deps.prisma.supplier.findUnique({ where: { storeId } }),
    deps.prisma.supplierLink.count({ where: { sellerStoreId: storeId } }),
  ]);
  return {
    supplier: supplier
      ? { status: supplier.status, supplyOnly: supplier.supplyOnly }
      : null,
    hasSuppliers: links > 0,
  };
}

// ---------------------------------------------------------------------------
// Seller side
// ---------------------------------------------------------------------------

/** Open invites and every supplier this store has (ended ones last). */
export async function sellerOverview(storeId: string) {
  const [invites, links] = await Promise.all([
    deps.prisma.supplierInvite.findMany({
      where: { sellerStoreId: storeId, status: { in: ["SENT", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    deps.prisma.supplierLink.findMany({
      where: { sellerStoreId: storeId },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const stores = await deps.host.getStores(links.map((l) => l.supplier.storeId));
  const byId = new Map(stores.map((s) => [s.id, s]));
  const rank: Record<LinkStatus, number> = { ACTIVE: 0, PAUSED: 1, ENDED: 2 };
  return {
    invites: invites.map(shapeInvite),
    suppliers: links
      .sort((a, b) => rank[a.status] - rank[b.status])
      .map((link) => ({
        linkId: link.id,
        status: link.status,
        statusBy: link.statusBy,
        codAllowed: link.codAllowed,
        returnFeePayer: link.returnFeePayer,
        since: link.createdAt,
        supplierStatus: link.supplier.status,
        store: storeCard(byId.get(link.supplier.storeId)),
        profile: shapeProfile(link.supplier),
      })),
  };
}

async function sellerLink(storeId: string, linkId: string) {
  const link = await deps.prisma.supplierLink.findFirst({
    where: { id: linkId, sellerStoreId: storeId },
    include: { supplier: true },
  });
  if (!link) throw HttpError.notFound("Supplier not found");
  return link;
}

export async function assertSellerLink(storeId: string, linkId: string) {
  await sellerLink(storeId, linkId);
}

/**
 * The seller edits its two terms and/or pauses / ends the supplier. Each
 * term change is logged and the supplier is told it applies to orders placed
 * from now on (SU-5, D-18). Copies re-sync in Phase 3 (D-31).
 */
export async function updateLinkAsSeller(
  store: StoreRef,
  linkId: string,
  customerId: string,
  input: SellerLinkUpdateInput,
) {
  const link = await sellerLink(store.id, linkId);
  if (link.status === "ENDED" && (input.codAllowed !== undefined || input.returnFeePayer !== undefined)) {
    throw HttpError.conflict("You've stopped working with this supplier");
  }
  if (input.status && input.status !== link.status && !canMoveLink(link.status, input.status)) {
    throw HttpError.conflict("You've stopped working with this supplier");
  }
  if (input.codAllowed && input.turnOnStoreCod && !store.acceptCod) {
    await deps.host.setStoreCod(customerId, store.id, true);
  }

  const diffs = diffTerms(
    { codAllowed: link.codAllowed, returnFeePayer: link.returnFeePayer },
    { codAllowed: input.codAllowed, returnFeePayer: input.returnFeePayer },
  );
  const statusChange = input.status && input.status !== link.status ? input.status : null;

  await deps.prisma.$transaction(async (tx) => {
    await tx.supplierLink.update({
      where: { id: link.id },
      data: {
        ...(input.codAllowed !== undefined ? { codAllowed: input.codAllowed } : {}),
        ...(input.returnFeePayer !== undefined ? { returnFeePayer: input.returnFeePayer } : {}),
        ...(statusChange ? { status: statusChange, statusBy: "SELLER" as const } : {}),
      },
    });
    await logChanges(tx, {
      supplierId: link.supplierId,
      linkId: link.id,
      diffs,
      changedBy: customerId,
      changedAs: "SELLER",
    });
  });

  const supplierStore = await deps.host.getStore(link.supplier.storeId);
  if (supplierStore) {
    const url = `/mystores/${supplierStore.slug}/sellers`;
    if (diffs.length > 0) {
      deps.host.notify(supplierStore.ownerId, {
        title: `${store.name} changed your terms`,
        body: `${diffs.map((d) => describeChange(d.field, d.fromValue, d.toValue)).join(". ")}. This applies to orders placed from now on.`,
        url,
      });
    }
    if (statusChange) {
      deps.host.notify(supplierStore.ownerId, statusNotice(store.name, statusChange, url));
    }
  }
  // Copies follow: COD re-synced (SU-5), paused / resumed (SU-7).
  await syncForLink(link.id);
  return sellerLinkView(store.id, link.id);
}

async function sellerLinkView(storeId: string, linkId: string) {
  const { suppliers } = await sellerOverview(storeId);
  return suppliers.find((s) => s.linkId === linkId)!;
}

function statusNotice(otherName: string, status: LinkStatus, url: string) {
  const body =
    status === "PAUSED"
      ? `${otherName} paused working with you. No new orders until it's resumed; open orders still complete.`
      : status === "ENDED"
        ? `${otherName} stopped working with you. Open orders still complete and your account with them stays.`
        : `${otherName} resumed working with you.`;
  return { title: status === "ACTIVE" ? "Working together again" : "A change to your partnership", body, url };
}

// ---------------------------------------------------------------------------
// Supplier side
// ---------------------------------------------------------------------------

export async function getProfile(supplierId: string) {
  return shapeProfile(await deps.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }));
}

/** Fee, ship within, returns: logged, and every seller is told (D-18). */
export async function updateProfile(
  supplierId: string,
  customerId: string,
  input: SupplierProfileUpdateInput,
) {
  const supplier = await deps.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const diffs = diffTerms(
    {
      shippingFee: supplier.shippingFee,
      shipWithinDays: supplier.shipWithinDays,
      returnDays: supplier.returnDays,
    },
    input,
  );
  if (diffs.length === 0) return shapeProfile(supplier);

  const updated = await deps.prisma.$transaction(async (tx) => {
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const row = await tx.supplier.update({ where: { id: supplierId }, data });
    await logChanges(tx, { supplierId, linkId: null, diffs, changedBy: customerId, changedAs: "SUPPLIER" });
    return row;
  });

  const [me, links] = await Promise.all([
    deps.host.getStore(supplier.storeId),
    deps.prisma.supplierLink.findMany({
      where: { supplierId, status: { not: "ENDED" } },
      select: { sellerStoreId: true },
    }),
  ]);
  const sellers = await deps.host.getStores(links.map((l) => l.sellerStoreId));
  const text = diffs.map((d) => describeChange(d.field, d.fromValue, d.toValue)).join(". ");
  for (const seller of sellers) {
    deps.host.notify(seller.ownerId, {
      title: `${me?.name ?? "Your supplier"} changed their terms`,
      body: `${text}. This applies to orders placed from now on.`,
      url: `/mystores/${seller.slug}/suppliers`,
    });
  }
  return shapeProfile(updated);
}

/** The sellers this supplier supplies, with each one's terms. */
export async function supplierSellers(supplierId: string) {
  const links = await deps.prisma.supplierLink.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
  });
  const stores = await deps.host.getStores(links.map((l) => l.sellerStoreId));
  const byId = new Map(stores.map((s) => [s.id, s]));
  return links.map((link) => ({
    linkId: link.id,
    status: link.status,
    statusBy: link.statusBy,
    codAllowed: link.codAllowed,
    returnFeePayer: link.returnFeePayer,
    since: link.createdAt,
    store: storeCard(byId.get(link.sellerStoreId)),
  }));
}

export async function assertSupplierLink(supplierId: string, linkId: string) {
  const link = await deps.prisma.supplierLink.findFirst({ where: { id: linkId, supplierId } });
  if (!link) throw HttpError.notFound("Seller not found");
  return link;
}

/** D-19: the supplier can pause, resume or end supplying a seller too (SU-17). */
export async function updateLinkAsSupplier(
  supplierId: string,
  linkId: string,
  status: LinkStatus,
) {
  const link = await assertSupplierLink(supplierId, linkId);
  if (status === link.status) return;
  if (!canMoveLink(link.status, status)) {
    throw HttpError.conflict("You've stopped supplying this seller");
  }
  await deps.prisma.supplierLink.update({
    where: { id: link.id },
    data: { status, statusBy: "SUPPLIER" },
  });
  await syncForLink(link.id); // SU-17: copies pause / resume
  const [seller, supplier] = await Promise.all([
    deps.host.getStore(link.sellerStoreId),
    deps.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
  ]);
  const me = await deps.host.getStore(supplier.storeId);
  if (seller) {
    deps.host.notify(
      seller.ownerId,
      statusNotice(me?.name ?? "Your supplier", status, `/mystores/${seller.slug}/suppliers`),
    );
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminList(
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | undefined,
  page: number,
  pageSize: number,
) {
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    deps.prisma.supplier.findMany({
      where,
      include: { links: { select: { sellerStoreId: true, status: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    deps.prisma.supplier.count({ where }),
  ]);
  const storeIds = rows.flatMap((r) => [r.storeId, ...r.links.map((l) => l.sellerStoreId)]);
  const stores = await deps.host.getStores([...new Set(storeIds)]);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const items = rows.map((row) => ({
    ...shapeProfile(row),
    statusNote: row.statusNote,
    createdAt: row.createdAt,
    store: storeCard(byId.get(row.storeId)),
    sellers: row.links.map((l) => ({
      status: l.status,
      store: storeCard(byId.get(l.sellerStoreId)),
    })),
  }));
  return { items, meta: buildListMeta(total, page, pageSize) };
}

/**
 * Suspend or restore. Copies pausing on suspension (SU-8) lands with copies
 * in Phase 3 (D-31); until then this blocks the supplier's own routes.
 */
export async function adminSetStatus(id: string, status: "ACTIVE" | "SUSPENDED", note: string) {
  const supplier = await deps.prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw HttpError.notFound("Supplier not found");
  const updated = await deps.prisma.supplier.update({
    where: { id },
    data: { status, statusNote: note },
  });
  const store = await deps.host.getStore(supplier.storeId);
  if (store) {
    deps.host.notify(store.ownerId, {
      title: status === "SUSPENDED" ? "Supplying is paused by UnieMax" : "You can supply sellers again",
      body: status === "SUSPENDED" ? `Reason: ${note}. Contact UnieMax support to resolve it.` : note,
      url: `/mystores/${store.slug}/sellers`,
    });
  }
  await syncForSupplier(id); // SU-8: copies pause / resume
  return shapeProfile(updated);
}
