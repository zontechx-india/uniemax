import type { DeliveryRate } from './api'

/**
 * The add sheet's live arithmetic — the same rules as the backend's
 * `domain.ts` (which re-checks every price on save), in paise-rounded numbers.
 */

const paise = (n: number) => Math.round(n * 100) / 100

export const capAtMrp = (price: number, mrp: number | null) => (mrp != null && price > mrp ? mrp : price)

export function onTop(cost: number, mode: 'amount' | 'percent', value: number, mrp: number | null) {
  // A percentage lands on a whole rupee, rounded up — the backend's addOnTop.
  const price = mode === 'amount' ? paise(cost + value) : Math.ceil(paise((cost * (100 + value)) / 100))
  return capAtMrp(price, mrp)
}

export function deliveryFor(rate: DeliveryRate, subtotal: number) {
  if (rate.type === 'FREE') return 0
  if (rate.freeAbove != null && subtotal >= rate.freeAbove) return 0
  return rate.amount
}

/** One unit: what the customer pays, the supplier gets, the fee, and what you keep. */
export function resultLine(input: {
  price: number
  cost: number
  rate: DeliveryRate
  supplierShipping: number
  platformFeePct: number
}) {
  const delivery = deliveryFor(input.rate, input.price)
  const customerPays = paise(input.price + delivery)
  const supplierGets = paise(input.cost + input.supplierShipping)
  const fee = paise((customerPays * input.platformFeePct) / 100)
  return { delivery, customerPays, supplierGets, fee, youEarn: paise(customerPays - supplierGets - fee) }
}

/** Amber below the warning threshold, red below zero (C-23) — never blocks. */
export function earnTone(youEarn: number, price: number, warnPct: number): 'ok' | 'low' | 'loss' {
  if (youEarn < 0) return 'loss'
  return price > 0 && (youEarn / price) * 100 < warnPct ? 'low' : 'ok'
}

export const priceOk = (price: number, cost: number, mrp: number | null) =>
  Number.isFinite(price) && price >= cost && (mrp == null || price <= mrp)
