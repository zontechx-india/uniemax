const num = (key: string, fallback: number) => Number(process.env[key] ?? fallback);
const flag = (key: string) => process.env[key] === "true";

/**
 * Every dropship knob. Env overrides use the `DROPSHIP_` prefix; the table in
 * docs/dropshipping/architecture/context.md says what each one means.
 */
export const dropshipConfig = {
  /** Registers the package at all (D-15: off in production until Phase 5). */
  enabled: flag("DROPSHIP_ENABLED"),
  inviteExpiryDays: num("DROPSHIP_INVITE_EXPIRY_DAYS", 14),
  /** D-7: invited suppliers start ACTIVE unless this is on. */
  inviteNeedsAdminApproval: flag("DROPSHIP_INVITE_NEEDS_ADMIN_APPROVAL"),
  /** Longest "ship within" a supplier may choose. */
  shipWithinDaysMax: num("DROPSHIP_SHIP_WITHIN_DAYS_MAX", 7),
  /** Longest returns window a supplier may offer. */
  returnDaysMax: num("DROPSHIP_RETURN_DAYS_MAX", 30),
  /** Suggested price when the supplier has no shop price: cost + this %. */
  suggestedMarkupPct: num("DROPSHIP_SUGGESTED_MARKUP_PCT", 30),
  /** Earnings below this % of the price turn amber on the add sheet. */
  minMarginWarnPct: num("DROPSHIP_MIN_MARGIN_WARN_PCT", 10),
  /** Platform fee, % of the order total, from the seller's share (D-20; rate: Q-5). */
  platformFeePct: num("DROPSHIP_PLATFORM_FEE_PCT", 0),
  /** The hourly job: expire unpaid supplier orders, re-sync every copy (C-13). */
  jobIntervalMs: num("DROPSHIP_JOB_INTERVAL_MS", 60 * 60 * 1000),
  /** How long an unpaid online checkout holds the supplier's stock (K-8). */
  unpaidHoldHours: num("DROPSHIP_UNPAID_HOLD_HOURS", 2),
  /** After an order closes, the supplier stops seeing the customer's phone and address (F-12). */
  customerDataDays: num("DROPSHIP_CUSTOMER_DATA_DAYS", 30),
  /** A new order the supplier hasn't opened after this long gets one reminder (F-1). */
  confirmReminderHours: num("DROPSHIP_CONFIRM_REMINDER_HOURS", 24),
  /** Shipped but never marked delivered: after this many days the supplier is nudged once (F-10). */
  deliveredReminderDays: num("DROPSHIP_DELIVERED_REMINDER_DAYS", 7),
  /** Shipped this long ago and never marked delivered → it counts as owed (F-10). */
  owedFallbackDays: num("DROPSHIP_OWED_FALLBACK_DAYS", 15),
  /** Easy Split (Phase 6): new prepaid supplier orders may be paid by split (off by default). */
  splitEnabled: flag("DROPSHIP_SPLIT"),
  /** Who answers the split calls. Only `sandbox` is built; `paymenthub` is reserved (D-44). */
  splitProvider: process.env.DROPSHIP_SPLIT_PROVIDER ?? "sandbox",
  /** The split is requested at least this long after the payment lands (Cashfree needs ~2 minutes). */
  splitDelayMinutes: num("DROPSHIP_SPLIT_DELAY_MINUTES", 2),
  /** Cashfree's Order Split Delay window; a split not done with 2 h left goes on admin's list (PS-3). */
  splitWindowHours: num("DROPSHIP_SPLIT_WINDOW_HOURS", 24),
  /** Cashfree holds a vendor's money this long before paying out (D-21). */
  vendorHoldDays: num("DROPSHIP_VENDOR_HOLD_DAYS", 12),
};
