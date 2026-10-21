import { Prisma } from "../../../generated/prisma/client.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { mediaUrl, newObjectKey, sniffContentType, storage } from "../../storage/index.js";
import { createCategory } from "../../../modules/stores/storeCatalog.service.js";
import { recomputeProductAggregates, uniqueProductSlug } from "../../../modules/stores/catalogSlug.js";
import {
  effectiveDeliveryRule,
  resolveProductDeliveryRule,
} from "../../../modules/stores/deliveryRules.js";
import { resolveShipping } from "../../../modules/stores/stores.schema.js";
import { publicWebUrl, sendMail } from "../../mail/index.js";
import { notify } from "../../../modules/notifications/notifications.service.js";
import {
  createStoreWithoutLogo,
  updateStorePayments,
  updateStoreShipping,
} from "../../../modules/stores/stores.service.js";
import { resolvePayments } from "../../../modules/stores/stores.schema.js";
import { resolveProfile } from "../../../modules/stores/storeProfile.schema.js";
import { storeAddressSchema } from "../../../modules/stores/storeAddress.schema.js";
import {
  createPackageShipment,
  markPackageShipmentDelivered,
  markPackageShipmentReturned,
  updatePackageShipmentTracking,
} from "../../../modules/orders/shipments.service.js";
import { shipmentTrackingSchema } from "../../../modules/orders/orders.schema.js";
import { cancelOrderAsSystem, confirmOrderAsSystem } from "../../../modules/orders/orders.service.js";
import { createTicket } from "../../../modules/support/support.service.js";
import type { DropshipHost, OptionTypeRef, OrderView, ProductRef, StoreRef } from "../types.js";

const json = (value: unknown) =>
  value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);

/**
 * The host as seen from inside the same process: reads the core tables
 * directly. This is the only dropship file allowed to import core modules —
 * a standalone service replaces it with one that calls the core over HTTP.
 */
export function createInProcessHost(prisma: PrismaClient): DropshipHost {
  const storeSelect = {
    id: true,
    name: true,
    slug: true,
    ownerId: true,
    logoKey: true,
    isPublished: true,
    suspendedAt: true,
    payments: true,
    profile: true,
  } as const;

  type StoreRow = {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    logoKey: string | null;
    isPublished: boolean;
    suspendedAt: Date | null;
    payments: unknown;
    profile: unknown;
  };

  const shapeStore = (row: StoreRow): StoreRef => {
    const profile = resolveProfile(row.profile);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.ownerId,
      logoUrl: mediaUrl("logo", row.logoKey),
      isPublished: row.isPublished,
      suspended: row.suspendedAt != null,
      acceptCod: resolvePayments(row.payments).acceptCod,
      phone: profile.phone,
      email: profile.email,
      hasAddress: profile.address != null,
      address: profile.address
        ? [
            profile.address.line1,
            profile.address.line2,
            profile.address.city,
            `${profile.address.state} ${profile.address.pincode}`,
          ]
            .filter(Boolean)
            .join(", ")
        : null,
    };
  };

  const productSelect = {
    id: true,
    name: true,
    isActive: true,
    media: {
      where: { type: "IMAGE" as const },
      orderBy: { displayOrder: "asc" as const },
      take: 1,
      select: { key: true },
    },
    variants: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isActive: true,
        price: true,
        stockQuantity: true,
      },
    },
  } as const;

  type ProductRow = {
    id: string;
    name: string;
    isActive: boolean;
    media: { key: string }[];
    variants: {
      id: string;
      name: string;
      isDefault: boolean;
      isActive: boolean;
      price: { toString(): string };
      stockQuantity: number;
    }[];
  };

  const shapeProduct = (row: ProductRow): ProductRef => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    imageUrl: mediaUrl("media", row.media[0]?.key ?? null),
    variants: row.variants.map((v) => ({
      id: v.id,
      name: v.name,
      isDefault: v.isDefault,
      isActive: v.isActive,
      price: v.price.toString(),
      stock: v.stockQuantity,
    })),
  });

  const getStore = async (storeId: string) => {
    const row = await prisma.store.findUnique({ where: { id: storeId }, select: storeSelect });
    return row ? shapeStore(row) : null;
  };

  return {
    webUrl: publicWebUrl,

    getStore,

    async getStores(storeIds) {
      if (storeIds.length === 0) return [];
      const rows = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: storeSelect,
      });
      return rows.map(shapeStore);
    },

    async getOwnedStore(customerId, storeRef) {
      const row = await prisma.store.findFirst({
        where: { ownerId: customerId, OR: [{ id: storeRef }, { slug: storeRef }] },
        select: storeSelect,
      });
      if (!row) throw HttpError.notFound("Store not found");
      return shapeStore(row);
    },

    async listOwnedStores(customerId) {
      const rows = await prisma.store.findMany({
        where: { ownerId: customerId },
        select: storeSelect,
        orderBy: { createdAt: "asc" },
      });
      return rows.map(shapeStore);
    },

    async createSupplyStore(customerId, input) {
      const created = await createStoreWithoutLogo(customerId, {
        name: input.name,
        phone: input.phone,
        address: storeAddressSchema.parse(input.address),
      });
      return (await getStore(created.id))!;
    },

    async setStoreCod(customerId, storeId, on) {
      // The core's own path, so the readiness gates and the catalog event apply.
      await updateStorePayments({ kind: "owner", customerId }, storeId, { acceptCod: on });
    },

    async listStoreProducts(storeId) {
      const rows = await prisma.storeProduct.findMany({
        where: { storeId },
        select: productSelect,
        orderBy: { name: "asc" },
      });
      return rows.map(shapeProduct);
    },

    async getStoreProducts(storeId, productIds) {
      if (productIds.length === 0) return [];
      const rows = await prisma.storeProduct.findMany({
        where: { storeId, id: { in: productIds } },
        select: productSelect,
      });
      return rows.map(shapeProduct);
    },

    getCustomer: (id) =>
      prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true },
      }),

    // ---- Phase 3: copies --------------------------------------------------

    async getProductSnapshots(productIds) {
      if (productIds.length === 0) return [];
      const rows = await prisma.storeProduct.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          storeId: true,
          name: true,
          description: true,
          specifications: true,
          isActive: true,
          globalCategoryId: true,
          optionTypes: true,
          deliveryRule: true,
          store: { select: { shipping: true } },
          media: {
            orderBy: { displayOrder: "asc" },
            select: { id: true, key: true, type: true, altText: true, displayOrder: true },
          },
          variants: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              isDefault: true,
              isActive: true,
              price: true,
              compareAtPrice: true,
              stockQuantity: true,
              optionValues: true,
              sku: true,
              mediaId: true,
            },
          },
        },
      });
      const categoryIds = [...new Set(rows.flatMap((r) => (r.globalCategoryId ? [r.globalCategoryId] : [])))];
      const categories = categoryIds.length
        ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        : [];
      const names = new Map(categories.map((c) => [c.id, c.name]));
      return rows.map((row) => ({
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        description: row.description,
        specifications: row.specifications,
        isActive: row.isActive,
        globalCategoryId: row.globalCategoryId,
        globalCategoryName: row.globalCategoryId ? names.get(row.globalCategoryId) ?? null : null,
        optionTypes: Array.isArray(row.optionTypes) ? (row.optionTypes as unknown as OptionTypeRef[]) : [],
        deliveryRule: effectiveDeliveryRule(
          resolveProductDeliveryRule(row.deliveryRule),
          resolveShipping(row.store.shipping).deliveryRule,
        ),
        media: row.media,
        variants: row.variants.map((v) => ({
          id: v.id,
          name: v.name,
          isDefault: v.isDefault,
          isActive: v.isActive,
          price: v.price.toFixed(2),
          compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toFixed(2) : null,
          stock: v.stockQuantity,
          optionValues: (v.optionValues as Record<string, string> | null) ?? null,
          sku: v.sku,
          mediaId: v.mediaId,
        })),
      }));
    },

    async getStoreSelling(storeId) {
      const row = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { shipping: true } });
      const shipping = resolveShipping(row.shipping);
      return { mode: shipping.mode, rate: shipping.rate };
    },

    async listShelves(storeId) {
      const rows = await prisma.storeCategory.findMany({
        where: { storeId },
        select: { id: true, name: true, categoryId: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, name: r.name, globalCategoryId: r.categoryId }));
    },

    async ensureShelf(customerId, storeId, globalCategoryId) {
      const existing = await prisma.storeCategory.findFirst({
        where: { storeId, categoryId: globalCategoryId },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await createCategory({ kind: "owner", customerId }, storeId, {
        categoryId: globalCategoryId,
      });
      return created.id;
    },

    async setStoreDelivery(customerId, storeId, amount) {
      await updateStoreShipping({ kind: "owner", customerId }, storeId, {
        mode: "BOTH",
        rate:
          amount > 0
            ? { type: "FLAT", amount, freeAbove: null }
            : { type: "FREE", amount: 0, freeAbove: null },
      });
    },

    async copyMedia(key, toStoreId) {
      const body = await storage.get("media", key);
      if (!body) return null;
      const contentType = sniffContentType(body) ?? "application/octet-stream";
      const newKey = newObjectKey(`products/${toStoreId}/supplied`, contentType);
      await storage.put("media", newKey, body, contentType);
      return newKey;
    },

    async removeMedia(keys) {
      for (const key of keys) await storage.remove("media", key).catch(() => {});
    },

    async createCopy(tx, input) {
      const product = await tx.storeProduct.create({
        data: {
          storeId: input.storeId,
          categoryId: input.shelfId,
          globalCategoryId: input.globalCategoryId,
          name: input.name,
          slug: await uniqueProductSlug(input.storeId, input.name, tx),
          description: input.description,
          specifications: json(input.specifications),
          optionTypes: input.optionTypes.length > 0 ? (input.optionTypes as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          deliveryRule: input.deliveryRule as unknown as Prisma.InputJsonValue,
          codAvailable: input.codAvailable,
          isActive: input.isActive,
          publishedAt: input.isActive ? new Date() : null,
        },
        select: { id: true },
      });
      const mediaIds: string[] = [];
      for (const m of input.media) {
        const row = await tx.storeProductMedia.create({
          data: { productId: product.id, ...m },
          select: { id: true },
        });
        mediaIds.push(row.id);
      }
      const variantIds: string[] = [];
      for (const v of input.variants) {
        const row = await tx.storeProductVariant.create({
          data: {
            productId: product.id,
            name: v.name,
            isDefault: v.isDefault,
            optionValues: v.optionValues ? (v.optionValues as Prisma.InputJsonValue) : Prisma.DbNull,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            stockQuantity: v.stockQuantity,
            isActive: v.isActive,
            mediaId: v.mediaIndex != null ? mediaIds[v.mediaIndex] ?? null : null,
          },
          select: { id: true },
        });
        variantIds.push(row.id);
      }
      await recomputeProductAggregates(product.id, tx);
      return { productId: product.id, variantIds };
    },

    async updateCopy(tx, productId, patch) {
      const data: Prisma.StoreProductUncheckedUpdateInput = {};
      if (patch.optionTypes) {
        data.optionTypes = patch.optionTypes.length > 0
          ? (patch.optionTypes as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull;
      }
      if (patch.deliveryRule) data.deliveryRule = patch.deliveryRule as unknown as Prisma.InputJsonValue;
      if (patch.codAvailable !== undefined) data.codAvailable = patch.codAvailable;
      if (patch.isActive !== undefined) {
        data.isActive = patch.isActive;
        if (patch.isActive) {
          const row = await tx.storeProduct.findUnique({ where: { id: productId }, select: { publishedAt: true } });
          if (row && !row.publishedAt) data.publishedAt = new Date();
        }
      }
      const variants = patch.variants ?? [];
      // Names are unique per product and renames can swap labels: park them first.
      const renamed = variants.filter((v) => v.name !== undefined);
      for (const v of renamed) {
        await tx.storeProductVariant.update({ where: { id: v.variantId }, data: { name: `~${v.variantId}` } });
      }
      for (const v of variants) {
        const d: Prisma.StoreProductVariantUncheckedUpdateInput = {};
        if (v.name !== undefined) d.name = v.name;
        if (v.optionValues !== undefined) {
          d.optionValues = v.optionValues ? (v.optionValues as Prisma.InputJsonValue) : Prisma.DbNull;
        }
        if (v.price !== undefined) d.price = v.price;
        if (v.compareAtPrice !== undefined) d.compareAtPrice = v.compareAtPrice;
        if (v.stockQuantity !== undefined) d.stockQuantity = v.stockQuantity;
        if (v.isActive !== undefined) d.isActive = v.isActive;
        if (Object.keys(d).length > 0) await tx.storeProductVariant.update({ where: { id: v.variantId }, data: d });
      }
      // Lock order matters: core's placement and cancel take a variant first and the
      // product second, so the product row is written last here too — the other
      // way round, a re-sync racing a sale on the same copy can deadlock.
      if (Object.keys(data).length > 0) await tx.storeProduct.update({ where: { id: productId }, data });
      await recomputeProductAggregates(productId, tx);
    },

    async addCopyVariant(tx, productId, v) {
      const row = await tx.storeProductVariant.create({
        data: {
          productId,
          name: v.name,
          isDefault: false,
          optionValues: v.optionValues ? (v.optionValues as Prisma.InputJsonValue) : Prisma.DbNull,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stockQuantity: v.stockQuantity,
          isActive: v.isActive,
        },
        select: { id: true },
      });
      // A copy that was simple gets real options: its implicit Default goes.
      await tx.storeProductVariant.deleteMany({ where: { productId, isDefault: true } });
      await recomputeProductAggregates(productId, tx);
      return row.id;
    },

    async replaceCopyContent(tx, productId, content) {
      const old = await tx.storeProductMedia.findMany({ where: { productId }, select: { key: true } });
      await tx.storeProductVariant.updateMany({ where: { productId }, data: { mediaId: null } });
      await tx.storeProductMedia.deleteMany({ where: { productId } });
      for (const m of content.media) {
        await tx.storeProductMedia.create({ data: { productId, ...m } });
      }
      await tx.storeProduct.update({ where: { id: productId }, data: { description: content.description } });
      return old.map((m) => m.key);
    },

    async getCopyState(productId) {
      const row = await prisma.storeProduct.findUnique({
        where: { id: productId },
        select: {
          id: true,
          storeId: true,
          name: true,
          isActive: true,
          _count: { select: { media: { where: { type: "IMAGE" } } } },
          variants: { select: { id: true, name: true, price: true, isActive: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        isActive: row.isActive,
        hasImage: row._count.media > 0,
        variants: row.variants.map((v) => ({ id: v.id, name: v.name, price: v.price.toFixed(2), isActive: v.isActive })),
      };
    },

    async getOrderLines(orderId) {
      const row = await prisma.order.findUnique({
        where: { id: orderId },
        select: { storeId: true, items: { select: { productId: true } } },
      });
      if (!row) return null;
      return {
        storeId: row.storeId,
        productIds: row.items.flatMap((i) => (i.productId ? [i.productId] : [])),
      };
    },

    // ---- Phase 4: orders and parcels ---------------------------------------

    async getPlacingOrder(tx, orderId) {
      const row = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          storeId: true,
          paymentMethod: true,
          paymentStatus: true,
          total: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              productName: true,
              variantName: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
            },
          },
        },
      });
      if (!row) return null;
      // A simple product's line names no variant: its stock is the Default's.
      const simple = row.items.filter((i) => !i.variantId && i.productId).map((i) => i.productId!);
      const defaults = simple.length
        ? await tx.storeProductVariant.findMany({
            where: { productId: { in: simple }, isDefault: true },
            select: { id: true, productId: true },
          })
        : [];
      const defaultOf = new Map(defaults.map((d) => [d.productId, d.id]));
      return {
        id: row.id,
        orderNumber: row.orderNumber,
        storeId: row.storeId,
        paymentMethod: row.paymentMethod === "COD" ? "COD" : "ONLINE",
        paid: row.paymentStatus === "PAID",
        total: row.total,
        lines: row.items.map((i) => ({
          itemId: i.id,
          productId: i.productId,
          stockVariantId: i.variantId ?? (i.productId ? defaultOf.get(i.productId) ?? null : null),
          productName: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      };
    },

    async reserveStock(tx, variantId, quantity) {
      const updated = await tx.storeProductVariant.updateMany({
        where: { id: variantId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } },
      });
      if (updated.count === 0) return false;
      const v = await tx.storeProductVariant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (v) await recomputeProductAggregates(v.productId, tx);
      return true;
    },

    async releaseStock(tx, variantId, quantity) {
      const updated = await tx.storeProductVariant.updateMany({
        where: { id: variantId },
        data: { stockQuantity: { increment: quantity } },
      });
      if (updated.count === 0) return; // the supplier deleted it since
      const v = await tx.storeProductVariant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (v) await recomputeProductAggregates(v.productId, tx);
    },

    async lockOrderStock(tx, orderId) {
      const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, variantId: true } });
      const simple = items.filter((i) => !i.variantId && i.productId).map((i) => i.productId!);
      const defaults = simple.length
        ? await tx.storeProductVariant.findMany({ where: { productId: { in: simple }, isDefault: true }, select: { id: true } })
        : [];
      const ids = [...items.flatMap((i) => (i.variantId ? [i.variantId] : [])), ...defaults.map((d) => d.id)].sort();
      // A row lock and nothing else; sorted so two callers never lock in opposite orders.
      if (ids.length > 0) {
        await tx.$queryRaw`SELECT "id" FROM "public"."store_product_variants" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      }
    },

    async getVariantSkus(tx, variantIds) {
      const rows = await tx.storeProductVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, sku: true },
      });
      return new Map(rows.map((r) => [r.id, r.sku]));
    },

    async tagItems(tx, orderItemIds) {
      if (orderItemIds.length === 0) return;
      await tx.orderItem.updateMany({ where: { id: { in: orderItemIds } }, data: { fulfilledBy: "dropship" } });
    },

    async getOrderViews(orderIds) {
      if (orderIds.length === 0) return [];
      const rows = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNumber: true,
          storeId: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          total: true,
          shippingCharge: true,
          customerName: true,
          customerPhone: true,
          addressLine: true,
          pincode: true,
          state: true,
          country: true,
          createdAt: true,
          items: { select: { id: true, fulfilledBy: true, shipmentId: true, lineTotal: true, imageKey: true } },
          shipments: {
            select: {
              id: true,
              carrierCode: true,
              carrier: true,
              trackingNumber: true,
              trackingUrl: true,
              shippedAt: true,
              deliveredAt: true,
              returnedAt: true,
            },
            orderBy: { shippedAt: "asc" },
          },
        },
      });
      return rows.map(
        ({ shipments, paymentMethod, ...o }): OrderView => ({
          ...o,
          paymentMethod: paymentMethod === "COD" ? "COD" : "ONLINE",
          parcels: shipments,
        }),
      );
    },

    async createShipment(input) {
      const { shipmentId } = await createPackageShipment({
        orderId: input.orderId,
        orderItemIds: input.orderItemIds,
        // The core's own parcel rules (courier list, safe links, D-24).
        tracking: shipmentTrackingSchema.parse(input.tracking),
        senderName: input.senderName,
        externalRef: input.externalRef,
      });
      return shipmentId;
    },

    async updateShipmentTracking(shipmentId, tracking) {
      await updatePackageShipmentTracking(shipmentId, shipmentTrackingSchema.parse(tracking));
    },

    async markShipmentDelivered(shipmentId, podKey) {
      await markPackageShipmentDelivered(shipmentId, podKey);
    },

    async markShipmentReturned(shipmentId) {
      await markPackageShipmentReturned(shipmentId);
    },

    async confirmOrder(orderId) {
      await confirmOrderAsSystem(orderId);
    },

    async cancelOrder(orderId, reason) {
      // The supplier already chose whether its stock goes back (D-39); the
      // copies mirror the supplier, so the core restocks nothing that came back.
      await cancelOrderAsSystem(orderId, reason, false);
    },

    async openTicket(customerId, storeId, subject, message) {
      const ticket = await createTicket(customerId, {
        subject,
        message,
        category: "ORDERS",
        storeId,
        // The account's own email and phone are used when these are blank.
        contactEmail: null,
        contactPhone: null,
      });
      return ticket.id;
    },

    notify(customerId, message) {
      notify({
        principalType: "CUSTOMER",
        principalId: customerId,
        kind: "DROPSHIP",
        ...message,
      });
    },

    sendMail,
  };
}
