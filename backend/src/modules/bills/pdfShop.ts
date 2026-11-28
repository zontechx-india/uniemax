import sharp from "sharp";
import { prisma } from "../../config/prisma.js";
import { storage } from "../../package/storage/index.js";
import { DEFAULT_STORE_THEME } from "../stores/stores.schema.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { formatAddress } from "../stores/storeAddress.schema.js";
import type { BillPdfData } from "./billPdf.js";

/**
 * The parts every PDF made from billPdf.ts shares — the seller bill / receipt
 * (bills.service) and the order receipt (orders/orderReceipt.ts): the shop's
 * header block and the two ways a phone number is printed.
 */

/** "+91 98400 11223" — a number as people write it. */
export const spacedPhone = (p: string) => {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p;
};

/** "+91 98400 •••23" — for a copy that may be forwarded. */
export const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} •••${d.slice(8)}` : phone;
};

/** The shop's logo as a square PNG for the PDF, or null (missing, unreadable). */
async function logoPng(logoKey: string | null): Promise<Buffer | null> {
  if (!logoKey) return null;
  try {
    const bytes = await storage.get("logo", logoKey);
    if (!bytes) return null;
    return await sharp(bytes, { failOn: "error" }).resize(256, 256, { fit: "cover" }).png().toBuffer();
  } catch {
    return null;
  }
}

/** The shop block at the top of the PDF: name, legal name, address, contact, GSTIN, colour, logo. */
export async function pdfShop(storeId: string): Promise<BillPdfData["store"]> {
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { name: true, logoKey: true, theme: true, profile: true },
  });
  const profile = resolveProfile(store.profile);
  const theme = (store.theme ?? {}) as { primaryColor?: unknown };
  const legal =
    profile.businessName && profile.businessName.trim().toLowerCase() !== store.name.trim().toLowerCase()
      ? profile.businessName
      : null;
  return {
    name: store.name,
    legalName: legal,
    addressLines: profile.address ? [formatAddress(profile.address)] : [],
    phone: profile.phone ? spacedPhone(profile.phone) : null,
    email: profile.email,
    gstin: profile.tax.gstin,
    accent: typeof theme.primaryColor === "string" ? theme.primaryColor : DEFAULT_STORE_THEME.primaryColor,
    logo: await logoPng(store.logoKey),
  };
}

/** How an "already paid" (OFFLINE) bill was paid, in words: "Paid to {shop} by UPI". */
export const OFFLINE_MODE_LABEL: Record<string, string> = { CASH: "cash", UPI: "UPI", BANK: "bank transfer", OTHER: "another way" };
