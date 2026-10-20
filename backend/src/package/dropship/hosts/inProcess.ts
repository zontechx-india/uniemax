import type { PrismaClient } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { mediaUrl } from "../../storage/index.js";
import { publicWebUrl, sendMail } from "../../mail/index.js";
import { notify } from "../../../modules/notifications/notifications.service.js";
import {
  createStoreWithoutLogo,
  updateStorePayments,
} from "../../../modules/stores/stores.service.js";
import { resolvePayments } from "../../../modules/stores/stores.schema.js";
import { resolveProfile } from "../../../modules/stores/storeProfile.schema.js";
import { storeAddressSchema } from "../../../modules/stores/storeAddress.schema.js";
import type { DropshipHost, ProductRef, StoreRef } from "../types.js";

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
