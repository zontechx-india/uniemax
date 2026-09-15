import type { PrismaClient } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../utils/httpError.js";
import { mediaUrl } from "../../storage/index.js";
import { publicWebUrl, sendMail } from "../../mail/index.js";
import { notify } from "../../../modules/notifications/notifications.service.js";
import type { AffiliateHost, ProductRef } from "../types.js";

/**
 * The host as seen from inside the same process: reads the core tables
 * directly. This is the only affiliate file allowed to import core modules —
 * a standalone service replaces it with one that calls the core over HTTP.
 */
export function createInProcessHost(prisma: PrismaClient): AffiliateHost {
  const storeSelect = {
    id: true,
    name: true,
    slug: true,
    ownerId: true,
    isPublished: true,
  } as const;

  const productSelect = {
    id: true,
    name: true,
    slug: true,
    priceMin: true,
    media: {
      where: { type: "IMAGE" as const },
      orderBy: { displayOrder: "asc" as const },
      take: 1,
      select: { key: true },
    },
  } as const;

  type ProductRow = {
    id: string;
    name: string;
    slug: string;
    priceMin: { toString(): string } | null;
    media: { key: string }[];
  };

  const shapeProduct = (row: ProductRow): ProductRef => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.priceMin == null ? null : Number(row.priceMin),
    imageUrl: mediaUrl("media", row.media[0]?.key ?? null),
  });

  return {
    webUrl: publicWebUrl,

    getStore: (storeId) =>
      prisma.store.findUnique({ where: { id: storeId }, select: storeSelect }),

    async getOwnedStore(customerId, storeRef) {
      const store = await prisma.store.findFirst({
        where: { ownerId: customerId, OR: [{ id: storeRef }, { slug: storeRef }] },
        select: storeSelect,
      });
      if (!store) throw HttpError.notFound("Store not found");
      return store;
    },

    async listProducts(storeId, { q, page, pageSize }) {
      const where = {
        storeId,
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.storeProduct.findMany({
          where,
          select: productSelect,
          orderBy: { name: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.storeProduct.count({ where }),
      ]);
      return { items: rows.map(shapeProduct), total };
    },

    async getProducts(storeId, ids) {
      const rows = await prisma.storeProduct.findMany({
        where: { storeId, id: { in: ids } },
        select: productSelect,
      });
      return rows.map(shapeProduct);
    },

    async getOrder(orderId) {
      const row = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          storeId: true,
          storeName: true,
          customerId: true,
          status: true,
          paymentStatus: true,
          affiliateRef: true,
          deliveredAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              lineTotal: true,
            },
          },
        },
      });
      if (!row) return null;
      return {
        ...row,
        items: row.items.map((item) => ({
          ...item,
          lineTotal: item.lineTotal.toString(),
        })),
      };
    },

    getCustomer: (id) =>
      prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true, email: true },
      }),

    notify(customerId, message) {
      notify({
        principalType: "CUSTOMER",
        principalId: customerId,
        kind: "AFFILIATE",
        ...message,
      });
    },

    sendMail,
  };
}
