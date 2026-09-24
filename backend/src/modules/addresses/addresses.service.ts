import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import {
  PHONE_MESSAGE,
  PINCODE_MESSAGE,
  isValidPincode,
  normalizePhone,
  normalizePincode,
} from "../../utils/zodHelpers.js";
import type {
  AddressCreateInput,
  AddressUpdateInput,
} from "./addresses.schema.js";

/**
 * Customer address book — every function is scoped to the signed-in
 * customer (a foreign address id behaves like a missing one, 404). Rules:
 *
 *  - at most MAX_ADDRESSES per customer;
 *  - exactly one address is `isPrimary` (the default checkout suggestion).
 *    The first saved address becomes primary automatically; promoting one
 *    demotes the current primary in the same transaction. Unlike payout
 *    accounts, deleting the primary DOES promote the oldest remaining
 *    address — an address book should always have a default suggestion.
 */

const MAX_ADDRESSES = 10;

const addressSelect = {
  id: true,
  label: true,
  name: true,
  phone: true,
  email: true,
  addressLine: true,
  pincode: true,
  state: true,
  country: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerAddressSelect;

export async function listAddresses(customerId: string) {
  return prisma.customerAddress.findMany({
    where: { customerId },
    select: addressSelect,
    // Primary first, then oldest first — the checkout suggestion order.
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function createAddress(
  customerId: string,
  input: AddressCreateInput,
) {
  const count = await prisma.customerAddress.count({ where: { customerId } });
  if (count >= MAX_ADDRESSES) {
    throw HttpError.conflict(`You can save up to ${MAX_ADDRESSES} addresses`);
  }
  const { isPrimary, ...details } = input;
  const makePrimary = count === 0 || isPrimary === true;

  return prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.customerAddress.updateMany({
        where: { customerId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.customerAddress.create({
      data: { ...details, customerId, isPrimary: makePrimary },
      select: addressSelect,
    });
  });
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: AddressUpdateInput,
) {
  const existing = await prisma.customerAddress.findFirst({
    where: { id: addressId, customerId },
    select: { id: true, isPrimary: true, pincode: true, country: true },
  });
  if (!existing) throw HttpError.notFound("Address not found");
  // Country-specific PIN rule against the address as it will be saved —
  // a pincode-only or country-only change is checked against the other half.
  const country = input.country ?? existing.country;
  if (input.pincode !== undefined || input.country !== undefined) {
    const pincode = input.pincode ?? existing.pincode;
    if (!isValidPincode(pincode, country)) {
      throw HttpError.badRequest(PINCODE_MESSAGE);
    }
  }
  // A phone that is sent is checked + stored in its canonical form for the
  // address's country (same rule as create).
  let phone: string | undefined;
  if (input.phone !== undefined) {
    const normalized = normalizePhone(input.phone, country);
    if (!normalized) throw HttpError.badRequest(PHONE_MESSAGE);
    phone = normalized;
  }

  const { isPrimary, ...details } = input;
  // Field-by-field: undefined = "not sent" must be omitted
  // (exactOptionalPropertyTypes), never written.
  const data: Prisma.CustomerAddressUncheckedUpdateInput = {};
  if (details.label !== undefined) data.label = details.label;
  if (details.name !== undefined) data.name = details.name;
  if (phone !== undefined) data.phone = phone;
  if (details.email !== undefined) data.email = details.email;
  if (details.addressLine !== undefined) data.addressLine = details.addressLine;
  if (details.pincode !== undefined) {
    data.pincode = normalizePincode(details.pincode, country);
  }
  if (details.state !== undefined) data.state = details.state;
  if (details.country !== undefined) data.country = details.country;
  if (isPrimary) data.isPrimary = true;

  return prisma.$transaction(async (tx) => {
    if (isPrimary && !existing.isPrimary) {
      await tx.customerAddress.updateMany({
        where: { customerId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.customerAddress.update({
      where: { id: existing.id },
      data,
      select: addressSelect,
    });
  });
}

export async function deleteAddress(customerId: string, addressId: string) {
  const existing = await prisma.customerAddress.findFirst({
    where: { id: addressId, customerId },
    select: { id: true, isPrimary: true },
  });
  if (!existing) throw HttpError.notFound("Address not found");

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.delete({ where: { id: existing.id } });
    // Keep a default suggestion: the oldest remaining address takes over.
    if (existing.isPrimary) {
      const next = await tx.customerAddress.findFirst({
        where: { customerId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.customerAddress.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });
  return { id: existing.id };
}
