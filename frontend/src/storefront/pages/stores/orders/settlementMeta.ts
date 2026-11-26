import type { SellerTransaction, SettlementStatus } from '../../../features/stores/storesApi'
import type { StatusTone } from '../ui/StatusPill'

/**
 * Words for one order's money (docs/seller-finance/ §8) — shared by the
 * Transactions page and the order page's Money card so both say the same.
 */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
export const money = (value: string | number) => inr.format(Number(value))

export const moneyDay = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })

/** How the customer paid. Old orders may name the method; new ones say Online. */
export function paymentModeLabel(method: string): string {
  const labels: Record<string, string> = {
    COD: 'Cash on delivery',
    ONLINE: 'Online',
    UPI: 'UPI',
    CARD: 'Card',
    NETBANKING: 'Net banking',
  }
  return labels[method] ?? 'Online'
}

/** The pill for a row — pickup orders wait to be collected, not delivered. */
export function settlementPill(row: SellerTransaction): { label: string; tone: StatusTone } {
  const pill = SETTLEMENT[row.settlement.status]
  if (row.fulfilment === 'PICKUP' && row.settlement.status === 'AWAITING_DELIVERY') {
    return { ...pill, label: 'Waiting for pickup' }
  }
  return pill
}

const SETTLEMENT: Record<SettlementStatus, { label: string; tone: StatusTone }> = {
  AWAITING_DELIVERY: { label: 'Waiting for delivery', tone: 'pending' },
  ADVANCE_PAID: { label: 'Advance paid', tone: 'pending' },
  READY_TO_PAY: { label: 'Ready to pay', tone: 'brand' },
  ON_ITS_WAY: { label: 'On its way', tone: 'pending' },
  PARTLY_SETTLED: { label: 'Partly paid', tone: 'pending' },
  SETTLED: { label: 'Settled', tone: 'success' },
  CASH_TO_COLLECT: { label: 'Cash to collect', tone: 'neutral' },
  CASH_COLLECTED: { label: 'Cash collected', tone: 'success' },
  REFUND_PENDING: { label: 'Refund in progress', tone: 'pending' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

/** The fee the seller pays on this order (gateway only when they bear it). */
export function sellerFee(row: SellerTransaction): number {
  return Number(row.platformFee) + (row.gatewayFeeBearer === 'SELLER' ? Number(row.gatewayFee) : 0)
}

/** No money changes hands for the seller (cancelled / refunded) — hide fee lines. */
export function moneyCounts(row: SellerTransaction): boolean {
  return row.settlement.status !== 'CANCELLED' && row.settlement.status !== 'REFUNDED' && row.settlement.status !== 'REFUND_PENDING'
}

export const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** The payment mode in a narrow phone row — "Cash" (the filter's word) for COD. */
export function paymentModeShort(method: string): string {
  return method === 'COD' ? 'Cash' : paymentModeLabel(method)
}

/**
 * A few words under the status in a dense list or table row ("₹881.02 to
 * come", "Paid 18 Nov · UTR …"). The full sentence is on the order's Money
 * card. Empty when the pill already says it all.
 */
export function settlementShort(row: SellerTransaction): string {
  const s = row.settlement
  const pickup = row.fulfilment === 'PICKUP'
  const parts: string[] = []
  switch (s.status) {
    case 'AWAITING_DELIVERY':
      parts.push(pickup ? 'Yours after pickup' : 'Yours after delivery')
      break
    case 'ADVANCE_PAID':
      parts.push(`${money(s.advance)} paid early`)
      if (Number(s.remaining) > 0) parts.push(`${money(s.remaining)} ${pickup ? 'after pickup' : 'after delivery'}`)
      break
    case 'READY_TO_PAY':
      parts.push(s.lastPayoutFailed ? 'Last payment failed, sending again' : `${money(s.remaining)} to come`)
      break
    case 'ON_ITS_WAY':
      parts.push(`${money(s.onItsWay)} on its way`)
      break
    case 'PARTLY_SETTLED':
      parts.push(`${money(s.paidOut)} paid, ${money(s.remaining)} to come`)
      break
    case 'SETTLED':
      if (s.paidAt) parts.push(`Paid ${shortDay(s.paidAt)}`)
      if (s.utr) parts.push(`UTR ${s.utr}`)
      break
    case 'CASH_TO_COLLECT':
      parts.push(pickup ? 'Collect at pickup' : 'Collect on delivery')
      break
    case 'CASH_COLLECTED':
      if (sellerFee(row) > 0) parts.push(`Fee ${money(sellerFee(row))} from next payout`)
      break
    default:
      break
  }
  if (Number(row.refundedAmount) > 0 && s.status !== 'REFUNDED' && s.status !== 'REFUND_PENDING') {
    parts.push(`${money(row.refundedAmount)} refunded`)
  }
  return parts.join(' · ')
}

/** One plain sentence under the status — what it means for this order. */
export function settlementNote(row: SellerTransaction): string {
  const note = baseNote(row)
  // A part refund (made from the payment dashboard) leaves the order paid —
  // say how much went back so the bill and "You get" make sense.
  const partRefund =
    Number(row.refundedAmount) > 0 &&
    row.settlement.status !== 'REFUNDED' &&
    row.settlement.status !== 'REFUND_PENDING'
  return partRefund ? `${note} ${money(row.refundedAmount)} was refunded to the customer.` : note
}

function baseNote(row: SellerTransaction): string {
  const s = row.settlement
  const pickup = row.fulfilment === 'PICKUP'
  switch (s.status) {
    case 'AWAITING_DELIVERY':
      return pickup
        ? `The customer paid online. You get ${money(row.youGet)} after they collect the order.`
        : `The customer paid online. You get ${money(row.youGet)} after the order is delivered.`
    case 'ADVANCE_PAID': {
      const after = pickup ? 'after the customer collects it' : 'after delivery'
      const rest =
        Number(s.remaining) > 0 ? `You get the rest, ${money(s.remaining)}, ${after}.` : 'Nothing more is due on this order.'
      return `UnieMax paid you ${money(s.advance)} before the order reached the customer. ${rest} If the order is cancelled, this advance is taken from your next payouts.`
    }
    case 'READY_TO_PAY':
      return s.lastPayoutFailed
        ? `The last payment did not reach your bank. UnieMax will send ${money(s.remaining)} again.`
        : `UnieMax will send ${money(s.remaining)} to your bank.`
    case 'ON_ITS_WAY':
      return `${money(s.onItsWay)} is on its way to your bank.`
    case 'PARTLY_SETTLED':
      return `${money(s.paidOut)} paid to your bank. ${money(s.remaining)} still to come.`
    case 'SETTLED': {
      const parts = [s.paidAt ? `Paid to your bank on ${moneyDay(s.paidAt, s.paidAtTimeKnown)}` : 'Paid to your bank']
      if (s.utr) parts.push(`UTR ${s.utr}`)
      if (Number(s.duesDeducted) > 0) parts.push(`${money(s.duesDeducted)} kept for your COD dues`)
      return parts.join(' · ')
    }
    case 'CASH_TO_COLLECT':
      return pickup
        ? `Collect ${money(row.billAmount)} in cash when the customer picks up the order.`
        : `Collect ${money(row.billAmount)} in cash when you deliver.`
    case 'CASH_COLLECTED':
      return sellerFee(row) > 0
        ? `You have the cash. The platform fee of ${money(sellerFee(row))} is taken from your next payout.`
        : 'You have the cash.'
    case 'REFUND_PENDING':
      return Number(s.advance) > 0
        ? `The customer's money is being sent back to them. The ${money(s.advance)} UnieMax paid you in advance is taken from your next payouts.`
        : "The customer's money is being sent back to them."
    case 'REFUNDED':
      return Number(s.advance) > 0
        ? `The money went back to the customer. The ${money(s.advance)} UnieMax paid you in advance is taken from your next payouts.`
        : 'The money went back to the customer.'
    case 'CANCELLED':
      return Number(s.advance) > 0
        ? `This order was cancelled. The ${money(s.advance)} UnieMax paid you in advance is taken from your next payouts.`
        : 'This order was cancelled. No money is due.'
  }
}
