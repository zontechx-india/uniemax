/**
 * Leads — pure rules (no Prisma, no Fastify), unit-tested in
 * test/unit/leads.test.ts. A lead is someone who nearly bought from a store:
 *
 *   PAYMENT_PENDING  an ONLINE order whose payment never went through. The
 *                    shopper gave this shop their name, phone and address at
 *                    checkout, so the seller may see them and follow up.
 *   ACTIVE           a signed-in shopper with this store's items in their
 *                    cart, active in the last 24 hours.
 *   ABANDONED        the same, inactive for 1 to 30 days.
 *
 * Cart leads are ANONYMOUS: the shopper never shared their details with the
 * shop, so no name, phone or customer id leaves the server for them.
 */

export type LeadKind = "PAYMENT_PENDING" | "ACTIVE" | "ABANDONED";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** In cart and active within this → ACTIVE; older (up to the max) → ABANDONED. */
export const ACTIVE_WINDOW_MS = DAY;
/** Carts untouched for longer are not leads any more. */
export const CART_MAX_AGE_MS = 30 * DAY;
/** Unpaid checkouts shown when the seller picks no dates. */
export const PAYMENT_MAX_AGE_MS = 7 * DAY;
/**
 * How far back the date filter can reach for unpaid checkouts: a year
 * ("Last 12 months" starts at the shopper's local midnight a year ago), plus
 * slack for time zones and leap years.
 */
export const PAYMENT_HISTORY_MS = 367 * DAY;
/** Call / WhatsApp only this long after the checkout — later feels like spam. */
export const CONTACT_WINDOW_MS = 7 * DAY;

/** Can the seller still call or WhatsApp about an unpaid checkout? */
export function canContact(placedAt: Date, now: Date): boolean {
  return now.getTime() - placedAt.getTime() <= CONTACT_WINDOW_MS;
}

/** A date filter after the server's caps; `to` null = up to now. */
export interface LeadRange {
  from: Date;
  to: Date | null;
}

/**
 * The window a list of one kind covers. No dates = the kind's default
 * (unpaid: 7 days; left in cart: 30 days). A `from` further back than the
 * kind keeps is moved up to its limit — carts have no history past 30 days
 * (a cart line is deleted when it leaves the cart), unpaid orders stay a
 * year. ACTIVE (last 24 h) takes no filter: null.
 */
export function leadRange(
  kind: LeadKind,
  query: { from?: Date | undefined; to?: Date | undefined },
  now: Date,
): LeadRange | null {
  if (kind === "ACTIVE") return null;
  const [defaultAge, maxAge] =
    kind === "PAYMENT_PENDING" ? [PAYMENT_MAX_AGE_MS, PAYMENT_HISTORY_MS] : [CART_MAX_AGE_MS, CART_MAX_AGE_MS];
  const earliest = now.getTime() - maxAge;
  const from = query.from ? Math.max(query.from.getTime(), earliest) : now.getTime() - defaultAge;
  return { from: new Date(from), to: query.to ?? null };
}

/** Is this moment inside the range? */
export function inRange(at: Date, range: LeadRange): boolean {
  return at >= range.from && (range.to === null || at <= range.to);
}

/** ACTIVE or ABANDONED by the cart's last activity; null = too old to be a lead. */
export function cartLeadKind(lastActiveAt: Date, now: Date): "ACTIVE" | "ABANDONED" | null {
  const age = now.getTime() - lastActiveAt.getTime();
  if (age < 0 || age <= ACTIVE_WINDOW_MS) return "ACTIVE";
  if (age <= CART_MAX_AGE_MS) return "ABANDONED";
  return null;
}

// ---------------------------------------------------------------------------
// Cart leads
// ---------------------------------------------------------------------------

export interface CartLineFact {
  cartId: string;
  quantity: number;
  createdAt: Date;
  /** Bumped by every cart sync — "the shopper was last here". */
  updatedAt: Date;
  productName: string;
  variantName: string | null;
  imageKey: string | null;
  /** Live price in paise; null when the line cannot be bought now. */
  unitPricePaise: bigint | null;
}

export interface CartLead {
  cartId: string;
  kind: "ACTIVE" | "ABANDONED";
  lastActiveAt: Date;
  /** When the oldest of these items went into the cart. */
  addedAt: Date;
  /** Buyable lines only, at today's price. */
  valuePaise: bigint;
  quantity: number;
  lines: Omit<CartLineFact, "cartId" | "createdAt" | "updatedAt">[];
}

/** Group one store's cart lines into one lead per cart, newest activity first. */
export function groupCartLeads(lines: CartLineFact[], now: Date): CartLead[] {
  const byCart = new Map<string, CartLineFact[]>();
  for (const line of lines) {
    const list = byCart.get(line.cartId);
    if (list) list.push(line);
    else byCart.set(line.cartId, [line]);
  }
  const leads: CartLead[] = [];
  for (const [cartId, cartLines] of byCart) {
    const lastActiveAt = new Date(Math.max(...cartLines.map((l) => l.updatedAt.getTime())));
    const kind = cartLeadKind(lastActiveAt, now);
    if (!kind) continue;
    // Oldest line first — "added 3 days ago" reads from the first thing added.
    const ordered = [...cartLines].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    leads.push({
      cartId,
      kind,
      lastActiveAt,
      addedAt: ordered[0]!.createdAt,
      valuePaise: cartLines.reduce(
        (acc, l) => acc + (l.unitPricePaise === null ? 0n : l.unitPricePaise * BigInt(l.quantity)),
        0n,
      ),
      quantity: cartLines.reduce((acc, l) => acc + l.quantity, 0),
      lines: ordered.map(({ cartId: _c, createdAt: _a, updatedAt: _u, ...rest }) => rest),
    });
  }
  return leads.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

// ---------------------------------------------------------------------------
// Payment leads
// ---------------------------------------------------------------------------

export interface UnpaidOrderFact {
  id: string;
  placedAt: Date;
  customerId: string | null;
  customerPhone: string | null;
}

export interface LaterOrderFact {
  placedAt: Date;
  customerId: string | null;
  customerPhone: string | null;
}

/** Same shopper: same account, or the same phone (guest checkouts have no account). */
function sameShopper(a: { customerId: string | null; customerPhone: string | null }, b: typeof a): boolean {
  if (a.customerId && b.customerId && a.customerId === b.customerId) return true;
  const pa = a.customerPhone?.replace(/\D/g, "").slice(-10);
  const pb = b.customerPhone?.replace(/\D/g, "").slice(-10);
  return Boolean(pa && pb && pa === pb);
}

/**
 * Which unpaid checkouts are still leads, newest first:
 *  - not when the same shopper placed a real (seller-visible) order in this
 *    store AFTER it — they came back and bought;
 *  - one per shopper — retries of the same checkout show as the latest only.
 */
export function pickPaymentLeads<T extends UnpaidOrderFact>(unpaid: T[], later: LaterOrderFact[]): T[] {
  const newestFirst = [...unpaid].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  const kept: T[] = [];
  for (const order of newestFirst) {
    const boughtSince = later.some((o) => o.placedAt > order.placedAt && sameShopper(o, order));
    if (boughtSince) continue;
    if (kept.some((k) => sameShopper(k, order))) continue;
    kept.push(order);
  }
  return kept;
}

/** Where an unpaid checkout stands, in the seller's words. */
export function paymentLeadState(order: { status: string; paymentStatus: string }): "PAYING" | "FAILED" | "EXPIRED" {
  if (order.status === "CANCELLED") return "EXPIRED";
  return order.paymentStatus === "FAILED" ? "FAILED" : "PAYING";
}
