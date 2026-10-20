import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import {
  addOnTop,
  capAtMrp,
  deliveryCharge,
  earnings,
  pauseText,
  planSync,
  priceProblem,
  rupee,
  suggestedPrice,
} from "../domain.js";
import type { PauseReason } from "../domain.js";
import type { ResaleAddInput } from "../schema.js";
import type { CopyMediaInput, ProductSnapshot, StoreRef } from "../types.js";

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);

// ===========================================================================
// Sync — the only path by which supplier changes reach copies
// ===========================================================================

/**
 * Bring one copy in line with its supplier (docs/dropshipping/supplier-products
 * → Sync rules). Idempotent: running it twice changes nothing the second time.
 */
export async function syncResale(resaleId: string): Promise<void> {
  const resale = await deps.prisma.resale.findUnique({
    where: { id: resaleId },
    include: {
      variants: true,
      link: { include: { supplier: true } },
      supplyProduct: { include: { variants: true } },
    },
  });
  if (!resale) return;

  const copy = await deps.host.getCopyState(resale.productId);
  if (!copy) {
    // The seller deleted the product itself: nothing left to keep in sync.
    await deps.prisma.resale.delete({ where: { id: resale.id } }).catch(() => {});
    return;
  }
  const supplier = resale.link.supplier;
  const [[source], supplierStore] = await Promise.all([
    deps.host.getProductSnapshots([resale.supplyProduct.productId]),
    deps.host.getStore(supplier.storeId),
  ]);
  const prices = new Map(copy.variants.map((v) => [v.id, v.price]));

  const plan = planSync({
    resale: {
      followCost: resale.followCost,
      state: resale.state,
      pauseReason: resale.pauseReason,
      resumeOnClear: resale.resumeOnClear,
    },
    copy: {
      isActive: copy.isActive,
      hasImage: copy.hasImage,
      variants: resale.variants.flatMap((v) => {
        const price = prices.get(v.variantId);
        return price === undefined
          ? []
          : [{ variantId: v.variantId, supplyVariantId: v.supplyVariantId, lastCost: v.lastCost.toFixed(2), price }];
      }),
    },
    source: source
      ? {
          isActive: source.isActive,
          optionTypes: source.optionTypes,
          deliveryRule: source.deliveryRule,
          variants: source.variants.map((v) => ({
            id: v.id,
            name: v.name,
            isActive: v.isActive,
            compareAtPrice: v.compareAtPrice,
            stock: v.stock,
            optionValues: v.optionValues,
          })),
        }
      : null,
    supply: {
      isOpen: resale.supplyProduct.isOpen,
      variants: resale.supplyProduct.variants.map((v) => ({
        variantId: v.variantId,
        cost: v.cost.toFixed(2),
        isOpen: v.isOpen,
      })),
    },
    supplierActive: supplier.status === "ACTIVE",
    supplierStoreActive: supplierStore != null && !supplierStore.suspended,
    linkActive: resale.link.status === "ACTIVE",
    codAllowed: resale.link.codAllowed,
  });

  await deps.prisma.$transaction(async (tx) => {
    await deps.host.updateCopy(tx, resale.productId, plan.copy);
    for (const lc of plan.lastCosts) {
      await tx.resaleVariant.update({ where: { variantId: lc.variantId }, data: { lastCost: lc.lastCost } });
    }
    await tx.resale.update({ where: { id: resale.id }, data: plan.resale });
  });

  // Rule 7: tell the seller only when the state or the price changed.
  if (plan.priceChanges.length === 0 && !plan.stateChanged) return;
  const seller = await deps.host.getStore(resale.sellerStoreId);
  if (!seller) return;
  const url = `/mystores/${seller.slug}/products`;
  if (plan.stateChanged === "PAUSED" && plan.resale.pauseReason) {
    deps.host.notify(seller.ownerId, {
      title: `${copy.name} is paused`,
      body: `${pauseText(plan.resale.pauseReason)}. Customers can't see it until this is fixed.`,
      url,
    });
  } else if (plan.stateChanged === "RESUMED") {
    deps.host.notify(seller.ownerId, {
      title: `${copy.name} can be sold again`,
      body: plan.copy.isActive ? "It's back in your shop." : "Switch it on in your products when you're ready.",
      url,
    });
  }
  if (plan.priceChanges.length > 0) {
    const capped = plan.priceChanges.some((c) => c.capped);
    const first = plan.priceChanges[0]!;
    deps.host.notify(seller.ownerId, {
      title: `${copy.name}: the supplier changed their price`,
      body: capped
        ? `Your price stopped at the MRP (${rupee(first.to)}), so you earn less on it.`
        : `Your price is now ${rupee(first.to)} (was ${rupee(first.from)}) — you still earn the same.`,
      url,
    });
  }
}

/** Sync every copy matching `where`, one at a time; one failure never stops the rest. */
async function syncWhere(where: Prisma.ResaleWhereInput): Promise<number> {
  const rows = await deps.prisma.resale.findMany({ where, select: { id: true } });
  for (const row of rows) {
    await syncResale(row.id).catch((err) => console.error("Resale sync failed:", row.id, err));
  }
  return rows.length;
}

export const syncForSupplierProduct = (productId: string) =>
  syncWhere({ supplyProduct: { productId } });
export const syncForSupplierVariant = async (variantId: string) => {
  const offered = await deps.prisma.supplyVariant.findUnique({ where: { variantId }, select: { supplyProductId: true } });
  if (offered) await syncWhere({ supplyProductId: offered.supplyProductId });
};
export const syncForLink = (linkId: string) => syncWhere({ linkId });
export const syncForSupplier = (supplierId: string) => syncWhere({ link: { supplierId } });
export const syncAll = () => syncWhere({});

// ===========================================================================
// Catalogue helpers
// ===========================================================================

type OfferedVariant = { variantId: string; cost: Prisma.Decimal; isOpen: boolean };

/** Option values used by a set of variants, in the supplier's order. */
function usedOptionTypes(
  types: { name: string; values: string[] }[],
  variants: { optionValues: Record<string, string> | null }[],
) {
  return types
    .map((t) => ({
      name: t.name,
      values: t.values.filter((val) => variants.some((v) => v.optionValues?.[t.name] === val)),
    }))
    .filter((t) => t.values.length > 0);
}

/** The variants of a supplier product a seller can sell: offered, priced, active. */
function sellableVariants(source: ProductSnapshot, offered: OfferedVariant[]) {
  const byId = new Map(offered.map((o) => [o.variantId, o]));
  return source.variants.flatMap((v) => {
    const offer = byId.get(v.id);
    return offer && offer.isOpen && v.isActive ? [{ variant: v, cost: offer.cost }] : [];
  });
}

// ===========================================================================
// Add one or many
// ===========================================================================

/**
 * Add supplier products to the seller's store as real products (D-9). Each
 * product: photos copied first (storage), then one transaction writes the
 * copy, its Resale and the ResaleVariants with `lastCost`.
 */
export async function addResales(store: StoreRef, customerId: string, input: ResaleAddInput) {
  const ids = input.items.map((i) => i.supplyProductId);
  const supplyProducts = await deps.prisma.supplyProduct.findMany({
    where: { id: { in: ids } },
    include: { variants: true, supplier: true },
  });
  const links = await deps.prisma.supplierLink.findMany({
    where: { sellerStoreId: store.id, status: "ACTIVE", supplierId: { in: supplyProducts.map((s) => s.supplierId) } },
  });
  const linkBySupplier = new Map(links.map((l) => [l.supplierId, l]));
  const existing = await deps.prisma.resale.findMany({
    where: { sellerStoreId: store.id, supplyProductId: { in: ids } },
    select: { supplyProductId: true, productId: true },
  });
  const already = new Map(existing.map((e) => [e.supplyProductId, e.productId]));
  if (input.items.length === 1 && already.has(ids[0]!)) {
    throw HttpError.conflict("Already in your store"); // C-10
  }

  const sources = new Map(
    (await deps.host.getProductSnapshots(supplyProducts.map((s) => s.productId))).map((p) => [p.id, p]),
  );
  const selling = await deps.host.getStoreSelling(store.id);
  if (selling.mode === "PICKUP") {
    if (input.deliveryAmount === undefined) {
      throw HttpError.badRequest("Supplier products need home delivery — set your delivery charge");
    }
    await deps.host.setStoreDelivery(customerId, store.id, input.deliveryAmount); // C-22
  }
  const shelves = await deps.host.listShelves(store.id);
  if ("shelfId" in input.shelf && !shelves.some((s) => s.id === (input.shelf as { shelfId: string }).shelfId)) {
    throw HttpError.badRequest("Choose one of your shelves");
  }

  const results: { supplyProductId: string; productId: string; added: boolean; isActive: boolean }[] = [];
  for (const item of input.items) {
    const sp = supplyProducts.find((s) => s.id === item.supplyProductId);
    const link = sp ? linkBySupplier.get(sp.supplierId) : undefined;
    const source = sp ? sources.get(sp.productId) : undefined;
    // C-11: only products of a supplier this seller works with, still offered.
    if (!sp || !link || !source || !sp.isOpen || sp.supplier.status !== "ACTIVE") {
      throw HttpError.badRequest("That product isn't offered to you");
    }
    const existingCopy = already.get(sp.id);
    if (existingCopy) {
      results.push({ supplyProductId: sp.id, productId: existingCopy, added: false, isActive: true });
      continue;
    }

    const sellable = sellableVariants(source, sp.variants);
    if (sellable.length === 0) throw HttpError.badRequest(`"${source.name}" has no options on offer right now`);

    // Prices: each option's own, else "add on top", else the suggestion.
    const explicit = new Map((item.prices ?? []).map((p) => [p.supplyVariantId, p.price]));
    const priced = sellable.map(({ variant, cost }) => {
      const mrp = variant.compareAtPrice;
      const price =
        explicit.has(variant.id)
          ? D(explicit.get(variant.id)!)
          : input.addOnTop
            ? addOnTop(cost, input.addOnTop, mrp)
            : suggestedPrice({ cost, shopPrice: variant.price, mrp, markupPct: dropshipConfig.suggestedMarkupPct });
      const problem = priceProblem(price, cost, mrp);
      if (problem) throw HttpError.badRequest(`${source.name}${variant.isDefault ? "" : ` (${variant.name})`}: ${problem}`);
      return { variant, cost, price, mrp };
    });

    const shelfId =
      "shelfId" in input.shelf
        ? input.shelf.shelfId
        : source.globalCategoryId
          ? await deps.host.ensureShelf(customerId, store.id, source.globalCategoryId)
          : null;
    if (!shelfId) {
      throw HttpError.badRequest(`Choose one of your shelves for "${source.name}"`); // D-32
    }

    // Photos: copies own theirs (C-9).
    const media: CopyMediaInput[] = [];
    const mediaIndex = new Map<string, number>();
    for (const m of source.media) {
      const key = await deps.host.copyMedia(m.key, store.id);
      if (!key) continue;
      mediaIndex.set(m.id, media.length);
      media.push({ key, type: m.type, altText: m.altText, displayOrder: m.displayOrder });
    }
    const hasImage = media.some((m) => m.type === "IMAGE");

    try {
      const productId = await deps.prisma.$transaction(async (tx) => {
        const copy = await deps.host.createCopy(tx, {
          storeId: store.id,
          shelfId,
          globalCategoryId: source.globalCategoryId,
          name: source.name,
          description: source.description,
          specifications: source.specifications,
          optionTypes: usedOptionTypes(source.optionTypes, priced.map((p) => p.variant)),
          deliveryRule: source.deliveryRule,
          codAvailable: link.codAllowed,
          isActive: hasImage,
          media,
          // No SKU (C-16): SKUs are unique per store.
          variants: priced.map(({ variant, price, mrp }) => ({
            name: variant.name,
            isDefault: variant.isDefault,
            optionValues: variant.optionValues,
            price: price.toFixed(2),
            compareAtPrice: mrp != null && D(mrp).gt(price) ? D(mrp).toFixed(2) : null,
            stockQuantity: variant.stock,
            isActive: true,
            mediaIndex: variant.mediaId ? mediaIndex.get(variant.mediaId) ?? null : null,
          })),
        });
        await tx.resale.create({
          data: {
            sellerStoreId: store.id,
            linkId: link.id,
            productId: copy.productId,
            supplyProductId: sp.id,
            followCost: input.followCost,
            variants: {
              create: priced.map((p, i) => ({
                variantId: copy.variantIds[i]!,
                supplyVariantId: p.variant.id,
                lastCost: p.cost,
              })),
            },
          },
        });
        return copy.productId;
      });
      results.push({ supplyProductId: sp.id, productId, added: true, isActive: hasImage });
    } catch (err) {
      await deps.host.removeMedia(media.map((m) => m.key));
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw HttpError.conflict(`"${source.name}" is already in your store`); // C-10 race
      }
      throw err;
    }
  }
  return results;
}

// ===========================================================================
// The seller's supplier products
// ===========================================================================

/** Supplier products in this store, with their state, pause reason and one-tap fix. */
export async function listResales(storeId: string, productId?: string) {
  const rows = await deps.prisma.resale.findMany({
    where: { sellerStoreId: storeId, ...(productId ? { productId } : {}) },
    include: { variants: true, link: { include: { supplier: true } }, supplyProduct: { include: { variants: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return [];
  const [copies, sources, supplierStores, selling] = await Promise.all([
    Promise.all(rows.map((r) => deps.host.getCopyState(r.productId))),
    deps.host.getProductSnapshots(rows.map((r) => r.supplyProduct.productId)),
    deps.host.getStores([...new Set(rows.map((r) => r.link.supplier.storeId))]),
    deps.host.getStoreSelling(storeId),
  ]);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const storeById = new Map(supplierStores.map((s) => [s.id, s]));

  return rows.flatMap((r, i) => {
    const copy = copies[i];
    if (!copy) return [];
    const source = sourceById.get(r.supplyProduct.productId);
    const offered = new Map(r.supplyProduct.variants.map((v) => [v.variantId, v]));
    const sourceVariants = new Map(source?.variants.map((v) => [v.id, v]) ?? []);
    const copyVariants = new Map(copy.variants.map((v) => [v.id, v]));
    const variants = r.variants.flatMap((rv) => {
      const cv = copyVariants.get(rv.variantId);
      if (!cv) return [];
      const cost = offered.get(rv.supplyVariantId)?.cost ?? null;
      const mrp = sourceVariants.get(rv.supplyVariantId)?.compareAtPrice ?? null;
      const youEarn = cost
        ? earnings({
            price: cv.price,
            cost,
            delivery: deliveryCharge(selling.rate, cv.price),
            supplierShipping: r.link.supplier.shippingFee,
            platformFeePct: dropshipConfig.platformFeePct,
          }).youEarn
        : null;
      // The fix for "cost above price": the seller's old margin back, capped at MRP.
      const fixPrice =
        cost && D(cost).gt(cv.price) ? capAtMrp(D(cost).add(Prisma.Decimal.max(0, D(cv.price).sub(rv.lastCost))), mrp) : null;
      return [{
        variantId: rv.variantId,
        name: cv.name,
        price: Number(cv.price),
        cost: cost ? Number(cost) : null,
        mrp: mrp ? Number(mrp) : null,
        isActive: cv.isActive,
        youEarn: youEarn ? Number(youEarn) : null,
        fixPrice: fixPrice && (mrp == null || fixPrice.gte(cost!)) ? Number(fixPrice) : null,
      }];
    });
    const newOptions = (source ? sellableVariants(source, r.supplyProduct.variants) : [])
      .filter(({ variant }) => !r.variants.some((rv) => rv.supplyVariantId === variant.id))
      .map(({ variant, cost }) => ({
        supplyVariantId: variant.id,
        name: variant.name,
        cost: Number(cost),
        mrp: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
      }));
    const supplierStore = storeById.get(r.link.supplier.storeId);
    return [{
      id: r.id,
      productId: r.productId,
      name: copy.name,
      isActive: copy.isActive,
      followCost: r.followCost,
      state: r.state,
      pauseReason: r.pauseReason as PauseReason | null,
      pauseText: r.pauseReason ? pauseText(r.pauseReason) : null,
      supplier: { name: supplierStore?.name ?? "Supplier", linkId: r.linkId },
      supplierShippingFee: Number(r.link.supplier.shippingFee),
      variants,
      newOptions,
    }];
  });
}

async function ownResale(storeId: string, id: string) {
  const row = await deps.prisma.resale.findFirst({
    where: { id, sellerStoreId: storeId },
    include: { variants: true, supplyProduct: { include: { variants: true } } },
  });
  if (!row) throw HttpError.notFound("Supplier product not found");
  return row;
}

/** D-12: follow the supplier's price, or keep a fixed one. */
export async function setFollow(storeId: string, id: string, followCost: boolean) {
  const row = await ownResale(storeId, id);
  const costs = new Map(row.supplyProduct.variants.map((v) => [v.variantId, v.cost]));
  await deps.prisma.$transaction(async (tx) => {
    await tx.resale.update({ where: { id }, data: { followCost } });
    if (followCost) {
      // Start following from today's price: no jump for changes made while fixed.
      for (const rv of row.variants) {
        const cost = costs.get(rv.supplyVariantId);
        if (cost) await tx.resaleVariant.update({ where: { id: rv.id }, data: { lastCost: cost } });
      }
    }
  });
  await syncResale(id);
  return (await listResales(storeId, row.productId))[0]!;
}

/** C-20: the supplier's latest photos and description; reports options not yet added (C-8). */
export async function refreshResale(store: StoreRef, id: string) {
  const row = await ownResale(store.id, id);
  const [source] = await deps.host.getProductSnapshots([row.supplyProduct.productId]);
  if (!source) throw HttpError.conflict("The supplier removed this product");
  const media: CopyMediaInput[] = [];
  for (const m of source.media) {
    const key = await deps.host.copyMedia(m.key, store.id);
    if (key) media.push({ key, type: m.type, altText: m.altText, displayOrder: m.displayOrder });
  }
  try {
    const oldKeys = await deps.prisma.$transaction((tx) =>
      deps.host.replaceCopyContent(tx, row.productId, { description: source.description, media }),
    );
    await deps.host.removeMedia(oldKeys);
  } catch (err) {
    await deps.host.removeMedia(media.map((m) => m.key));
    throw err;
  }
  return (await listResales(store.id, row.productId))[0]!;
}

/** C-8: add an option the supplier offers that the copy doesn't carry yet. */
export async function addResaleOption(storeId: string, id: string, supplyVariantId: string, price: number) {
  const row = await ownResale(storeId, id);
  if (row.variants.some((v) => v.supplyVariantId === supplyVariantId)) {
    throw HttpError.conflict("That option is already in your store");
  }
  const offer = row.supplyProduct.variants.find((v) => v.variantId === supplyVariantId && v.isOpen);
  const [source] = await deps.host.getProductSnapshots([row.supplyProduct.productId]);
  const variant = source?.variants.find((v) => v.id === supplyVariantId && v.isActive);
  if (!offer || !variant) throw HttpError.badRequest("That option isn't offered to you");
  const problem = priceProblem(price, offer.cost, variant.compareAtPrice);
  if (problem) throw HttpError.badRequest(problem);
  await deps.prisma.$transaction(async (tx) => {
    const variantId = await deps.host.addCopyVariant(tx, row.productId, {
      name: variant.name,
      isDefault: false,
      optionValues: variant.optionValues,
      price: D(price).toFixed(2),
      compareAtPrice: variant.compareAtPrice && D(variant.compareAtPrice).gt(price) ? variant.compareAtPrice : null,
      stockQuantity: variant.stock,
      isActive: true,
      mediaIndex: null,
    });
    // The copy's implicit Default (if any) went with it.
    const live = await tx.storeProductVariant.findMany({ where: { productId: row.productId }, select: { id: true } });
    const liveIds = new Set(live.map((v) => v.id));
    await tx.resaleVariant.deleteMany({ where: { resaleId: id, variantId: { notIn: [...liveIds] } } });
    await tx.resaleVariant.create({ data: { resaleId: id, variantId, supplyVariantId, lastCost: offer.cost } });
  });
  await syncResale(id);
  return (await listResales(storeId, row.productId))[0]!;
}

/**
 * The paused note's one tap (C-1): each option the supplier's price passed is
 * set back to the seller's old margin on top of the new price (capped at MRP).
 */
export async function fixPrices(storeId: string, id: string) {
  const row = await ownResale(storeId, id);
  const fixes = (await listResales(storeId, row.productId))[0]?.variants.filter((v) => v.fixPrice != null) ?? [];
  if (fixes.length === 0) throw HttpError.conflict("Nothing to fix — the price is already fine");
  const costs = new Map(row.supplyProduct.variants.map((v) => [v.variantId, v.cost]));
  await deps.prisma.$transaction(async (tx) => {
    await deps.host.updateCopy(tx, row.productId, {
      variants: fixes.map((f) => ({ variantId: f.variantId, price: D(f.fixPrice!).toFixed(2) })),
    });
    for (const f of fixes) {
      const rv = row.variants.find((v) => v.variantId === f.variantId)!;
      const cost = costs.get(rv.supplyVariantId);
      if (cost) await tx.resaleVariant.update({ where: { id: rv.id }, data: { lastCost: cost } });
    }
  });
  await syncResale(id);
  return (await listResales(storeId, row.productId))[0]!;
}

/**
 * C-14: remove from the store. The copy is switched off with no stock and
 * detached — it becomes the seller's own product again; orders placed keep
 * their snapshots.
 */
export async function removeResale(storeId: string, id: string) {
  const row = await ownResale(storeId, id);
  await deps.prisma.$transaction(async (tx) => {
    await deps.host.updateCopy(tx, row.productId, {
      isActive: false,
      variants: row.variants.map((v) => ({ variantId: v.variantId, stockQuantity: 0 })),
    });
    await tx.resale.delete({ where: { id } });
  });
}

/** How many sellers carry each of these supply products ("Sold by N sellers"). */
export async function sellerCounts(supplyProductIds: string[]) {
  const rows = await deps.prisma.resale.groupBy({
    by: ["supplyProductId"],
    where: { supplyProductId: { in: supplyProductIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.supplyProductId, r._count._all]));
}
