/**
 * Seller-ledger wording, defined once — the admin console and the seller's
 * Earnings page name every entry and balance the same way
 * (docs/seller-finance/README.md).
 */

export type LedgerBucketKey = 'PAYABLE' | 'IN_PAYOUT' | 'OWED'
export type LedgerTypeKey =
  | 'ORDER_SALE'
  | 'PLATFORM_FEE'
  | 'GATEWAY_FEE'
  | 'COD_PLATFORM_FEE'
  | 'DUES_SETTLED'
  | 'DUES_RESTORED'
  | 'PAYOUT_RESERVED'
  | 'PAYOUT_PAID'
  | 'PAYOUT_RELEASED'
  | 'PAYOUT_RETURNED'
  | 'ADJUSTMENT'

/** Balance names, from UnieMax's side (admin) and the seller's side. */
export const BUCKET_LABEL: Record<LedgerBucketKey, { admin: string; seller: string }> = {
  PAYABLE: { admin: 'We owe the seller', seller: 'Ready to be paid to you' },
  IN_PAYOUT: { admin: 'Being paid', seller: 'Being paid to you' },
  OWED: { admin: 'Seller owes UnieMax', seller: 'You owe UnieMax' },
}

export const ENTRY_LABEL: Record<LedgerTypeKey, string> = {
  ORDER_SALE: 'Online order delivered',
  PLATFORM_FEE: 'Platform fee',
  GATEWAY_FEE: 'Payment gateway fee',
  COD_PLATFORM_FEE: 'Platform fee on cash order',
  DUES_SETTLED: 'COD dues taken from payout',
  DUES_RESTORED: 'COD dues put back',
  PAYOUT_RESERVED: 'Payout started',
  PAYOUT_PAID: 'Payout received',
  PAYOUT_RELEASED: 'Payout did not go out',
  PAYOUT_RETURNED: 'Payout came back',
  ADJUSTMENT: 'Correction by UnieMax',
}

/** "+₹10.00" / "−₹10.00" from a signed decimal string. */
export function signed(amount: string, format: (value: string) => string): string {
  const negative = amount.trim().startsWith('-')
  return `${negative ? '−' : '+'}${format(negative ? amount.trim().slice(1) : amount)}`
}
