import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import type { StoreActor } from "../stores/storeActor.js";
import { getMyStore } from "../stores/stores.service.js";
import { MAX_CUSTOM_ANSWER, resolveCheckoutFields } from "../stores/stores.schema.js";
import { readOrderCustomFields } from "./customFields.js";
import type { OrderCustomAnswer } from "./customFields.js";
import { notifyAddressChanged } from "./orders.notifications.js";
import type { OrderAddressUpdateInput } from "./orders.schema.js";
import { SELLER_VISIBLE, loadOrder } from "./orders.service.js";
import { addressText } from "./orderAddress.shape.js";
import type { OrderAddressSnapshot } from "./orderAddress.shape.js";

/**
 * The seller corrects an order's delivery address after it was placed — the
 * customer gave an incomplete one and the seller phoned to get it right.
 *
 * Rules (docs/API.md):
 * - Delivery orders only, and only while the order is still on its way:
 *   PENDING / CONFIRMED / PACKED / SHIPPED. A delivered or cancelled order is
 *   a closed record.
 * - Only the address: line, pincode, state, country and the store's DELIVERY
 *   questions. Name, phone and email tie the order to the customer and stay.
 * - Money never moves: the shipping charge was quoted for the old pincode and
 *   the customer already agreed to (or paid) it.
 * - Every change keeps the address it replaced (`OrderAddressChange`), and
 *   the customer is told — so a parcel can't quietly be sent elsewhere.
 * - A supplier shipping part of the order reads the order's address live, so
 *   it sees the correction with nothing else to do.
 */

const EDITABLE = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED"] as const;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export async function updateOrderAddress(
  actor: StoreActor,
  storeRef: string,
  orderId: string,
  input: OrderAddressUpdateInput,
) {
  const store = await getMyStore(actor, storeRef);
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id, ...SELLER_VISIBLE },
    select: {
      id: true,
      status: true,
      fulfilment: true,
      customerId: true,
      addressLine: true,
      pincode: true,
      state: true,
      country: true,
      customFields: true,
    },
  });
  if (!order) throw HttpError.notFound("Order not found");
  if (order.fulfilment !== "DELIVERY") {
    throw HttpError.conflict("The customer collects this order — it has no delivery address");
  }
  if (!(EDITABLE as readonly string[]).includes(order.status)) {
    throw HttpError.conflict(
      order.status === "DELIVERED"
        ? "This order is already delivered — its address can no longer be changed"
        : "This order is closed — its address can no longer be changed",
    );
  }

  const answers = readOrderCustomFields(order.customFields);
  const deliveryBefore = answers.filter((a) => a.section === "DELIVERY");
  const checkoutRow = await prisma.store.findUnique({
    where: { id: store.id },
    select: { checkout: true },
  });
  const questions = resolveCheckoutFields(checkoutRow?.checkout).customFields.filter(
    (f) => f.section === "DELIVERY",
  );

  // The store's delivery questions as asked today, then any older answer
  // whose question was since removed (kept unless the seller blanks it).
  const ids = [
    ...questions.map((q) => q.id),
    ...deliveryBefore.map((a) => a.id).filter((id) => !questions.some((q) => q.id === id)),
  ];
  const deliveryAfter: OrderCustomAnswer[] = [];
  for (const id of ids) {
    const question = questions.find((q) => q.id === id);
    const old = deliveryBefore.find((a) => a.id === id);
    const label = old?.label ?? question!.label;
    const value = (input.answers[id] ?? old?.value ?? "").trim();
    if (!value) {
      if (question?.required) throw HttpError.badRequest(`${label} is required`);
      continue;
    }
    if (value !== old?.value && question) {
      if (value.length > MAX_CUSTOM_ANSWER) {
        throw HttpError.badRequest(
          `${label} is too long (up to ${MAX_CUSTOM_ANSWER} characters)`,
        );
      }
      if (question.type === "NUMBER" && !NUMBER_RE.test(value)) {
        throw HttpError.badRequest(`${label} must be a number`);
      }
      if (question.type === "CHOICE" && !question.choices.includes(value)) {
        throw HttpError.badRequest(`Pick one of the options for ${label}`);
      }
    }
    deliveryAfter.push({ id, label, section: "DELIVERY", value });
  }

  const before: OrderAddressSnapshot = {
    addressLine: order.addressLine,
    pincode: order.pincode,
    state: order.state,
    country: order.country,
    answers: deliveryBefore.map(({ id, label, value }) => ({ id, label, value })),
  };
  const after: OrderAddressSnapshot = {
    addressLine: input.address,
    pincode: input.pincode,
    state: input.state,
    country: input.country,
    answers: deliveryAfter.map(({ id, label, value }) => ({ id, label, value })),
  };
  // Saved with nothing changed — no history row, no message to the customer.
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return loadOrder(order.id, "seller");
  }

  const customFields = [
    ...answers.filter((a) => a.section !== "DELIVERY"),
    ...deliveryAfter,
  ];
  await prisma.$transaction(async (tx) => {
    // Re-check the status in the write: the order may have been delivered
    // or cancelled in another tab since it was read.
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: { in: [...EDITABLE] } },
      data: {
        addressLine: after.addressLine,
        pincode: after.pincode,
        state: after.state,
        country: after.country,
        customFields:
          customFields.length > 0
            ? (customFields as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });
    if (updated.count === 0) {
      throw HttpError.conflict("The order just changed — reload and try again");
    }
    await tx.orderAddressChange.create({
      data: {
        orderId: order.id,
        before: before as unknown as Prisma.InputJsonValue,
        after: after as unknown as Prisma.InputJsonValue,
        changedBy: actor.kind === "admin" ? "SUPPORT" : "SELLER",
        actorId: actor.kind === "admin" ? actor.adminId : actor.customerId,
      },
    });
  });

  const shaped = await loadOrder(order.id, "seller");
  notifyAddressChanged(shaped, order.customerId, addressText(after), after.answers);
  return shaped;
}
