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
 * Parcels — an order goes out with a courier and tracking number, its
 * tracking can be corrected, a parcel is delivered (optional proof photo) or
 * comes back. Rules: docs/dropshipping/shipments/context.md.
 *
 * Two callers share ONE core per action:
 *   - the seller (owner-scoped through `getMyStore`; a foreign order 404s),
 *     who sends only the lines the store ships itself (`fulfilledBy` null);
 *   - a package acting for the order (`*PackageShipment*`, the dropship
 *     host's API — no HTTP route), which sends the lines it tagged.
 * Every write is guarded on the state read before it (a double tap or a
 * second tab gets 409, never a duplicate). Seller actions answer with the
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

/** A parcel still on its way — 404 if absent, 409 once delivered or back. */
async function findParcel(where: Prisma.OrderShipmentWhereInput) {
  const parcel = await prisma.orderShipment.findFirst({
    where,
    select: {
      id: true,
      orderId: true,
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

/** Lines not on their way: never sent, or their parcel came back. */
const notOnTheWay = {
  OR: [{ shipmentId: null }, { shipment: { returnedAt: { not: null } } }],
} satisfies Prisma.OrderItemWhereInput;

type SendableOrder = Prisma.OrderGetPayload<{
  select: typeof statusGuardSelect & { fulfilment: true };
}>;

/** The order a parcel may leave from — refuses pickup, cancelled, delivered. */
async function sendableOrder(where: Prisma.OrderWhereInput): Promise<SendableOrder> {
  const order = await prisma.order.findFirst({
    where,
    select: { ...statusGuardSelect, fulfilment: true },
  });
  if (!order) throw HttpError.notFound("Order not found");
  if (order.fulfilment === "PICKUP") {
    throw HttpError.conflict("A pickup order isn't sent — mark it as picked up instead");
  }
  if (order.status === "CANCELLED") {
    throw HttpError.conflict("A cancelled order can't be sent");
  }
  if (order.status === "DELIVERED") {
    throw HttpError.conflict("This order is already delivered");
  }
  return order;
}

/**
 * The send itself: one parcel holding the lines `lines` selects (among those
 * not on their way). Takes the order's row lock first, guarded on its
 * status, so a cancel from another tab can't cross it. Moves the order to
 * Shipped only when no line is left unsent — an order whose other lines
 * another party ships waits for their parcels. The customer gets ONE message,
 * with the tracking.
 */
async function sendParcel(
  order: SendableOrder,
  lines: Prisma.OrderItemWhereInput,
  expectedLines: number | null,
  data: Omit<Prisma.OrderShipmentUncheckedCreateInput, "orderId">,
) {
  const { shipmentId, change } = await prisma.$transaction(async (tx) => {
    const touched = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { updatedAt: new Date() },
    });
    if (touched.count === 0) {
      throw HttpError.conflict("The order just changed — reload and try again");
    }

    const shipment = await tx.orderShipment.create({
      data: { orderId: order.id, ...data },
      select: { id: true },
    });
    const taken = await tx.orderItem.updateMany({
      where: { orderId: order.id, AND: [notOnTheWay, lines] },
      data: { shipmentId: shipment.id },
    });
    if (taken.count === 0 || (expectedLines !== null && taken.count !== expectedLines)) {
      throw HttpError.conflict(
        "Everything in this order is already on its way — refresh to see its parcel",
      );
    }

    const unsent = await tx.orderItem.count({ where: { orderId: order.id, shipmentId: null } });
    const advancing = unsent === 0 && STATUS_RANK[order.status]! < STATUS_RANK.SHIPPED!;
    const change = advancing ? await writeStatusChange(tx, order, "SHIPPED") : null;
    return { shipmentId: shipment.id, change };
  });

  const shaped = change
    ? await announceStatusChange(order.id, "SHIPPED", change, order.customerId, {
        notifyCustomer: false,
      })
    : await loadOrder(order.id, "seller");
  const parcel = shaped.shipments.find((s) => s.id === shipmentId);
  if (parcel) {
    notifyParcelShipped(shaped, parcel, order.customerId, { first: !!change });
  }
  return { shipmentId, order: shaped };
}

/** Correct a parcel's courier, number or link; the customer is told if it changed. */
async function retrack(parcel: Awaited<ReturnType<typeof findParcel>>, input: ShipmentTrackingInput) {
  const next = trackingData(input);
  const updated = await prisma.orderShipment.updateMany({
    where: onTheWay(parcel.id, parcel.orderId),
    data: next,
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The parcel just changed — reload and try again");
  }
  const order = await loadOrder(parcel.orderId, "seller");
  const changed =
    next.carrier !== parcel.carrier ||
    next.trackingNumber !== parcel.trackingNumber ||
    next.trackingUrl !== parcel.trackingUrl;
  const shaped = order.shipments.find((s) => s.id === parcel.id);
  if (changed && shaped) notifyTrackingUpdated(order, shaped, parcel.order.customerId);
  return order;
}

/**
 * Delivered. When nothing is left on its way and every line went out, the
 * order becomes Delivered through the same path as the seller's button (a COD
 * order is marked paid, the customer is told, `order.status` fires).
 */
async function deliverParcel(orderId: string, shipmentId: string, podKey: string | null) {
  const result = await prisma.$transaction(async (tx) => {
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

  return result.change
    ? announceStatusChange(orderId, "DELIVERED", result.change, result.customerId)
    : loadOrder(orderId, "seller");
}

/** The parcel came back undelivered; its lines stay with the order. */
async function returnParcel(orderId: string, shipmentId: string) {
  const updated = await prisma.orderShipment.updateMany({
    where: onTheWay(shipmentId, orderId),
    data: { returnedAt: new Date() },
  });
  if (updated.count === 0) {
    throw HttpError.conflict("The parcel just changed — reload and try again");
  }
  return loadOrder(orderId, "seller");
}

// ---------------------------------------------------------------------------
// The seller (stores.routes.ts) — owner-scoped
// ---------------------------------------------------------------------------

/**
 * Send the store's own lines — those never sent, or whose parcel came back
 * (sending again). Also "add tracking" to an order sent before parcels
 * existed. Lines another party ships are never touched.
 */
export async function createShipment(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  input: ShipmentTrackingInput,
) {
  const store = await getMyStore(actor, storeRef);
  const order = await sendableOrder({ id: orderId, storeId: store.id });
  const sent = await sendParcel(order, { fulfilledBy: null }, null, trackingData(input));
  return sent.order;
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
  const parcel = await findParcel({ id: shipmentId, orderId, order: { storeId: store.id } });
  return retrack(parcel, input);
}

/**
 * Delivered — optionally with a proof-of-delivery photo (already read and
 * normalised by `readUpload`). The photo is stored first; if the write then
 * loses a race it is removed again.
 */
export async function markShipmentDelivered(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  shipmentId: string,
  photo: UploadedFile | null,
) {
  const store = await getMyStore(actor, storeRef);
  await findParcel({ id: shipmentId, orderId, order: { storeId: store.id } });

  let podKey: string | null = null;
  if (photo) {
    podKey = newObjectKey(`pod/${store.id}/${orderId}`, photo.contentType);
    await storeUpload("media", podKey, photo);
  }
  try {
    return await deliverParcel(orderId, shipmentId, podKey);
  } catch (err) {
    if (podKey) void storage.remove("media", podKey).catch(() => undefined);
    throw err;
  }
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
  await findParcel({ id: shipmentId, orderId, order: { storeId: store.id } });
  return returnParcel(orderId, shipmentId);
}

// ---------------------------------------------------------------------------
// A package acting for the order (the dropship host) — system level, no route
// ---------------------------------------------------------------------------

/**
 * Send lines a package tagged (`fulfilledBy` set) — all of `orderItemIds`, or
 * nothing. A package parcel always carries a tracking number (D-4), except
 * own delivery. Answers with the new parcel's id and the order.
 */
export async function createPackageShipment(input: {
  orderId: string;
  orderItemIds: string[];
  tracking: ShipmentTrackingInput;
  senderName: string | null;
  externalRef: string | null;
}) {
  if (input.orderItemIds.length === 0) {
    throw HttpError.badRequest("A parcel needs at least one line");
  }
  const data = trackingData(input.tracking);
  if (input.tracking.carrierCode !== "self" && !data.trackingNumber) {
    throw HttpError.badRequest("A tracking number is required for this parcel");
  }
  const order = await sendableOrder({ id: input.orderId });
  return sendParcel(
    order,
    { id: { in: input.orderItemIds }, fulfilledBy: { not: null } },
    input.orderItemIds.length,
    {
      ...data,
      source: "PACKAGE",
      senderName: input.senderName,
      externalRef: input.externalRef,
    },
  );
}

/** Correct a package parcel's tracking. */
export async function updatePackageShipmentTracking(
  shipmentId: string,
  tracking: ShipmentTrackingInput,
) {
  const parcel = await findParcel({ id: shipmentId, source: "PACKAGE" });
  return retrack(parcel, tracking);
}

/** A package parcel was delivered (the proof photo, if any, already stored). */
export async function markPackageShipmentDelivered(
  shipmentId: string,
  podKey: string | null,
) {
  const parcel = await findParcel({ id: shipmentId, source: "PACKAGE" });
  return deliverParcel(parcel.orderId, shipmentId, podKey);
}

/** A package parcel came back undelivered. */
export async function markPackageShipmentReturned(shipmentId: string) {
  const parcel = await findParcel({ id: shipmentId, source: "PACKAGE" });
  return returnParcel(parcel.orderId, shipmentId);
}
