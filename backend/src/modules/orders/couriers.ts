/**
 * The courier picker's list — one source for the seller's "Mark as sent"
 * sheet (served at GET /api/v1/public/couriers) and for what customers see
 * on a parcel.
 *
 * `site` is the courier's own website, offered to the customer as "Open
 * {courier}" when the seller pasted no tracking link. Each was checked on
 * 20 Oct 2026. There are deliberately NO per-number tracking links: none of
 * these couriers' direct tracking URLs could be confirmed on their own sites
 * (they are JavaScript pages or sit behind an OTP / captcha), and a guessed
 * link that opens the wrong page is worse than none. A parcel links straight
 * to its tracking only when the seller pastes the link their courier gave
 * them. Ekart has no `site` (its domain no longer shows a public tracking
 * page); Ecom Express is left out (merged into Delhivery, and its site's
 * certificate had expired) — a seller can still type it under "Other".
 */

export const COURIER_CODES = [
  "delhivery",
  "bluedart",
  "dtdc",
  "ekart",
  "xpressbees",
  "shadowfax",
  "indiapost",
  "tpc",
  "shiprocket",
  "self",
  "other",
] as const;

export type CourierCode = (typeof COURIER_CODES)[number];

export interface Courier {
  code: CourierCode;
  /** Name shown to sellers and customers. Empty for "other" (typed per parcel). */
  name: string;
  /** The courier's own website — null when none could be confirmed. */
  site: string | null;
  /** False for own delivery: there is no courier tracking number to give. */
  tracking: boolean;
}

export const COURIERS: readonly Courier[] = [
  { code: "delhivery", name: "Delhivery", site: "https://www.delhivery.com/", tracking: true },
  { code: "bluedart", name: "Blue Dart", site: "https://www.bluedart.com/", tracking: true },
  { code: "dtdc", name: "DTDC", site: "https://www.dtdc.com/", tracking: true },
  { code: "ekart", name: "Ekart", site: null, tracking: true },
  { code: "xpressbees", name: "XpressBees", site: "https://www.xpressbees.com/", tracking: true },
  { code: "shadowfax", name: "Shadowfax", site: "https://www.shadowfax.in/", tracking: true },
  { code: "indiapost", name: "India Post", site: "https://www.indiapost.gov.in/", tracking: true },
  { code: "tpc", name: "The Professional Couriers", site: "https://www.tpcindia.com/", tracking: true },
  { code: "shiprocket", name: "Shiprocket", site: "https://www.shiprocket.in/shipment-tracking", tracking: true },
  { code: "self", name: "Own delivery", site: null, tracking: false },
  { code: "other", name: "", site: null, tracking: true },
];

const BY_CODE = new Map<string, Courier>(COURIERS.map((c) => [c.code, c]));

/** The list entry for a stored code — null for a typed ("other") courier. */
export function findCourier(code: string | null): Courier | null {
  if (!code || code === "other") return null;
  return BY_CODE.get(code) ?? null;
}

/** True only for an absolute http(s) URL — never `javascript:`/`data:`. */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Escape text for an HTML email body or attribute (seller input is free text). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
