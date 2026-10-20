import { mediaUrl } from "../../storage/index.js";
import { buildListMeta } from "../../../utils/response.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { deliveryCharge, deliveryLabel, earnings, suggestedPrice } from "../domain.js";
import type { CatalogQuery } from "../schema.js";

/**
 * The seller's catalogue: the offered products of its ACTIVE suppliers, each
 * with "You earn" worked out from this store's own delivery charge, plus what
 * the add sheet needs (shelves, delivery mode, the warning threshold).
 */
export async function browseCatalog(storeId: string, query: CatalogQuery) {
  const links = await deps.prisma.supplierLink.findMany({
    where: { sellerStoreId: storeId, status: "ACTIVE", supplier: { status: "ACTIVE" } },
    include: { supplier: true },
  });
  const supplierStores = await deps.host.getStores(links.map((l) => l.supplier.storeId));
  const storeById = new Map(supplierStores.map((s) => [s.id, s]));
  const live = links.filter((l) => {
    const s = storeById.get(l.supplier.storeId);
    return s && !s.suspended;
  });

  const [supplyProducts, selling, shelves, added] = await Promise.all([
    deps.prisma.supplyProduct.findMany({
      where: { supplierId: { in: live.map((l) => l.supplierId) }, isOpen: true },
      include: { variants: true },
    }),
    deps.host.getStoreSelling(storeId),
    deps.host.listShelves(storeId),
    deps.prisma.resale.findMany({ where: { sellerStoreId: storeId }, select: { supplyProductId: true, productId: true } }),
  ]);
  const addedBy = new Map(added.map((a) => [a.supplyProductId, a.productId]));
  const linkBySupplier = new Map(live.map((l) => [l.supplierId, l]));
  const sources = new Map(
    (await deps.host.getProductSnapshots(supplyProducts.map((s) => s.productId))).map((p) => [p.id, p]),
  );

  const all = supplyProducts.flatMap((sp) => {
    const source = sources.get(sp.productId);
    const link = linkBySupplier.get(sp.supplierId);
    if (!source || !source.isActive || !link) return [];
    const offers = new Map(sp.variants.map((v) => [v.variantId, v]));
    const variants = source.variants.flatMap((v) => {
      const offer = offers.get(v.id);
      if (!offer || !offer.isOpen || !v.isActive) return [];
      const suggested = suggestedPrice({
        cost: offer.cost,
        shopPrice: v.price,
        mrp: v.compareAtPrice,
        markupPct: dropshipConfig.suggestedMarkupPct,
      });
      return [{
        supplyVariantId: v.id,
        name: v.name,
        isDefault: v.isDefault,
        optionValues: v.optionValues,
        cost: Number(offer.cost),
        shopPrice: Number(v.price),
        mrp: v.compareAtPrice ? Number(v.compareAtPrice) : null,
        suggested: Number(suggested),
        stock: v.stock,
      }];
    });
    if (variants.length === 0) return [];
    const cheapest = variants.reduce((a, b) => (b.suggested < a.suggested ? b : a));
    const youEarn = earnings({
      price: cheapest.suggested,
      cost: cheapest.cost,
      delivery: deliveryCharge(selling.rate, cheapest.suggested),
      supplierShipping: link.supplier.shippingFee,
      platformFeePct: dropshipConfig.platformFeePct,
    }).youEarn;
    const image = source.media.find((m) => m.type === "IMAGE");
    const supplierStore = storeById.get(link.supplier.storeId);
    return [{
      supplyProductId: sp.id,
      name: source.name,
      imageUrl: mediaUrl("media", image?.key ?? null),
      supplier: { id: link.supplierId, name: supplierStore?.name ?? "Supplier" },
      category: source.globalCategoryId ? { id: source.globalCategoryId, name: source.globalCategoryName } : null,
      costMin: Math.min(...variants.map((v) => v.cost)),
      costMax: Math.max(...variants.map((v) => v.cost)),
      suggestedPrice: cheapest.suggested,
      youEarn: Number(youEarn),
      delivery: deliveryLabel(source.deliveryRule),
      returnDays: link.supplier.returnDays,
      shipWithinDays: link.supplier.shipWithinDays,
      supplierShippingFee: Number(link.supplier.shippingFee),
      codAllowed: link.codAllowed,
      inStoreProductId: addedBy.get(sp.id) ?? null,
      variants,
    }];
  });

  const q = query.q?.toLowerCase();
  const filtered = all
    .filter((p) => !query.supplierId || p.supplier.id === query.supplierId)
    .filter((p) => !query.categoryId || p.category?.id === query.categoryId)
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .filter((p) => query.minPrice === undefined || p.costMax >= query.minPrice)
    .filter((p) => query.maxPrice === undefined || p.costMin <= query.maxPrice)
    .sort((a, b) => a.name.localeCompare(b.name));
  const start = (query.page - 1) * query.pageSize;

  return {
    items: filtered.slice(start, start + query.pageSize),
    meta: buildListMeta(filtered.length, query.page, query.pageSize),
    filters: {
      suppliers: live.map((l) => ({ id: l.supplierId, name: storeById.get(l.supplier.storeId)?.name ?? "Supplier" })),
      categories: [...new Map(all.flatMap((p) => (p.category ? [[p.category.id, p.category]] : []))).values()],
    },
    store: {
      mode: selling.mode,
      deliveryRate: selling.rate,
      shelves,
      platformFeePct: dropshipConfig.platformFeePct,
      minMarginWarnPct: dropshipConfig.minMarginWarnPct,
    },
  };
}
