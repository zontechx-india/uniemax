import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * Pure rules — no database, no HTTP — so each is unit-tested on its own
 * (test/unit/dropship-domain.test.ts).
 */

export type LinkStatus = "ACTIVE" | "PAUSED" | "ENDED";
export type ReturnFeePayer = "SELLER" | "SUPPLIER";
export type InviteStatus = "SENT" | "ACCEPTED" | "REVOKED" | "EXPIRED";

/** A fresh invite token (the link) and the hash that is the only thing stored. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function daysFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** What an invite really is right now: a SENT invite past its date is EXPIRED. */
export function inviteState(
  invite: { status: InviteStatus; expiresAt: Date },
  now = new Date(),
): InviteStatus {
  return invite.status === "SENT" && invite.expiresAt <= now ? "EXPIRED" : invite.status;
}

/**
 * Bulk "Offer at shop price − N %": the price for sellers, rounded to paise.
 * Never below zero.
 */
export function discountedCost(
  shopPrice: string | number | Prisma.Decimal,
  discountPct: number,
): Prisma.Decimal {
  const cost = new Prisma.Decimal(shopPrice)
    .mul(100 - discountPct)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return cost.isNegative() ? new Prisma.Decimal(0) : cost;
}

/** A link moves freely between ACTIVE and PAUSED; ENDED is for good (D-19). */
export function canMoveLink(from: LinkStatus, to: LinkStatus): boolean {
  return from !== to && from !== "ENDED";
}

export interface TermDiff {
  field: string;
  fromValue: string | null;
  toValue: string | null;
}

export type TermValue = string | number | boolean | Prisma.Decimal | null | undefined;

const isNumeric = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

export function termText(v: TermValue): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Prisma.Decimal ? v.toFixed(2) : String(v);
}

/**
 * The terms that actually change between `current` and `next`. Keys absent
 * from `next` are untouched; equal amounts (2 vs "2.00") are not changes.
 */
export function diffTerms(
  current: Record<string, TermValue>,
  next: Record<string, TermValue>,
): TermDiff[] {
  const diffs: TermDiff[] = [];
  for (const [field, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const from = termText(current[field]);
    const to = termText(value);
    const same =
      from !== null && to !== null && isNumeric(from) && isNumeric(to)
        ? new Prisma.Decimal(from).eq(to)
        : from === to;
    if (!same) diffs.push({ field, fromValue: from, toValue: to });
  }
  return diffs;
}

const rupees = (v: string | null) =>
  v == null ? "—" : `₹${new Prisma.Decimal(v).toFixed(2).replace(/\.00$/, "")}`;
const dayCount = (v: string | null) => (v === "1" ? "1 day" : `${v} days`);
const returnsLabel = (v: string | null) =>
  v === "0" ? "no returns" : `returns within ${dayCount(v)}`;

/**
 * One term change in the plain words both sides read on the Terms panel and
 * in notices (docs/dropshipping/glossary.md) — never "link", "dropship", "copy".
 */
export function describeChange(
  field: string,
  fromValue: string | null,
  toValue: string | null,
): string {
  switch (field) {
    case "codAllowed":
      return toValue === "true"
        ? "Cash on delivery allowed"
        : "No cash on delivery — online payment only";
    case "returnFeePayer":
      return toValue === "SELLER"
        ? "Returned-parcel fee paid by the seller"
        : "Returned-parcel fee paid by the supplier";
    case "shippingFee":
      return fromValue == null
        ? `Shipping fee ${rupees(toValue)} per order`
        : `Shipping fee changed from ${rupees(fromValue)} to ${rupees(toValue)} per order`;
    case "shipWithinDays":
      return fromValue == null
        ? `Ships within ${dayCount(toValue)}`
        : `Ships within ${dayCount(toValue)} (was ${dayCount(fromValue)})`;
    case "returnDays":
      return fromValue == null
        ? `Accepts ${returnsLabel(toValue)}`
        : `Now accepts ${returnsLabel(toValue)} (was ${returnsLabel(fromValue)})`;
    default:
      if (field.startsWith("cost:")) {
        if (toValue == null) return "An option is no longer offered to sellers";
        return fromValue == null
          ? `Price for sellers ${rupees(toValue)}`
          : `Price for sellers changed from ${rupees(fromValue)} to ${rupees(toValue)}`;
      }
      return `${field} changed`;
  }
}

/** Phone numbers compared by their last ten digits (SU-14). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
  return !!a && !!b && digits(a).length === 10 && digits(a) === digits(b);
}
