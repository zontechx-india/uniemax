import { HttpError } from "../../../utils/httpError.js";
import { dropshipConfig } from "../config.js";
import { deps } from "../deps.js";
import { daysFromNow, hashToken, inviteMatches, inviteState, maskContact, newInviteToken, samePhone } from "../domain.js";
import type { InviteStatus } from "../domain.js";
import type { InviteAcceptInput, InviteCreateInput } from "../schema.js";
import type { StoreRef } from "../types.js";
import { logChanges } from "./terms.js";

export function inviteUrl(token: string): string {
  const path = `/supplier-invite/${token}`;
  return deps.host.webUrl ? `${deps.host.webUrl}${path}` : path;
}

type InviteRow = {
  id: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  codAllowed: boolean;
  returnFeePayer: "SELLER" | "SUPPLIER";
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
};

export function shapeInvite(row: InviteRow) {
  return {
    id: row.id,
    name: row.contactName,
    phone: row.contactPhone,
    email: row.contactEmail,
    codAllowed: row.codAllowed,
    returnFeePayer: row.returnFeePayer,
    status: inviteState(row),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** The message the seller shares (WhatsApp, copy) and the email body. */
function inviteMessage(sellerName: string, contactName: string, url: string) {
  return [
    `Hi ${contactName},`,
    ``,
    `${sellerName} would like to sell your products in their online store on UnieMax. You ship the orders straight to their customers.`,
    ``,
    `See the terms and join: ${url}`,
  ].join("\n");
}

function mailInvite(store: StoreRef, invite: InviteRow, url: string, expiresAt: Date) {
  if (!invite.contactEmail) return;
  const text = `${inviteMessage(store.name, invite.contactName, url)}\n\nThis link works until ${expiresAt.toDateString()}.`;
  void deps.host
    .sendMail({
      to: invite.contactEmail,
      subject: `${store.name} invited you to supply their store`,
      text,
      html: text.replace(/\n/g, "<br>"),
    })
    .catch((err) => console.error("Supplier invite mail failed:", err));
}

/**
 * SU-14: is the person being invited already this seller's supplier? Matched
 * on the supplier store's business phone / email and its owner's account.
 */
async function existingSupplierFor(sellerStoreId: string, input: InviteCreateInput) {
  const links = await deps.prisma.supplierLink.findMany({
    where: { sellerStoreId, status: { not: "ENDED" } },
    select: { id: true, supplier: { select: { storeId: true } } },
  });
  if (links.length === 0) return null;
  const stores = await deps.host.getStores(links.map((l) => l.supplier.storeId));
  const email = input.email?.toLowerCase();
  for (const store of stores) {
    const owner = await deps.host.getCustomer(store.ownerId);
    const phones = [store.phone, owner?.phone];
    const emails = [store.email, owner?.email].map((e) => e?.toLowerCase());
    if (
      (input.phone && phones.some((p) => samePhone(p, input.phone))) ||
      (email && emails.includes(email))
    ) {
      return links.find((l) => l.supplier.storeId === store.id)!;
    }
  }
  return null;
}

/** D-51: an open invite already goes to this phone or email. */
async function openInviteFor(sellerStoreId: string, input: InviteCreateInput) {
  const open = await deps.prisma.supplierInvite.findMany({
    where: { sellerStoreId, status: "SENT", expiresAt: { gt: new Date() } },
  });
  const email = input.email?.toLowerCase();
  return (
    open.find(
      (i) => samePhone(i.contactPhone, input.phone) || (!!email && i.contactEmail === email),
    ) ?? null
  );
}

export async function createInvite(store: StoreRef, customerId: string, input: InviteCreateInput) {
  if (await existingSupplierFor(store.id, input)) {
    throw HttpError.conflict("Already your supplier — you'll find them under Your suppliers");
  }
  const open = await openInviteFor(store.id, input);
  if (open) {
    throw HttpError.conflict(
      `You already invited ${open.contactName} on this number or email — resend that invite from Invited instead`,
    );
  }
  if (input.codAllowed && input.turnOnStoreCod && !store.acceptCod) {
    await deps.host.setStoreCod(customerId, store.id, true);
  }

  const { token, tokenHash } = newInviteToken();
  const invite = await deps.prisma.supplierInvite.create({
    data: {
      tokenHash,
      sellerStoreId: store.id,
      createdBy: customerId,
      contactName: input.name,
      contactPhone: input.phone ?? null,
      contactEmail: input.email?.toLowerCase() ?? null,
      codAllowed: input.codAllowed,
      returnFeePayer: input.returnFeePayer,
      expiresAt: daysFromNow(dropshipConfig.inviteExpiryDays),
    },
  });
  const url = inviteUrl(token);
  mailInvite(store, invite, url, invite.expiresAt);
  return {
    invite: shapeInvite(invite),
    inviteUrl: url,
    shareText: inviteMessage(store.name, invite.contactName, url),
    emailed: !!invite.contactEmail,
  };
}

/**
 * D-27: only the hash is stored, so "resend" issues a NEW link (the old one
 * stops working) with a fresh expiry, and emails it if there is an email.
 */
export async function resendInvite(store: StoreRef, id: string) {
  const { token, tokenHash } = newInviteToken();
  const expiresAt = daysFromNow(dropshipConfig.inviteExpiryDays);
  const result = await deps.prisma.supplierInvite.updateMany({
    where: { id, sellerStoreId: store.id, status: { in: ["SENT", "EXPIRED"] } },
    data: { tokenHash, expiresAt, status: "SENT" },
  });
  if (result.count === 0) throw HttpError.notFound("No open invite found");
  const invite = await deps.prisma.supplierInvite.findUniqueOrThrow({ where: { id } });
  const url = inviteUrl(token);
  mailInvite(store, invite, url, expiresAt);
  return {
    invite: shapeInvite(invite),
    inviteUrl: url,
    shareText: inviteMessage(store.name, invite.contactName, url),
    emailed: !!invite.contactEmail,
  };
}

export async function revokeInvite(storeId: string, id: string) {
  const result = await deps.prisma.supplierInvite.updateMany({
    where: { id, sellerStoreId: storeId, status: { in: ["SENT", "EXPIRED"] } },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) throw HttpError.notFound("No open invite found");
}

async function findByToken(token: string) {
  const invite = await deps.prisma.supplierInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite) throw HttpError.notFound("This invite link isn't valid");
  return invite;
}

type Invitee = { contactPhone: string | null; contactEmail: string | null };
const sentTo = (invite: Invitee) => maskContact({ phone: invite.contactPhone, email: invite.contactEmail });

/**
 * D-52: an invite is personal. Only the account that has the phone or email the seller entered
 * may use it; anyone else is stopped before the join sheet, and `accept` refuses them (403).
 */
async function isInvitee(invite: Invitee, customerId: string) {
  const account = await deps.host.getCustomer(customerId);
  return !!account && inviteMatches({ phone: invite.contactPhone, email: invite.contactEmail }, account);
}

/** Public preview: who is inviting, on what terms, until when, and who it is for. */
export async function previewInvite(token: string) {
  const invite = await findByToken(token);
  const seller = await deps.host.getStore(invite.sellerStoreId);
  if (!seller) throw HttpError.notFound("This invite link isn't valid");
  return {
    sellerName: seller.name,
    sellerLogoUrl: seller.logoUrl,
    name: invite.contactName,
    sentTo: sentTo(invite),
    codAllowed: invite.codAllowed,
    returnFeePayer: invite.returnFeePayer,
    status: inviteState(invite),
    expiresAt: invite.expiresAt,
    shipWithinDaysMax: dropshipConfig.shipWithinDaysMax,
    returnDaysMax: dropshipConfig.returnDaysMax,
  };
}

/**
 * The signed-in invitee's stores for the join sheet: which can be used, and
 * the supplier terms of any that already supply (so they aren't asked again).
 * `forYou: false` (no stores) when the account isn't the one invited (D-52).
 */
export async function inviteStores(token: string, customerId: string) {
  const invite = await findByToken(token);
  if (!(await isInvitee(invite, customerId))) return { forYou: false, stores: [] };
  return { forYou: true, stores: await joinStores(invite.sellerStoreId, customerId) };
}

async function joinStores(sellerStoreId: string, customerId: string) {
  const stores = await deps.host.listOwnedStores(customerId);
  const suppliers = await deps.prisma.supplier.findMany({
    where: { storeId: { in: stores.map((s) => s.id) } },
  });
  const byStore = new Map(suppliers.map((s) => [s.storeId, s]));
  // Seller and supplier are different: only the customer's supplier accounts can supply here, never a
  // shop that sells to customers (D-49).
  return stores.filter((store) => byStore.get(store.id)?.supplyOnly).map((store) => {
    const supplier = byStore.get(store.id);
    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logoUrl: store.logoUrl,
      hasAddress: store.hasAddress,
      isSeller: store.id === sellerStoreId,
      supplier: supplier
        ? {
            status: supplier.status,
            shippingFee: Number(supplier.shippingFee),
            shipWithinDays: supplier.shipWithinDays,
            returnDays: supplier.returnDays,
          }
        : null,
    };
  });
}

async function joinedResult(linkId: string) {
  const link = await deps.prisma.supplierLink.findUniqueOrThrow({
    where: { id: linkId },
    include: { supplier: true },
  });
  const store = await deps.host.getStore(link.supplier.storeId);
  return {
    linkId: link.id,
    storeId: link.supplier.storeId,
    storeSlug: store?.slug ?? null,
    supplyOnly: link.supplier.supplyOnly,
  };
}

/**
 * Join as the inviting seller's supplier. The invite is claimed first with a
 * guarded update (SENT → ACCEPTED), so a double tap or a second device can't
 * use it twice (SU-13): the loser gets the link already made.
 */
export async function acceptInvite(token: string, customerId: string, input: InviteAcceptInput) {
  const invite = await findByToken(token);
  const state = inviteState(invite);

  if (state === "ACCEPTED") {
    if (invite.linkId) {
      const done = await joinedResult(invite.linkId);
      const store = await deps.host.getStore(done.storeId);
      if (store?.ownerId === customerId) return { ...done, alreadyJoined: true };
    }
    throw HttpError.conflict("This invite has already been used");
  }
  if (state === "REVOKED") throw HttpError.conflict("This invite was cancelled by the seller");
  if (state === "EXPIRED") {
    await deps.prisma.supplierInvite.updateMany({
      where: { id: invite.id, status: "SENT" },
      data: { status: "EXPIRED" },
    });
    throw HttpError.conflict("This invite has expired — ask the seller to send it again");
  }
  if (!(await isInvitee(invite, customerId))) {
    throw HttpError.forbidden(`This invite was sent to ${sentTo(invite)}. Sign in with it to join.`);
  }

  const seller = await deps.host.getStore(invite.sellerStoreId);
  if (!seller) throw HttpError.conflict("This seller's store no longer exists");

  // Resolve (or plan) the supplier store before claiming, so a refusal
  // leaves the invite usable.
  let existingStore: StoreRef | null = null;
  if (input.storeId) {
    existingStore = await deps.host.getOwnedStore(customerId, input.storeId);
    if (existingStore.id === seller.id) {
      throw HttpError.badRequest("Your own store can't supply itself"); // SU-15
    }
  }
  const existingSupplier = existingStore
    ? await deps.prisma.supplier.findUnique({ where: { storeId: existingStore.id } })
    : null;
  if (existingStore && !existingSupplier?.supplyOnly) {
    throw HttpError.badRequest(
      "A shop that sells can't also be a supplier. Create a supplier account instead.",
    ); // D-49
  }
  if (existingStore && !existingStore.hasAddress) {
    throw HttpError.badRequest("Add your store's business address first"); // SU-16
  }
  if (existingSupplier?.status === "SUSPENDED") {
    throw HttpError.forbidden("This store can't supply sellers right now — contact UnieMax support");
  }
  const profile =
    input.shipWithinDays !== undefined &&
    input.returnDays !== undefined &&
    input.shippingFee !== undefined
      ? {
          shippingFee: input.shippingFee,
          shipWithinDays: input.shipWithinDays,
          returnDays: input.returnDays,
        }
      : null;
  if (!existingSupplier && !profile) {
    throw HttpError.badRequest("Enter your shipping fee, ship-within days and returns");
  }

  const claimed = await deps.prisma.supplierInvite.updateMany({
    where: { id: invite.id, status: "SENT", expiresAt: { gt: new Date() } },
    data: { status: "ACCEPTED" },
  });
  if (claimed.count === 0) {
    const again = await deps.prisma.supplierInvite.findUniqueOrThrow({ where: { id: invite.id } });
    if (again.linkId) return { ...(await joinedResult(again.linkId)), alreadyJoined: true };
    throw HttpError.conflict("This invite is being used right now — refresh in a moment");
  }

  let madeStoreId: string | null = null;
  try {
    const store =
      existingStore ??
      (await deps.host.createSupplyStore(customerId, {
        name: input.newStore!.name,
        phone: input.newStore!.phone,
        address: input.newStore!.address,
      }));
    if (!existingStore) madeStoreId = store.id;

    const linkId = await deps.prisma.$transaction(async (tx) => {
      let supplier = existingSupplier;
      if (!supplier) {
        supplier = await tx.supplier.create({
          data: {
            storeId: store.id,
            supplyOnly: !existingStore,
            status: dropshipConfig.inviteNeedsAdminApproval ? "PENDING" : "ACTIVE",
            ...profile!,
          },
        });
        await logChanges(tx, {
          supplierId: supplier.id,
          linkId: null,
          diffs: [
            { field: "shippingFee", fromValue: null, toValue: supplier.shippingFee.toFixed(2) },
            { field: "shipWithinDays", fromValue: null, toValue: String(supplier.shipWithinDays) },
            { field: "returnDays", fromValue: null, toValue: String(supplier.returnDays) },
          ],
          changedBy: customerId,
          changedAs: "SUPPLIER",
        });
      }

      const current = await tx.supplierLink.findUnique({
        where: { supplierId_sellerStoreId: { supplierId: supplier.id, sellerStoreId: seller.id } },
      });
      // Already linked and not ended: keep it (SU-14 found late).
      let link = current && current.status !== "ENDED" ? current : null;
      if (!link) {
        const terms = { codAllowed: invite.codAllowed, returnFeePayer: invite.returnFeePayer };
        link = current
          ? await tx.supplierLink.update({
              where: { id: current.id },
              data: { ...terms, status: "ACTIVE", statusBy: null },
            })
          : await tx.supplierLink.create({
              data: { supplierId: supplier.id, sellerStoreId: seller.id, ...terms },
            });
        await logChanges(tx, {
          supplierId: supplier.id,
          linkId: link.id,
          diffs: [
            { field: "codAllowed", fromValue: null, toValue: String(invite.codAllowed) },
            { field: "returnFeePayer", fromValue: null, toValue: invite.returnFeePayer },
          ],
          changedBy: invite.createdBy,
          changedAs: "SELLER",
        });
      }
      await tx.supplierInvite.update({ where: { id: invite.id }, data: { linkId: link.id } });
      return link.id;
    });

    deps.host.notify(seller.ownerId, {
      title: "Your supplier joined",
      body: `${store.name} accepted your invite and can now offer you products.`,
      url: `/mystores/${seller.slug}/suppliers`,
    });
    return { ...(await joinedResult(linkId)), alreadyJoined: false };
  } catch (err) {
    // Give the invite back so the supplier can try again, and drop the store made for this
    // attempt, so a retry doesn't leave "Name" and "Name-2" behind.
    const givenBack = await deps.prisma.supplierInvite
      .updateMany({ where: { id: invite.id, linkId: null }, data: { status: "SENT" } })
      .catch(() => ({ count: 0 }));
    if (givenBack.count > 0 && madeStoreId) await deps.host.discardSupplyStore(madeStoreId).catch(() => {});
    throw err;
  }
}
