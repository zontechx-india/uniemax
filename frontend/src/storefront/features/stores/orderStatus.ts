import type { PlacedOrder } from './storesApi'

/**
 * Buyer-facing order status copy — ONE place for the plain words a customer
 * sees on /orders and on the order page (/order/{slug}/{id}). Written for
 * first-time online shoppers: say what happened and what happens next, never
 * the internal enum ("PENDING", "PACKED").
 */

type Status = PlacedOrder['status']

export interface StatusCopy {
  /** Short chip label ("On the way"). */
  label: string
  /** Page headline when the buyer comes back to the order. */
  headline: string
  /** One sentence: what this means / what happens next. */
  next: string
  tone: 'wait' | 'progress' | 'done' | 'stopped'
}

export function orderStatusCopy(order: Pick<PlacedOrder, 'status' | 'fulfilment' | 'storeName'>): StatusCopy {
  const pickup = order.fulfilment === 'PICKUP'
  const store = order.storeName
  switch (order.status as Status) {
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        headline: 'The seller has confirmed your order',
        next: `${store} is getting your order ready.`,
        tone: 'progress',
      }
    case 'PACKED':
      return pickup
        ? {
            label: 'Ready to collect',
            headline: 'Your order is packed',
            next: `You can collect it from ${store}.`,
            tone: 'progress',
          }
        : {
            label: 'Packed',
            headline: 'Your order is packed',
            next: `${store} will send it out soon.`,
            tone: 'progress',
          }
    case 'SHIPPED':
      return {
        label: 'On the way',
        headline: 'Your order is on the way',
        next: 'It has left the seller and is coming to you.',
        tone: 'progress',
      }
    case 'DELIVERED':
      return {
        label: pickup ? 'Collected' : 'Delivered',
        headline: pickup ? 'You collected this order' : 'Your order was delivered',
        next: 'Thank you for shopping with us.',
        tone: 'done',
      }
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        headline: 'This order was cancelled',
        next: 'Nothing will be delivered for this order.',
        tone: 'stopped',
      }
    case 'PENDING':
    default:
      return {
        label: 'Waiting for seller',
        headline: 'Waiting for the seller to confirm',
        next: `${store} has your order and will confirm it soon.`,
        tone: 'wait',
      }
  }
}

export interface ProgressStep {
  key: string
  label: string
  /** ISO time the step was reached, null if not (yet). */
  at: string | null
  done: boolean
  current: boolean
}

/**
 * The order's journey as buyer-facing steps. Shipping is skipped for pickup
 * orders. A step counts as done when its stamp is set OR a later stage was
 * reached (a seller may jump straight from Confirmed to Shipped).
 */
export function orderProgress(order: PlacedOrder): ProgressStep[] {
  const pickup = order.fulfilment === 'PICKUP'
  const steps = [
    { key: 'PENDING', label: 'Order placed', at: order.placedAt },
    { key: 'CONFIRMED', label: 'Seller confirmed', at: order.confirmedAt },
    { key: 'PACKED', label: pickup ? 'Packed — ready to collect' : 'Packed', at: order.packedAt },
    ...(pickup ? [] : [{ key: 'SHIPPED', label: 'On the way', at: order.shippedAt }]),
    { key: 'DELIVERED', label: pickup ? 'Collected' : 'Delivered', at: order.deliveredAt },
  ]
  const reached = Math.max(
    steps.findIndex((s) => s.key === order.status),
    ...steps.map((s, i) => (s.at ? i : 0)),
  )
  return steps.map((s, i) => ({
    ...s,
    done: i <= reached,
    current: order.status !== 'CANCELLED' && i === reached,
  }))
}

export function formatStepTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Digits only, for tel: / wa.me links. Indian 10-digit numbers get 91. */
export function phoneDigits(raw: string | null | undefined, forWhatsApp = false): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  if (forWhatsApp && digits.length === 10) return `91${digits}`
  if (forWhatsApp && digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}
