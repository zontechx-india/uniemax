const num = (key: string, fallback: number) => Number(process.env[key] ?? fallback);

export const affiliateConfig = {
  /** Highest percentage a seller may offer — a platform ceiling. */
  maxPercent: num("AFFILIATE_MAX_PERCENT", 50),
  inviteExpiryDays: num("AFFILIATE_INVITE_DAYS", 14),
  clickRetentionDays: num("AFFILIATE_CLICK_RETENTION_DAYS", 90),
  /** How often matured commissions are approved and old clicks pruned. */
  jobIntervalMs: 60 * 60 * 1000,
};
