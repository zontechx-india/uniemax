import { Chip } from './primitives'
import type { ChipTone } from './primitives'
import type {
  BankVerificationStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../features/adminApi'

/**
 * One label + tone per domain state, defined once.
 *
 * Every status in the console renders through here, so "Shipped" is the same
 * word and the same color on the dashboard, the orders table and an order
 * page. Tones follow the reserved status meanings — green = settled, amber =
 * waiting on someone, red = failed/cancelled — and each chip always shows its
 * label, so the color is a second signal rather than the only one.
 */

interface Meta {
  label: string
  tone: ChipTone
}

const ORDER_STATUS: Record<OrderStatus, Meta> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PACKED: { label: 'Packed', tone: 'info' },
  SHIPPED: { label: 'Shipped', tone: 'brand' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

const PAYMENT_STATUS: Record<PaymentStatus, Meta> = {
  PENDING: { label: 'Payment pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
}

const BANK_STATUS: Record<BankVerificationStatus, Meta> = {
  PENDING: { label: 'Pending verification', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  FAILED: { label: 'Verification failed', tone: 'danger' },
}

export const orderStatusLabel = (status: OrderStatus) => ORDER_STATUS[status].label

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS[status]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

export function PaymentChip({
  status,
  method,
}: {
  status: PaymentStatus
  method: PaymentMethod
}) {
  // A pending COD order isn't "waiting for a payment" — the money arrives at
  // the door — so it reads as the plan it is, not as a problem.
  if (status === 'PENDING' && method === 'COD') return <Chip>Pay on delivery</Chip>
  const meta = PAYMENT_STATUS[status]
  return (
    <Chip tone={meta.tone}>
      {meta.label}
      {status === 'PAID' ? ` · ${method === 'COD' ? 'Cash' : 'Online'}` : ''}
    </Chip>
  )
}

export function BankStatusChip({ status }: { status: BankVerificationStatus }) {
  const meta = BANK_STATUS[status]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

/** Published / Draft / Suspended — suspension outranks the publish flag. */
export function StoreStatusChip({
  isPublished,
  suspendedAt,
}: {
  isPublished: boolean
  suspendedAt: string | null
}) {
  if (suspendedAt) return <Chip tone="danger">Suspended</Chip>
  return isPublished ? <Chip tone="success">Published</Chip> : <Chip>Draft</Chip>
}

export function ActiveChip({ isActive }: { isActive: boolean }) {
  return isActive ? <Chip tone="success">Visible</Chip> : <Chip tone="danger">Hidden</Chip>
}

// ---- Support tickets ------------------------------------------------------

const TICKET_STATUS: Record<TicketStatus, Meta> = {
  OPEN: { label: 'Open', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
}

/**
 * Priority is triage, so only the levels that mean "move this up the queue"
 * carry a color — LOW and NORMAL render plain. Painting every level would
 * make the two that matter stop standing out, which is the whole job.
 */
const TICKET_PRIORITY: Record<TicketPriority, Meta> = {
  LOW: { label: 'Low', tone: 'neutral' },
  NORMAL: { label: 'Normal', tone: 'neutral' },
  HIGH: { label: 'High', tone: 'warning' },
  URGENT: { label: 'Urgent', tone: 'danger' },
}

/**
 * The same words the reporter saw when they picked the category — one wording
 * per enum value, so the console and the storefront never describe the same
 * ticket differently. (Which categories are *offered* does differ by
 * audience; that lives in the storefront's `supportApi`.)
 */
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  ORDERS: 'Orders & delivery',
  PAYMENTS: 'Payments & refunds',
  PAYOUTS: 'Payouts & bank account',
  PRODUCTS: 'Products & listings',
  STORE_SETUP: 'Store setup',
  STORE_REPORT: 'Report a store or seller',
  ACCOUNT: 'Account & sign-in',
  TECHNICAL: 'Something is broken',
  OTHER: 'Something else',
}

/**
 * Seller or shopper — the first thing that decides how a ticket is handled,
 * so it is a chip rather than a line of prose. A ticket naming a store came
 * from that store's Help & Support; one without came from the account menu.
 */
export function TicketScopeChip({ storeId }: { storeId: string | null }) {
  return storeId ? <Chip tone="brand">Seller</Chip> : <Chip tone="info">Shopper</Chip>
}

export const ticketStatusLabel = (status: TicketStatus) => TICKET_STATUS[status].label

export function TicketStatusChip({ status }: { status: TicketStatus }) {
  const meta = TICKET_STATUS[status]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

export function TicketPriorityChip({ priority }: { priority: TicketPriority }) {
  const meta = TICKET_PRIORITY[priority]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}
