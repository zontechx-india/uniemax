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

/**
 * D-52: an invite is personal — only the account with the phone (last ten digits) or the
 * email the seller entered may use it.
 */
export function inviteMatches(
  invited: { phone: string | null; email: string | null },
  account: { phone: string | null; email: string | null },
): boolean {
  const email = invited.email?.toLowerCase();
  return (
    samePhone(invited.phone, account.phone) || (!!email && email === account.email?.toLowerCase())
  );
}

/**
 * Who an invite is for, half hidden ("98••••••10", "ra•••@gmail.com"), so the right person
 * knows which number or email to sign in with (D-52). The phone wins when both were entered.
 */
export function maskContact(invited: { phone: string | null; email: string | null }): string {
  const digits = invited.phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10) return `${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
  const [local = "", domain = ""] = (invited.email ?? "").split("@");
  return `${local.slice(0, local.length > 2 ? 2 : 1)}•••@${domain}`;
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

/** ₹3,450 / ₹1,25,000 / ₹99.50 — Indian digit grouping, paise only when there are some. */
export function rupee(v: Money): string {
  const n = D(v).toDecimalPlaces(2);
  return `₹${n.toNumber().toLocaleString("en-IN", {
    minimumFractionDigits: n.isInteger() ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
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

// ---------------------------------------------------------------------------
// Supplier orders (Phase 4, docs/dropshipping/orders)
// ---------------------------------------------------------------------------

export type SupplierOrderStatus =
  | "AWAITING_PAYMENT"
  | "EXPIRED"
  | "NEW"
  | "ACCEPTED"
  | "SHIPPED"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED"
  | "RETURNED";
export type OrderActor = "SUPPLIER" | "SELLER" | "ADMIN" | "SYSTEM";

/**
 * Every move a supplier order can make: from which states, to which, and who
 * may make it. The one table every write checks (the guarded update then
 * re-checks `from` in the database).
 */
export const ORDER_MOVES = {
  paid: { from: ["AWAITING_PAYMENT"], to: "NEW", who: ["SYSTEM"] },
  expire: { from: ["AWAITING_PAYMENT"], to: "EXPIRED", who: ["SYSTEM"] },
  repaid: { from: ["EXPIRED"], to: "NEW", who: ["SYSTEM"] },
  repaidSoldOut: { from: ["EXPIRED"], to: "REJECTED", who: ["SYSTEM"] },
  cancel: { from: ["AWAITING_PAYMENT", "EXPIRED", "NEW", "ACCEPTED"], to: "CANCELLED", who: ["SYSTEM"] },
  confirm: { from: ["NEW"], to: "ACCEPTED", who: ["SUPPLIER"] },
  ship: { from: ["NEW", "ACCEPTED"], to: "SHIPPED", who: ["SUPPLIER"] },
  cantShip: { from: ["NEW", "ACCEPTED"], to: "REJECTED", who: ["SUPPLIER"] },
  delivered: { from: ["SHIPPED"], to: "DELIVERED", who: ["SUPPLIER", "SELLER"] },
  cameBack: { from: ["SHIPPED"], to: "RETURNED", who: ["SUPPLIER"] },
} as const satisfies Record<
  string,
  { from: readonly SupplierOrderStatus[]; to: SupplierOrderStatus; who: readonly OrderActor[] }
>;
export type OrderMove = keyof typeof ORDER_MOVES;

export function canMove(move: OrderMove, from: SupplierOrderStatus, who: OrderActor): boolean {
  const m = ORDER_MOVES[move];
  return (m.from as readonly string[]).includes(from) && (m.who as readonly string[]).includes(who);
}

/** States in which the supplier's stock is set aside for the order. */
export const HOLDS_STOCK: readonly SupplierOrderStatus[] = ["AWAITING_PAYMENT", "NEW", "ACCEPTED"];
/** States the supplier still has to ship from. */
export const TO_SHIP: readonly SupplierOrderStatus[] = ["NEW", "ACCEPTED"];
/** Finished, one way or the other. */
export const CLOSED: readonly SupplierOrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED", "RETURNED", "EXPIRED"];

/** Why a move was refused, in words a person can act on. */
export function moveRefusal(from: SupplierOrderStatus): string {
  if (from === "CANCELLED") return "This order was cancelled.";
  return "This order was just updated — refresh.";
}

/** costTotal = Σ unitCost × qty; supplierShare = costTotal + shippingFee (money: Amounts). */
export function supplierAmounts(lines: { unitCost: Money; quantity: number }[], shippingFee: Money) {
  const costTotal = paise(lines.reduce((sum, l) => sum.add(D(l.unitCost).mul(l.quantity)), D(0)));
  return { costTotal, shippingFee: paise(D(shippingFee)), supplierShare: paise(costTotal.add(shippingFee)) };
}

/** D-20: the platform fee on an order, from the rate in force at placement. */
export function platformFeeFor(orderTotal: Money, pct: number): Prisma.Decimal {
  return paise(D(orderTotal).mul(pct).div(100));
}

/** "Ship by" = when the order became NEW + the snapshotted ship-within days. */
export function shipByDate(from: Date, shipWithinDays: number): Date {
  return daysFromNow(shipWithinDays, from);
}

/**
 * D-13: cash on delivery only when the whole order is one parcel — every line
 * from one supplier, or none from suppliers. `supplierId` null = the seller's own.
 */
export function onePlace(lines: { supplierId: string | null }[]): boolean {
  return new Set(lines.map((l) => l.supplierId ?? "own")).size <= 1;
}

export const PICKUP_REFUSED = "Home delivery only — some items ship from a supplier.";
export const COD_SPLIT_REFUSED = "Cash on delivery isn't available when items ship from different places.";

/** Past its "Ship by" and not on its way yet (F-2). */
export function isLate(o: { status: SupplierOrderStatus; shipBy: Date | null }, now = new Date()): boolean {
  return (TO_SHIP as readonly string[]).includes(o.status) && o.shipBy !== null && o.shipBy < now;
}

/** F-12: the supplier stops seeing the customer's phone and address N days after closing. */
export function customerDataHidden(closedAt: Date | null, days: number, now = new Date()): boolean {
  return closedAt !== null && now.getTime() - closedAt.getTime() > days * 24 * 60 * 60 * 1000;
}

export type Rollup = "confirm" | "cancel" | "askSeller" | "wait";

/**
 * What the customer order should do now that a supplier order moved
 * ("Rolling up to the customer order"). The customer order never runs ahead
 * of its slowest parcel:
 * - a part failed (can't ship / came back): with no items of the seller's own
 *   and nothing on its way or delivered → cancel; otherwise the seller (or,
 *   once something was delivered, admin) decides → askSeller;
 * - every part confirmed or further, no items of the seller's own → confirm;
 * - otherwise wait.
 */
export function rollup(input: {
  hasOwnItems: boolean;
  parts: { status: SupplierOrderStatus }[];
}): Rollup {
  const s = input.parts.map((p) => p.status);
  const failed = s.some((x) => x === "REJECTED" || x === "RETURNED");
  if (failed) {
    if (input.hasOwnItems) return "askSeller";
    if (s.includes("SHIPPED")) return "wait"; // a parcel is still on its way
    if (s.includes("DELIVERED")) return "askSeller"; // a partial refund — by hand (F-4)
    return "cancel";
  }
  if (input.hasOwnItems) return "wait";
  const moving = s.every((x) => x === "ACCEPTED" || x === "SHIPPED" || x === "DELIVERED");
  return moving && s.length > 0 ? "confirm" : "wait";
}

/**
 * "You earn ₹X on this order" (D-38): the supplier lines' total (+ the
 * delivery charge when the order is only supplier products) − what the
 * supplier gets − the platform fee. Affiliate commission is left to the
 * Phase 5 statement.
 */
export function orderEarnings(input: {
  linesTotal: Money;
  deliveryCharge: Money;
  supplierShare: Money;
  platformFee: Money;
}): Prisma.Decimal {
  return paise(
    D(input.linesTotal).add(input.deliveryCharge).sub(input.supplierShare).sub(input.platformFee),
  );
}

export const CANT_SHIP_REASONS = {
  OUT_OF_STOCK: "Out of stock",
  DAMAGED: "Damaged",
  PINCODE: "Can't deliver to this pincode",
  OTHER: "Other",
} as const;
export type CantShipReason = keyof typeof CANT_SHIP_REASONS;

export function cantShipText(reason: CantShipReason, note: string | null): string {
  const base = CANT_SHIP_REASONS[reason];
  return note ? `${base}: ${note}` : base;
}

// ---------------------------------------------------------------------------
// The statement (Phase 5, docs/dropshipping/money → Who owes whom)
// ---------------------------------------------------------------------------

export type StatementState = "PENDING" | "OWED" | "HELD" | "VOID" | "SPLIT";
export type StatementViewer = "seller" | "supplier";

export interface StatementOrder {
  status: SupplierOrderStatus;
  statementState: StatementState;
  paymentMode: "PREPAID" | "COD";
  supplierShare: Money;
  collectAmount: Money | null;
  shippingFee: Money;
  returnFeePayer: ReturnFeePayer;
}

/**
 * One order's line on the account. `amount` is signed from the seller's side:
 * positive = the seller owes the supplier, negative = the supplier owes the
 * seller. It is what the order is worth on the account once it counts; `counts`
 * says whether it counts yet (only OWED lines do — pending, held and void ones
 * are shown but never in the balance). Every figure is the order's own
 * snapshot (D-18); nothing reads the current settings.
 *
 * - Delivered (or shipped long enough to count as delivered), prepaid, paid
 *   directly: the seller owes the supplier its `supplierShare`.
 * - The same, cash on delivery: the supplier's courier collected the cash, so
 *   the supplier owes the seller `collectAmount − supplierShare`.
 * - Came back: the supplier's shipping fee, owed by the seller only when this
 *   order's own `returnFeePayer` says so (D-17).
 * - Cancelled, couldn't ship, expired: nothing.
 */
export function statementLine(o: StatementOrder): { amount: Prisma.Decimal; counts: boolean } {
  const counts = o.statementState === "OWED";
  if (o.statementState === "VOID") return { amount: D(0), counts: false };
  // Paid by Easy Split: the supplier's share went straight to its vendor, so nothing is owed between the two.
  if (o.statementState === "SPLIT") return { amount: D(0), counts: false };
  switch (o.status) {
    case "RETURNED":
      return { amount: o.returnFeePayer === "SELLER" ? paise(D(o.shippingFee)) : D(0), counts };
    case "NEW":
    case "ACCEPTED":
    case "SHIPPED":
    case "DELIVERED":
      return {
        amount:
          o.paymentMode === "COD"
            ? paise(D(o.supplierShare).sub(D(o.collectAmount ?? 0)))
            : paise(D(o.supplierShare)),
        counts,
      };
    default:
      return { amount: D(0), counts: false }; // awaiting payment, expired, rejected, cancelled
  }
}

/**
 * What the seller owes the supplier: the counted lines, less what the seller
 * has paid, plus what the supplier has paid back. Positive = the seller owes.
 */
export function statementBalance(
  lines: { amount: Money; counts: boolean }[],
  payments: { direction: "SELLER_TO_SUPPLIER" | "SUPPLIER_TO_SELLER"; amount: Money }[],
): Prisma.Decimal {
  let balance = D(0);
  for (const l of lines) if (l.counts) balance = balance.add(l.amount);
  for (const p of payments) {
    balance = p.direction === "SELLER_TO_SUPPLIER" ? balance.sub(p.amount) : balance.add(p.amount);
  }
  return paise(balance);
}

/** The top line of the account, in plain words. */
export function balanceWords(balance: Money, viewer: StatementViewer, otherName: string): string {
  const b = D(balance);
  if (b.isZero()) return `All settled with ${otherName}`;
  const sellerOwes = b.gt(0);
  const amount = rupee(b.abs());
  if (viewer === "seller") return sellerOwes ? `You owe ${otherName} ${amount}` : `${otherName} owes you ${amount}`;
  return sellerOwes ? `${otherName} owes you ${amount}` : `You owe ${otherName} ${amount}`;
}

/** What a line's state means to a person. */
export function lineStateWords(state: StatementState, status: SupplierOrderStatus): string {
  if (state === "VOID") return "Cancelled";
  if (state === "SPLIT") return "Paid by UnieMax";
  if (state === "HELD") return "On hold — a problem is open";
  if (state === "OWED") return status === "RETURNED" ? "Came back" : "Counted";
  return "Not delivered yet";
}

export const MAX_PAYMENT = 1_000_000;

/** A recorded payment: a positive amount, not absurd, not dated in the future. */
export function validatePayment(input: { amount: Money; paidOn: Date }, now = new Date()): string | null {
  const a = D(input.amount);
  if (!a.gt(0)) return "Enter the amount that was paid";
  if (a.gt(MAX_PAYMENT)) return `The amount can't be more than ${rupee(MAX_PAYMENT)}`;
  if (a.decimalPlaces() > 2) return "Use rupees and paise only";
  // A day of slack: the date is picked in the person's own time zone.
  if (input.paidOn.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return "The payment date can't be in the future";
  return null;
}

// ---------------------------------------------------------------------------
// The hourly job's due-date rules (Phase 5) — pure, so each is tested alone
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface ReminderOrder {
  status: SupplierOrderStatus;
  shipBy: Date | null;
  shipWithinDays: number;
  shippedAt: Date | null;
  issueOpenAt: Date | null;
  statementState: StatementState;
  confirmRemindedAt: Date | null;
  lateNotifiedAt: Date | null;
  deliveredRemindedAt: Date | null;
}

/** F-1: still NEW (not confirmed) `hours` after it became NEW; the supplier is nudged once. */
export function confirmDue(o: ReminderOrder, hours: number, now = new Date()): boolean {
  if (o.status !== "NEW" || o.confirmRemindedAt || !o.shipBy) return false;
  const becameNew = o.shipBy.getTime() - o.shipWithinDays * DAY;
  return now.getTime() - becameNew >= hours * HOUR;
}

/** F-2: past "Ship by" and not shipped; the seller is told once. */
export function lateDue(o: ReminderOrder, now = new Date()): boolean {
  return isLate(o, now) && !o.lateNotifiedAt;
}

/** F-10: shipped `days` ago and nobody marked it delivered; the supplier is nudged once. */
export function deliveredDue(o: ReminderOrder, days: number, now = new Date()): boolean {
  return o.status === "SHIPPED" && !!o.shippedAt && !o.deliveredRemindedAt && now.getTime() - o.shippedAt.getTime() >= days * DAY;
}

/** Shipped more than `days` ago, never marked delivered, no open problem → counts as owed. */
export function owedFallbackDue(o: ReminderOrder, days: number, now = new Date()): boolean {
  return o.status === "SHIPPED" && o.statementState === "PENDING" && !o.issueOpenAt && !!o.shippedAt && now.getTime() - o.shippedAt.getTime() > days * DAY;
}

// ---------------------------------------------------------------------------
// Easy Split payouts (Phase 6, docs/dropshipping/money → Easy Split)
// ---------------------------------------------------------------------------

export type SettleVia = "DIRECT" | "SPLIT";

/**
 * How a supplier order is paid, decided once at placement (D-18): by Easy Split
 * only for a prepaid order, only while the provider is live, and only when both
 * the seller and this supplier can be paid out to. Cash on delivery never goes
 * through Cashfree, so it is always direct.
 */
export function chooseSettleVia(i: {
  paymentMode: "PREPAID" | "COD";
  splitLive: boolean;
  sellerActive: boolean;
  supplierActive: boolean;
}): SettleVia {
  return i.paymentMode === "PREPAID" && i.splitLive && i.sellerActive && i.supplierActive ? "SPLIT" : "DIRECT";
}

export interface SplitPart {
  /** The supplier's store: the vendor its share goes to. */
  storeId: string;
  supplierShare: Money;
  platformFee: Money;
}

export interface SplitShare {
  storeId: string;
  role: "SUPPLIER" | "SELLER";
  amount: Prisma.Decimal;
}

/**
 * The split of one customer order: amounts, never percentages. Each supplier
 * gets its `supplierShare`; the seller gets the rest of what the customer paid
 * less the platform fee, which UnieMax keeps. Checked before the call (PS-6):
 * nothing negative, and never more than the customer paid. When it can't be
 * done the order is simply paid directly.
 */
export function splitAmounts(i: {
  orderTotal: Money;
  sellerStoreId: string;
  parts: SplitPart[];
}): { ok: true; entries: SplitShare[]; fee: Prisma.Decimal } | { ok: false; reason: string } {
  const total = paise(D(i.orderTotal));
  const entries: SplitShare[] = i.parts.map((p) => ({ storeId: p.storeId, role: "SUPPLIER" as const, amount: paise(D(p.supplierShare)) }));
  const fee = paise(i.parts.reduce((sum, p) => sum.add(D(p.platformFee)), D(0)));
  const shares = entries.reduce((sum, e) => sum.add(e.amount), D(0));
  const seller = paise(total.sub(shares).sub(fee));
  if (entries.some((e) => e.amount.lt(0))) return { ok: false, reason: "A supplier share is negative" };
  if (seller.lt(0)) return { ok: false, reason: "The shares and the fee are more than the customer paid" };
  entries.push({ storeId: i.sellerStoreId, role: "SELLER", amount: seller });
  const paidOut = entries.reduce((sum, e) => sum.add(e.amount), D(0));
  if (paidOut.add(fee).gt(total)) return { ok: false, reason: "The split is more than the customer paid" };
  return { ok: true, entries, fee };
}

/** When Cashfree pays a vendor out: the hold (D-21) after the split. */
export function payoutDate(splitAt: Date, holdDays: number): Date {
  return daysFromNow(holdDays, splitAt);
}

interface SplitOrder {
  settleVia: SettleVia;
  splitState: "REQUESTED" | "DONE" | "FAILED" | "FALLBACK_DIRECT" | null;
  paidAt: Date | null;
}

/** A SPLIT part still waiting for its split, and the payment is old enough (Cashfree needs a couple of minutes). */
export function splitDue(o: SplitOrder, delayMinutes: number, now = new Date()): boolean {
  if (o.settleVia !== "SPLIT" || !o.paidAt) return false;
  if (o.splitState === "DONE" || o.splitState === "FALLBACK_DIRECT") return false;
  return now.getTime() >= o.paidAt.getTime() + delayMinutes * 60 * 1000;
}

/** Within `marginHours` of the end of the Order Split Delay window and still not split → a person must act (PS-3). */
export function splitWindowClosing(o: SplitOrder, windowHours: number, now = new Date(), marginHours = 2): boolean {
  if (o.settleVia !== "SPLIT" || !o.paidAt) return false;
  if (o.splitState === "DONE" || o.splitState === "FALLBACK_DIRECT") return false;
  return now.getTime() >= o.paidAt.getTime() + (windowHours - marginHours) * HOUR;
}

/** A COD order's platform fee is debited from the seller's vendor once the order is delivered (D-20). */
export function codFeeDue(o: {
  paymentMode: "PREPAID" | "COD";
  status: SupplierOrderStatus;
  platformFee: Money;
  feeAdjustedAt: Date | null;
}): boolean {
  return o.paymentMode === "COD" && o.status === "DELIVERED" && D(o.platformFee).gt(0) && !o.feeAdjustedAt;
}
