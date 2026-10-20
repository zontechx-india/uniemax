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

// ===========================================================================
// Phase 3 — supplier products in the seller's store
// ===========================================================================

type Money = string | number | Prisma.Decimal;
const D = (v: Money) => new Prisma.Decimal(v);
const paise = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function capAtMrp(price: Prisma.Decimal, mrp: Money | null): Prisma.Decimal {
  return mrp != null && price.gt(mrp) ? D(mrp) : price;
}

/**
 * The price an add sheet starts from: the supplier's own shop price when it
 * is at least the cost, otherwise cost + `markupPct` %. Capped at MRP.
 */
export function suggestedPrice(input: {
  cost: Money;
  shopPrice: Money | null;
  mrp: Money | null;
  markupPct: number;
}): Prisma.Decimal {
  const cost = D(input.cost);
  const shop = input.shopPrice == null ? null : D(input.shopPrice);
  const base = shop && shop.gte(cost) ? shop : wholeRupees(cost.mul(100 + input.markupPct).div(100));
  return capAtMrp(base, input.mrp);
}

/** "Add on top of supplier price [₹ | %]". Capped at MRP. */
export function addOnTop(
  cost: Money,
  on: { amount: number } | { percent: number },
  mrp: Money | null,
): Prisma.Decimal {
  const c = D(cost);
  const price = "amount" in on ? paise(c.add(on.amount)) : wholeRupees(c.mul(100 + on.percent).div(100));
  return capAtMrp(price, mrp);
}

/** A percentage markup lands on a whole rupee, rounded up so the margin never falls below it. */
function wholeRupees(v: Prisma.Decimal): Prisma.Decimal {
  return v.toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
}

export function rupee(v: Money): string {
  return `₹${D(v).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * C-3: a copy's price must be at least the supplier price and at most MRP.
 * Returns the refusal message, or null when the price is fine.
 */
export function priceProblem(price: Money, cost: Money, mrp: Money | null): string | null {
  const p = D(price);
  if (p.gte(cost) && (mrp == null || p.lte(mrp))) return null;
  return mrp != null
    ? `Price must be between ${rupee(cost)} (supplier price) and ${rupee(mrp)} (MRP).`
    : `Price must be at least ${rupee(cost)} (supplier price).`;
}

/** The delivery charge this store adds to an order of `subtotal` (its default rate). */
export function deliveryCharge(
  rate: { type: "FREE" | "FLAT"; amount: number; freeAbove: number | null },
  subtotal: Money,
): Prisma.Decimal {
  if (rate.type === "FREE") return D(0);
  if (rate.freeAbove != null && D(subtotal).gte(rate.freeAbove)) return D(0);
  return D(rate.amount);
}

/**
 * The add sheet's result line for one unit: what the customer pays, what the
 * supplier gets, the platform fee (D-20) and what the seller keeps. It may be
 * negative (C-23) — it warns, never blocks.
 */
export function earnings(input: {
  price: Money;
  cost: Money;
  delivery: Money;
  supplierShipping: Money;
  platformFeePct: number;
}) {
  const customerPays = D(input.price).add(input.delivery);
  const supplierGets = D(input.cost).add(input.supplierShipping);
  const fee = paise(customerPays.mul(input.platformFeePct).div(100));
  const youEarn = customerPays.sub(supplierGets).sub(fee);
  return { customerPays, supplierGets, fee, youEarn };
}

/** Plain-words delivery area (D-33): the rules hold PIN codes, not states. */
export function deliveryLabel(rule: {
  type: "ALL" | "INCLUDE" | "EXCLUDE";
  pincodes: string[];
}): string {
  const n = rule.pincodes.length;
  if (rule.type === "ALL") return "All India";
  if (rule.type === "INCLUDE") return n === 1 ? "1 PIN code" : `${n} PIN codes`;
  return n === 1 ? "All India except 1 PIN code" : `All India except ${n} PIN codes`;
}

// ---------------------------------------------------------------------------
// Sync — one copy at a time (docs/dropshipping/supplier-products → Sync rules)
// ---------------------------------------------------------------------------

export type PauseReason =
  | "COST_ABOVE_PRICE"
  | "SUPPLY_CLOSED"
  | "SUPPLIER_INACTIVE"
  | "LINK_INACTIVE"
  | "SOURCE_REMOVED";

type Rule = { type: "ALL" | "INCLUDE" | "EXCLUDE"; pincodes: string[] };

export interface SyncInput {
  resale: {
    followCost: boolean;
    state: "ACTIVE" | "PAUSED";
    pauseReason: PauseReason | null;
    resumeOnClear: boolean;
  };
  copy: {
    isActive: boolean;
    hasImage: boolean;
    variants: { variantId: string; supplyVariantId: string; lastCost: string; price: string }[];
  };
  /** null = the supplier's product is gone. */
  source: {
    isActive: boolean;
    optionTypes: { name: string; values: string[] }[];
    deliveryRule: Rule;
    variants: {
      id: string;
      name: string;
      isActive: boolean;
      compareAtPrice: string | null;
      stock: number;
      optionValues: Record<string, string> | null;
    }[];
  } | null;
  /** The offer; null = no SupplyProduct row any more. */
  supply: { isOpen: boolean; variants: { variantId: string; cost: string; isOpen: boolean }[] } | null;
  supplierActive: boolean;
  supplierStoreActive: boolean;
  linkActive: boolean;
  codAllowed: boolean;
}

export interface SyncPlan {
  copy: {
    optionTypes: { name: string; values: string[] }[];
    deliveryRule: Rule;
    codAvailable: boolean;
    isActive?: boolean;
    variants: {
      variantId: string;
      name?: string;
      optionValues?: Record<string, string> | null;
      price: string;
      compareAtPrice: string | null;
      stockQuantity: number;
      isActive: boolean;
    }[];
  };
  lastCosts: { variantId: string; lastCost: string }[];
  resale: { state: "ACTIVE" | "PAUSED"; pauseReason: PauseReason | null; resumeOnClear: boolean };
  priceChanges: { variantId: string; from: string; to: string; capped: boolean }[];
  stateChanged: "PAUSED" | "RESUMED" | null;
}

/**
 * The whole sync decision for one copy, with no I/O. Running it again on its
 * own result changes nothing (C-21): follow-price works from `lastCost`, and
 * every other field is a plain mirror.
 */
export function planSync(input: SyncInput): SyncPlan {
  const sourceVariants = new Map(input.source?.variants.map((v) => [v.id, v]) ?? []);
  const offered = new Map(input.supply?.variants.map((v) => [v.variantId, v]) ?? []);
  const priceChanges: SyncPlan["priceChanges"] = [];
  const lastCosts: SyncPlan["lastCosts"] = [];

  let anyClosed = false;
  let anyCostAbove = false;
  let anySellable = false;

  const variants = input.copy.variants.map((cv) => {
    const src = sourceVariants.get(cv.supplyVariantId);
    const offer = offered.get(cv.supplyVariantId);
    const mrp = src?.compareAtPrice ?? null;
    let price = D(cv.price);

    if (offer) {
      const cost = D(offer.cost);
      if (!cost.eq(cv.lastCost)) {
        if (input.resale.followCost) {
          const raw = price.add(cost.sub(cv.lastCost));
          const next = capAtMrp(raw, mrp);
          if (!next.eq(price)) {
            priceChanges.push({
              variantId: cv.variantId,
              from: price.toFixed(2),
              to: next.toFixed(2),
              capped: !next.eq(raw),
            });
            price = next;
          }
          // Follow-price only: a fixed price keeps the cost it was set against,
          // so the paused note can offer the seller's old margin back.
          lastCosts.push({ variantId: cv.variantId, lastCost: cost.toFixed(2) });
        }
      }
    }

    let ok = true;
    if (!src || !src.isActive) {
      ok = false;

    } else if (!offer || !offer.isOpen) {
      ok = false;
      anyClosed = true;
    } else if (D(offer.cost).gt(price) || (mrp != null && price.gt(mrp))) {
      ok = false;
      anyCostAbove = true;
    }
    if (ok) anySellable = true;

    return {
      variantId: cv.variantId,
      ...(src ? { name: src.name, optionValues: src.optionValues } : {}),
      price: price.toFixed(2),
      // D-35: the MRP shows only when it is above the price.
      compareAtPrice: mrp != null && D(mrp).gt(price) ? D(mrp).toFixed(2) : null,
      stockQuantity: src && ok ? src.stock : 0,
      isActive: ok,
    };
  });

  let reason: PauseReason | null = null;
  if (!input.linkActive) reason = "LINK_INACTIVE";
  else if (!input.supplierActive || !input.supplierStoreActive) reason = "SUPPLIER_INACTIVE";
  else if (!input.source || !input.source.isActive) reason = "SOURCE_REMOVED";
  else if (!input.supply || !input.supply.isOpen) reason = "SUPPLY_CLOSED";
  else if (!anySellable) {
    reason = anyCostAbove ? "COST_ABOVE_PRICE" : anyClosed ? "SUPPLY_CLOSED" : "SOURCE_REMOVED";
  }


  // Only the option values the copy actually carries, in the supplier's order.
  const used = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [k, val] of Object.entries(v.optionValues ?? {})) {
      if (!used.has(k)) used.set(k, new Set());
      used.get(k)!.add(val);
    }
  }
  const optionTypes = (input.source?.optionTypes ?? [])
    .map((t) => ({ name: t.name, values: t.values.filter((val) => used.get(t.name)?.has(val)) }))
    .filter((t) => t.values.length > 0);

  const { state, resumeOnClear } = input.resale;
  let resale: SyncPlan["resale"] = { state, pauseReason: input.resale.pauseReason, resumeOnClear };
  let isActive: boolean | undefined;
  let stateChanged: SyncPlan["stateChanged"] = null;
  if (reason) {
    if (input.copy.isActive) {
      isActive = false;
      resale = { state: "PAUSED", pauseReason: reason, resumeOnClear: true };
    } else {
      resale = {
        state: "PAUSED",
        pauseReason: reason,
        resumeOnClear: state === "PAUSED" ? resumeOnClear : false,
      };
    }
    if (state !== "PAUSED") stateChanged = "PAUSED";
  } else if (state === "PAUSED") {
    // C-15: back on only if the system was the one that switched it off.
    if (resumeOnClear && input.copy.hasImage) isActive = true;
    resale = { state: "ACTIVE", pauseReason: null, resumeOnClear: false };
    stateChanged = "RESUMED";
  }

  return {
    copy: {
      optionTypes,
      deliveryRule: input.source?.deliveryRule ?? { type: "ALL", pincodes: [] },
      codAvailable: input.codAllowed,
      ...(isActive !== undefined ? { isActive } : {}),
      variants,
    },
    lastCosts,
    resale,
    priceChanges,
    stateChanged,
  };
}

/** Why a copy is paused, in the seller's words. */
export function pauseText(reason: PauseReason): string {
  switch (reason) {
    case "COST_ABOVE_PRICE":
      return "The supplier's price is now above yours";
    case "SUPPLY_CLOSED":
      return "The supplier stopped offering it";
    case "SUPPLIER_INACTIVE":
      return "The supplier can't supply right now";
    case "LINK_INACTIVE":
      return "You and this supplier aren't working together right now";
    case "SOURCE_REMOVED":
      return "The supplier removed this product";
  }
}
