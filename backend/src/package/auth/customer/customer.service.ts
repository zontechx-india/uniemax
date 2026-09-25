import { prisma, Prisma } from "../core/config/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  issueCode,
  consumeCode,
  codeIssueResponse,
} from "../verification/verification.service.js";
import { customerAuthSelect, toPublicCustomer } from "./customer.shared.js";
import type { CodeChannel } from "../providers/provider.types.js";
import type {
  CustomerUpdateInput,
  LinkRequestInput,
  LinkVerifyInput,
} from "./customer.schema.js";

/**
 * Customer self-service — everything a logged-in customer does with their own
 * account that is not a login: profile, orders, and linking a second
 * identifier. Strategy-independent (works the same whether they signed in
 * with a password, Google, or an OTP).
 */

interface Identifier {
  channel: CodeChannel;
  destination: string;
}

/** Resolves the single identifier from a link request. */
function resolveIdentifier(input: {
  email?: string | undefined;
  phone?: string | undefined;
}): Identifier {
  if (input.email) return { channel: "EMAIL", destination: input.email };
  // Schema guarantees exactly one of email/phone is present.
  return { channel: "SMS", destination: input.phone as string };
}

function identifierWhere(id: Identifier): Prisma.CustomerWhereUniqueInput {
  return id.channel === "EMAIL"
    ? { email: id.destination }
    : { phone: id.destination };
}

/** Marks the given identifier as set + verified on a customer. */
function verifiedData(id: Identifier): Prisma.CustomerUncheckedUpdateInput {
  const now = new Date();
  return id.channel === "EMAIL"
    ? { email: id.destination, emailVerifiedAt: now }
    : { phone: id.destination, phoneVerifiedAt: now };
}

// ---- Profile -----------------------------------------------------------

export async function getProfile(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: customerAuthSelect,
  });
  if (!customer) throw HttpError.unauthorized("Account no longer exists");
  return toPublicCustomer(customer);
}

export async function updateProfile(id: string, input: CustomerUpdateInput) {
  const data: Prisma.CustomerUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.altPhone !== undefined) data.altPhone = input.altPhone;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;

  const customer = await prisma.customer.update({
    where: { id },
    data,
    select: customerAuthSelect,
  });
  return toPublicCustomer(customer);
}

export async function listOwnOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    orderBy: { placedAt: "desc" },
    // Same cap as the orders module's own list — unbounded, a long-time
    // buyer's history was one ever-growing query.
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      storeName: true,
      storeSlug: true,
      fulfilment: true,
      total: true,
      shippingCharge: true,
      paymentMethod: true,
      paymentStatus: true,
      placedAt: true,
      estimatedDeliveryAt: true,
      items: {
        select: {
          id: true,
          productName: true,
          variantName: true,
          productSlug: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
  });
}

// ---- Identifier linking ---------------------------------------------------
// (Email verification happens at registration — verify-first — so there is no
// separate post-register email-verify flow. Linking verifies the new
// identifier with its own code below.)

export async function requestLink(customerId: string, input: LinkRequestInput) {
  const id = resolveIdentifier(input);

  const owner = await prisma.customer.findUnique({
    where: identifierWhere(id),
    select: { id: true },
  });
  if (owner && owner.id !== customerId) {
    throw HttpError.conflict(
      `This ${id.channel === "EMAIL" ? "email" : "phone"} is already linked to another account.`,
    );
  }
  if (owner && owner.id === customerId) {
    throw HttpError.conflict("This is already linked to your account.");
  }

  const target = {
    channel: id.channel,
    destination: id.destination,
    purpose: "LINK",
    customerId,
  } as const;
  const issued = await issueCode(target);
  return codeIssueResponse(target, issued);
}

export async function verifyLink(customerId: string, input: LinkVerifyInput) {
  const id = resolveIdentifier(input);
  await consumeCode({
    channel: id.channel,
    destination: id.destination,
    purpose: "LINK",
    code: input.code,
    customerId,
  });

  // Unique constraint is the final guard against a race — P2002 -> 409.
  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: verifiedData(id),
    select: customerAuthSelect,
  });
  return toPublicCustomer(customer);
}
