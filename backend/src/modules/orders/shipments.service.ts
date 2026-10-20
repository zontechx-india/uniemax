import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  newObjectKey,
  storage,
  storeUpload,
  type UploadedFile,
} from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";
import type { StoreActor } from "../stores/storeActor.js";
import { getMyStore } from "../stores/stores.service.js";
import { findCourier } from "./couriers.js";
import {
  notifyParcelShipped,
  notifyTrackingUpdated,
} from "./orders.notifications.js";
import type { ShipmentTrackingInput } from "./orders.schema.js";
import {
  STATUS_RANK,
  announceStatusChange,
  loadOrder,
  statusGuardSelect,
  writeStatusChange,
} from "./orders.service.js";

/**
 * Parcels — the seller sends an order with a courier and tracking number,
 * corrects the tracking, marks the parcel delivered (optional proof photo)
 * or records that it came back. Rules: docs/dropshipping/shipments/context.md.
 *
 * Every action is owner-scoped through `getMyStore` (a foreign store's order
 * 404s), every write is guarded on the state read before it (a double tap or
 * a second tab gets 409, never a duplicate), and every action answers with the
 * whole order as the seller sees it.
 */

/** Courier fields as stored: the list's name snapshotted, no tracking for own delivery. */
function trackingData(input: ShipmentTrackingInput) {
  const courier = findCourier(input.carrierCode);
  const own = input.carrierCode === "self";
  return {
    carrierCode: input.carrierCode === "other" ? null : input.carrierCode,
    carrier: courier ? courier.name : (input.carrierName ?? "Courier"),
    trackingNumber: own ? null : input.trackingNumber,
    trackingUrl: own ? null : input.trackingUrl,
  };
}

/** A parcel of one of this store's orders — 404 for anything else. */
async function findParcel(storeId: string, orderId: string, shipmentId: string) {
  const parcel = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, orderId, order: { storeId } },
    select: {
      carrier: true,
      trackingNumber: true,
      trackingUrl: true,
      deliveredAt: true,
      returnedAt: true,
      order: { select: { customerId: true } },
    },
  });
  if (!parcel) throw HttpError.notFound("Parcel not found");
  if (parcel.deliveredAt) {
    throw HttpError.conflict("This parcel is already marked delivered");
  }
  if (parcel.returnedAt) {
    throw HttpError.conflict("This parcel already came back");
  }
  return parcel;
}

/** The parcel only while it is on its way — the guard every parcel write uses. */
const onTheWay = (shipmentId: string, orderId: string) =>
  ({
    id: shipmentId,
    orderId,
    deliveredAt: null,
    returnedAt: null,
  }) satisfies Prisma.OrderShipmentWhereInput;

/**
 * Send an order: one parcel holding everything not already on its way —
 * items never sent, or items whose parcel came back (sending it again). Moves
 * the order to Shipped when it isn't yet; on an order already Shipped (sent
 * before parcels existed, or after a parcel came back) it only adds the
 * parcel. The customer gets ONE message, with the tracking.
 */
export async function createShipment(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  input: ShipmentTrackingInput,
) {
  const store = await getMyStore(actor, storeRef);
  const current = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    select: { ...statusGuardSelect, fulfilment: true },
  });
  if (!current) throw HttpError.notFound("Order not found");
  if (current.fulfilment === "PICKUP") {
    throw HttpError.conflict(
      "A pickup order isn't sent — mark it as picked up instead",
    );
  }
  if (current.status === "CANCELLED") {
    throw HttpError.conflict("A cancelled order can't be sent");
  }
  if (current.status === "DELIVERED") {
    throw HttpError.conflict("This order is already delivered");
  }

  const advancing = STATUS_RANK[current.status]! < STATUS_RANK.SHIPPED!;
  const { shipmentId, change } = await prisma.$transaction(async (tx) => {
    let change: { paid: boolean } | null = null;
    if (advancing) {
      change = await writeStatusChange(tx, current, "SHIPPED");
    } else {
      // Already Shipped: still take the order's row lock, guarded on its
      // status, so a cancel from another tab can't cross this parcel.
      const touched = await tx.order.updateMany({
        where: { id: orderId, status: current.status },
        data: { updatedAt: new Date() },
      });
      if (touched.count === 0) {
        throw HttpError.conflict("The order just changed — reload and try again");
      }
    }

    const shipment = await tx.orderShipment.create({
      data: { orderId, ...trackingData(input) },
      select: { id: true },
    });
    const taken = await tx.orderItem.updateMany({
      where: {
        orderId,
        OR: [{ shipmentId: null }, { shipment: { returnedAt: { not: null } } }],
      },
      data: { shipmentId: shipment.id },
    });
    if (taken.count === 0) {
      throw HttpError.conflict(
        "Everything in this order is already on its way — refresh to see its parcel",
      );
    }
    return { shipmentId: shipment.id, change };
  });

  const order = change
    ? await announceStatusChange(orderId, "SHIPPED", change, current.customerId, {
        notifyCustomer: false,
      })
    : await loadOrder(orderId, "seller");
  const parcel = order.shipments.find((s) => s.id === shipmentId);
  if (parcel) {
    notifyParcelShipped(order, parcel, current.customerId, { first: !!change });
  }
  return order;
}

/** Correct a parcel's courier, number or link while it is on its way. */
export async function updateShipmentTracking(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  shipmentId: string,
  input: ShipmentTrackingInput,
) {
  const store = await getMyStore(actor, storeRef);
  const before = await findParcel(store.id, orderId, shipmentId);
  const next = trackingData(input);

  const updated = await prisma.orderShipment.updateMany({
    where: onTheWay(shipmentId, orderId),
    data: next,
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The parcel just changed — reload and try again");
  }

  const order = await loadOrder(orderId, "seller");
  const changed =
    next.carrier !== before.carrier ||
    next.trackingNumber !== before.trackingNumber ||
    next.trackingUrl !== before.trackingUrl;
  const parcel = order.shipments.find((s) => s.id === shipmentId);
  if (changed && parcel) {
    notifyTrackingUpdated(order, parcel, before.order.customerId);
  }
  return order;
}

/**
 * The parcel reached the customer — optionally with a proof-of-delivery photo
 * (already read and normalised by `readUpload`). When nothing is left on its
 * way and every item went out, the order becomes Delivered through the same
 * path as the seller's button (a COD order is marked paid, the customer is
 * told, `order.status` fires).
 */
export async function markShipmentDelivered(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  shipmentId: string,
  photo: UploadedFile | null,
) {
  const store = await getMyStore(actor, storeRef);
  await findParcel(store.id, orderId, shipmentId);

  let podKey: string | null = null;
  if (photo) {
    podKey = newObjectKey(`pod/${store.id}/${orderId}`, photo.contentType);
    await storeUpload("media", podKey, photo);
  }

  let result: { change: { paid: boolean } | null; customerId: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      const updated = await tx.orderShipment.updateMany({
        where: onTheWay(shipmentId, orderId),
        data: { deliveredAt: new Date(), podKey },
      });
      if (updated.count === 0) {
        throw HttpError.conflict("This parcel is already marked delivered or came back");
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: statusGuardSelect,
      });
      const open = await tx.orderShipment.count({
        where: { orderId, deliveredAt: null, returnedAt: null },
      });
      const unsent = await tx.orderItem.count({ where: { orderId, shipmentId: null } });
      const done =
        open === 0 &&
        unsent === 0 &&
        order.status !== "DELIVERED" &&
        order.status !== "CANCELLED";
      const change = done ? await writeStatusChange(tx, order, "DELIVERED") : null;
      return { change, customerId: order.customerId };
    });
  } catch (err) {
    // The photo was stored before the write that lost: don't leave it behind.
    if (podKey) {
      void storage.remove("media", podKey).catch(() => undefined);
    }
    throw err;
  }

  return result.change
    ? announceStatusChange(orderId, "DELIVERED", result.change, result.customerId)
    : loadOrder(orderId, "seller");
}

/**
 * The parcel came back undelivered (returned to sender). Its items stay with
 * the order: the seller sends it again, or cancels — and the cancel asks
 * whether they go back in stock.
 */
export async function markShipmentReturned(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  shipmentId: string,
) {
  const store = await getMyStore(actor, storeRef);
  await findParcel(store.id, orderId, shipmentId);

  const updated = await prisma.orderShipment.updateMany({
    where: onTheWay(shipmentId, orderId),
    data: { returnedAt: new Date() },
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The parcel just changed — reload and try again");
  }
  return loadOrder(orderId, "seller");
}
