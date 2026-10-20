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
};
