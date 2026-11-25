/**
 * The delivery address as one value — what an `OrderAddressChange` stores
 * before and after a correction (see orderAddress.service.ts). `answers` are
 * the store's DELIVERY questions (Post Office, Tehsil…) with the label they
 * were asked under.
 */
export interface OrderAddressSnapshot {
  addressLine: string | null;
  pincode: string | null;
  state: string | null;
  country: string | null;
  answers: { id: string; label: string; value: string }[];
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The stored JSON as a clean snapshot — anything malformed is dropped. */
export function readAddressSnapshot(raw: unknown): OrderAddressSnapshot {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const answers = Array.isArray(obj.answers)
    ? obj.answers.flatMap((a): OrderAddressSnapshot["answers"] => {
        if (!a || typeof a !== "object") return [];
        const { id, label, value } = a as Record<string, unknown>;
        return typeof id === "string" && typeof label === "string" && typeof value === "string"
          ? [{ id, label, value }]
          : [];
      })
    : [];
  return {
    addressLine: text(obj.addressLine),
    pincode: text(obj.pincode),
    state: text(obj.state),
    country: text(obj.country),
    answers,
  };
}

/** One correction as the seller sees it on the order. */
export function shapeAddressChange(row: {
  id: string;
  before: unknown;
  after: unknown;
  changedBy: "SELLER" | "SUPPORT";
  createdAt: Date;
}) {
  return {
    id: row.id,
    changedBy: row.changedBy,
    changedAt: row.createdAt,
    before: readAddressSnapshot(row.before),
    after: readAddressSnapshot(row.after),
  };
}

/** "Line, State, 191131, India" — the one-line form messages use. */
export function addressText(a: OrderAddressSnapshot): string {
  return [a.addressLine, a.state, a.pincode, a.country].filter(Boolean).join(", ");
}
