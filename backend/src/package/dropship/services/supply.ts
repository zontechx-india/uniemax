import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { deps } from "../deps.js";
import { discountedCost, termText } from "../domain.js";
import type { TermDiff } from "../domain.js";
import type { SupplyBulkInput, SupplyUpdateInput } from "../schema.js";
import type { ProductRef } from "../types.js";
import { logChanges } from "./terms.js";
import { sellerCounts, syncForSupplierProduct } from "./resale.js";

/**
 * SU-11: only a store's own products may be offered, never a copy of another
 * supplier's (copies are the products with a Resale row).
 */
async function isCopy(productId: string): Promise<boolean> {
  return (await deps.prisma.resale.count({ where: { productId } })) > 0;
}

type SupplyRow = Prisma.SupplyProductGetPayload<{ include: { variants: true } }>;

function shape(product: ProductRef, supply: SupplyRow | undefined, sellers = 0) {
  const byVariant = new Map(supply?.variants.map((v) => [v.variantId, v]) ?? []);
  return {
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    isOpen: supply?.isOpen ?? false,
    /** "Sold by N sellers". */
    sellers,
    variants: product.variants.map((variant) => {
      const offered = byVariant.get(variant.id);
      const cost = offered ? Number(offered.cost) : null;
      return {
        variantId: variant.id,
        name: variant.name,
        isDefault: variant.isDefault,
        isActive: variant.isActive,
        price: Number(variant.price),
        stock: variant.stock,
        cost,
        isOpen: offered?.isOpen ?? false,
        /** SU-12: allowed, but shown as a warning. */
        aboveShopPrice: cost != null && cost > Number(variant.price),
      };
    }),
  };
}

export async function listSupply(supplierId: string, storeId: string) {
  const [products, supply] = await Promise.all([
    deps.host.listStoreProducts(storeId),
    deps.prisma.supplyProduct.findMany({ where: { supplierId }, include: { variants: true } }),
  ]);
  const byProduct = new Map(supply.map((s) => [s.productId, s]));
  const counts = await sellerCounts(supply.map((s) => s.id));
  return products.map((p) => {
    const row = byProduct.get(p.id);
    return shape(p, row, row ? counts.get(row.id) ?? 0 : 0);
  });
}

async function ownProducts(storeId: string, productIds: string[]) {
  const products = await deps.host.getStoreProducts(storeId, productIds);
  if (products.length !== new Set(productIds).size) {
    throw HttpError.notFound("Product not found in your store");
  }
  for (const product of products) {
    if (await isCopy(product.id)) {
      throw HttpError.badRequest(`"${product.name}" is another supplier's product — you can only offer your own`);
    }
  }
  return products;
}

/**
 * Write the offer for one product and log every price change as a
 * supplier-wide term (`cost:{variantId}`).
 */
async function writeOffer(
  supplierId: string,
  customerId: string,
  product: ProductRef,
  isOpen: boolean,
  variants: { variantId: string; cost: Prisma.Decimal | null; isOpen: boolean }[],
) {
  await deps.prisma.$transaction(async (tx) => {
    const current = await tx.supplyProduct.findUnique({
      where: { productId: product.id },
      include: { variants: true },
    });
    if (current && current.supplierId !== supplierId) {
      throw HttpError.conflict("This product is offered by another supplier");
    }
    const supply =
      current ??
      (await tx.supplyProduct.create({ data: { supplierId, productId: product.id, isOpen } }));
    if (current) {
      await tx.supplyProduct.update({ where: { id: current.id }, data: { isOpen } });
    }

    const before = new Map(current?.variants.map((v) => [v.variantId, v]) ?? []);
    const diffs: TermDiff[] = [];
    for (const v of variants) {
      const prev = before.get(v.variantId);
      if (v.cost == null) {
        // No price means the option isn't offered.
        if (prev) {
          await tx.supplyVariant.update({ where: { id: prev.id }, data: { isOpen: false } });
        }
        continue;
      }
      if (prev) {
        await tx.supplyVariant.update({
          where: { id: prev.id },
          data: { cost: v.cost, isOpen: v.isOpen },
        });
      } else {
        await tx.supplyVariant.create({
          data: { supplyProductId: supply.id, variantId: v.variantId, cost: v.cost, isOpen: v.isOpen },
        });
      }
      if (!prev || !prev.cost.eq(v.cost)) {
        diffs.push({
          field: `cost:${v.variantId}`,
          fromValue: prev ? termText(prev.cost) : null,
          toValue: termText(v.cost),
        });
      }
    }
    await logChanges(tx, { supplierId, linkId: null, diffs, changedBy: customerId, changedAs: "SUPPLIER" });
  });
}

/** Offer or withdraw one product, with a price for sellers per option. */
export async function updateSupply(
  supplierId: string,
  storeId: string,
  customerId: string,
  productId: string,
  input: SupplyUpdateInput,
) {
  const [product] = await ownProducts(storeId, [productId]);
  const known = new Set(product!.variants.map((v) => v.id));
  for (const v of input.variants) {
    if (!known.has(v.variantId)) throw HttpError.badRequest("That option isn't part of this product");
    if (v.isOpen && v.cost == null) throw HttpError.badRequest("Enter a price for sellers for each option you offer");
  }
  if (input.isOpen && !input.variants.some((v) => v.isOpen)) {
    throw HttpError.badRequest("Offer at least one option, with its price for sellers");
  }
  await writeOffer(
    supplierId,
    customerId,
    product!,
    input.isOpen,
    input.variants.map((v) => ({
      variantId: v.variantId,
      cost: v.cost == null ? null : new Prisma.Decimal(v.cost),
      isOpen: v.isOpen,
    })),
  );
  await syncForSupplierProduct(productId); // copies follow the new prices / offer
  const supply = await deps.prisma.supplyProduct.findUnique({
    where: { productId },
    include: { variants: true },
  });
  const counts = supply ? await sellerCounts([supply.id]) : new Map<string, number>();
  return shape(product!, supply ?? undefined, supply ? counts.get(supply.id) ?? 0 : 0);
}

/** Bulk "Offer at shop price − N %": every option of each product, still editable after. */
export async function bulkOffer(
  supplierId: string,
  storeId: string,
  customerId: string,
  input: SupplyBulkInput,
) {
  const products = await ownProducts(storeId, input.productIds);
  for (const product of products) {
    await writeOffer(
      supplierId,
      customerId,
      product,
      true,
      product.variants.map((v) => ({
        variantId: v.id,
        cost: discountedCost(v.price, input.discountPct),
        isOpen: v.isActive,
      })),
    );
    await syncForSupplierProduct(product.id);
  }
  return listSupply(supplierId, storeId);
}
