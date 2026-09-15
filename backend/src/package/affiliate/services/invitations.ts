import { HttpError } from "../../../utils/httpError.js";
import { affiliateConfig } from "../config.js";
import { deps } from "../deps.js";
import { daysFromNow, money, newToken, rateAllowed } from "../domain.js";
import type { CommissionType } from "../domain.js";
import type { StoreRef } from "../types.js";
import type { InviteCreateInput } from "../schema.js";
import { programRow } from "./program.js";

type InviteRow = {
  id: string;
  token: string;
  name: string;
  email: string;
  status: string;
  commissionType: CommissionType | null;
  commissionRate: { toString(): string } | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

function inviteUrl(token: string) {
  const path = `/affiliate/invite/${token}`;
  return deps.host.webUrl ? `${deps.host.webUrl}${path}` : path;
}

function shape(row: InviteRow) {
  const expired = row.status === "PENDING" && row.expiresAt < new Date();
  return {
    ...row,
    status: expired ? "EXPIRED" : row.status,
    commissionRate: row.commissionRate == null ? null : Number(row.commissionRate),
    url: inviteUrl(row.token),
  };
}

function describeRate(type: CommissionType, rate: number | null) {
  return type === "PERCENTAGE" ? `${rate}% of each sale` : `₹${rate} per item sold`;
}

export async function createInvite(store: StoreRef, input: InviteCreateInput) {
  const program = await programRow(store.id);
  if (!program.enabled) throw HttpError.badRequest("Enable the affiliate programme first");
  if (
    input.commissionRate != null &&
    !rateAllowed(input.commissionType ?? program.commissionType, input.commissionRate)
  ) {
    throw HttpError.badRequest(`Commission cannot exceed ${affiliateConfig.maxPercent}%`);
  }

  const invite = await deps.prisma.affiliateInvitation.create({
    data: {
      storeId: store.id,
      storeName: store.name,
      token: newToken(12),
      name: input.name,
      email: input.email.toLowerCase(),
      commissionType: input.commissionType ?? null,
      commissionRate: input.commissionRate ?? null,
      expiresAt: daysFromNow(affiliateConfig.inviteExpiryDays),
    },
  });

  const shaped = shape(invite);
  const rate = describeRate(
    invite.commissionType ?? program.commissionType,
    shaped.commissionRate ?? money(program.commissionRate),
  );
  const text = [
    `Hi ${invite.name},`,
    ``,
    `${store.name} has invited you to become an affiliate partner on UnieMax.`,
    `You earn ${rate} on orders that come through your links.`,
    ``,
    `Accept the invitation: ${shaped.url}`,
    ``,
    `This link expires on ${invite.expiresAt.toDateString()}.`,
  ].join("\n");
  void deps.host
    .sendMail({
      to: invite.email,
      subject: `${store.name} invited you to become an affiliate partner`,
      text,
      html: text.replace(/\n/g, "<br>"),
    })
    .catch((err) => console.error("Affiliate invite mail failed:", err));

  return shaped;
}

export async function listInvites(storeId: string) {
  const rows = await deps.prisma.affiliateInvitation.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(shape);
}

export async function cancelInvite(storeId: string, id: string) {
  const result = await deps.prisma.affiliateInvitation.updateMany({
    where: { id, storeId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) throw HttpError.notFound("No pending invitation found");
}

/** Public preview shown before the invitee signs in or registers. */
export async function previewInvite(token: string) {
  const invite = await deps.prisma.affiliateInvitation.findUnique({ where: { token } });
  if (!invite) throw HttpError.notFound("Invitation not found");
  const program = await programRow(invite.storeId);
  const shaped = shape(invite);
  return {
    storeName: invite.storeName,
    name: invite.name,
    status: program.enabled ? shaped.status : "CLOSED",
    commissionType: invite.commissionType ?? program.commissionType,
    commissionRate: shaped.commissionRate ?? money(program.commissionRate),
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(token: string, customerId: string) {
  const invite = await deps.prisma.affiliateInvitation.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING") {
    throw HttpError.conflict("This invitation is no longer valid");
  }
  if (invite.expiresAt < new Date()) {
    await deps.prisma.affiliateInvitation.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    throw HttpError.conflict("This invitation has expired");
  }

  const [program, store, customer] = await Promise.all([
    programRow(invite.storeId),
    deps.host.getStore(invite.storeId),
    deps.host.getCustomer(customerId),
  ]);
  if (!store || !program.enabled) {
    throw HttpError.conflict("This store's affiliate programme is closed");
  }
  if (store.ownerId === customerId) {
    throw HttpError.badRequest("You cannot be an affiliate of your own store");
  }

  const affiliate = await deps.prisma.affiliate.upsert({
    where: { customerId },
    create: { customerId, displayName: customer?.name || invite.name },
    update: {},
  });
  if (affiliate.status === "SUSPENDED") {
    throw HttpError.forbidden("Your affiliate account is suspended");
  }

  const relation = {
    storeName: store.name,
    storeSlug: store.slug,
    commissionType: invite.commissionType,
    commissionRate: invite.commissionRate,
  };
  await deps.prisma.$transaction([
    deps.prisma.storeAffiliate.upsert({
      where: { affiliateId_storeId: { affiliateId: affiliate.id, storeId: store.id } },
      create: { affiliateId: affiliate.id, storeId: store.id, ...relation },
      update: { status: "ACTIVE", ...relation },
    }),
    deps.prisma.affiliateInvitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), affiliateId: affiliate.id },
    }),
  ]);

  deps.host.notify(store.ownerId, {
    title: "New affiliate partner",
    body: `${affiliate.displayName} accepted your invitation for ${store.name}`,
    url: `/mystores/${store.slug}/affiliate/partners`,
  });
  return { storeName: store.name, storeSlug: store.slug };
}
