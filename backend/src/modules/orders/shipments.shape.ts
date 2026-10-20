import type { Prisma } from "../../generated/prisma/client.js";
import { mediaUrl } from "../../package/storage/index.js";
import { findCourier } from "./couriers.js";

/**
 * Who is looking at an order — decides what of its parcels they see.
 *
 *   seller   the store owner and admins: everything, incl. the proof photo
 *   customer the buyer: courier + tracking, never the proof photo
 *   public   anyone else holding the order link: courier + status only — a
 *            tracking number can reveal the delivery address on a courier site
 */
export type OrderAudience = "seller" | "customer" | "public";

export const shipmentSelect = {
  id: true,
  carrierCode: true,
  carrier: true,
  trackingNumber: true,
  trackingUrl: true,
  senderName: true,
  source: true,
  shippedAt: true,
  deliveredAt: true,
  returnedAt: true,
  restocked: true,
  podKey: true,
} satisfies Prisma.OrderShipmentSelect;

type ShipmentRow = Prisma.OrderShipmentGetPayload<{ select: typeof shipmentSelect }>;

export function shapeShipment(row: ShipmentRow, audience: OrderAudience) {
  const hidden = audience === "public";
  return {
    id: row.id,
    carrierCode: row.carrierCode,
    carrier: row.carrier,
    trackingNumber: hidden ? null : row.trackingNumber,
    /** A link the seller pasted; null = none (the customer copies the number). */
    trackingUrl: hidden ? null : row.trackingUrl,
    /** The courier's own website, for "Open {courier}" when there's no link. */
    courierSite: findCourier(row.carrierCode)?.site ?? null,
    senderName: row.senderName,
    source: row.source,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    returnedAt: row.returnedAt,
    ...(audience === "seller"
      ? { restocked: row.restocked, podUrl: mediaUrl("media", row.podKey) }
      : {}),
  };
}

export type ShapedShipment = ReturnType<typeof shapeShipment>;
