import type { ReactNode } from 'react'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Badge } from '../../../../shared/ui/Badge'
import type { BadgeTone } from '../../../../shared/ui/Badge'
import { OFFLINE_MODE } from '../../../features/bills/billsApi'
import { StatusPill } from '../ui/StatusPill'
import type { StatusTone } from '../ui/StatusPill'
import { formatPrice } from '../../../features/stores/storesApi'
import type { Bill, BillPayWay, BillStage, BillState, OfflineMode, PickerProduct, PickerVariant } from '../../../features/bills/billsApi'

/**
 * Shared pieces of the seller's Bills screens (/mystores/{slug}/bills/**).
 * Look: the `ws-form` scale (controls 8, cards 10, sheets 12 — ADMIN_UI_THEME),
 * chosen cells solid ink like SegmentedControl, one primary action a screen.
 */

export const BILL_STATE: Record<BillState, { label: string; tone: StatusTone }> = {
  OPEN: { label: 'Waiting for payment', tone: 'pending' },
  PAID: { label: 'Paid', tone: 'success' },
  EXPIRED: { label: 'Link expired', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}
export const BILL_STAGE: Record<BillStage, string> = {
  NEW: 'Not shared yet',
  SHARED: 'Shared · not opened',
  OPENED: 'Opened · not paid',
}

export const rupees = (v: string | number) => formatPrice(v)

export function BillStatePill({ state }: { state: BillState }) {
  return <StatusPill tone={BILL_STATE[state].tone}>{BILL_STATE[state].label}</StatusPill>
}

/**
 * ONE badge that says where a bill is — state and stage together, so a row
 * never carries two pills: "Not sent yet", "Opened · not paid", "Paid · UPI".
 */
export function billStatus(bill: Pick<Bill, 'state' | 'stage' | 'payWay' | 'offlineMode'>): { label: string; tone: BadgeTone } {
  if (bill.state === 'PAID') {
    return { label: bill.payWay === 'OFFLINE' ? `Paid${bill.offlineMode ? ` · ${OFFLINE_MODE[bill.offlineMode]}` : ''}` : 'Paid online', tone: 'success' }
  }
  if (bill.state === 'EXPIRED') return { label: 'Expired', tone: 'neutral' }
  if (bill.state === 'CANCELLED') return { label: 'Cancelled', tone: 'neutral' }
  if (bill.stage === 'OPENED') return { label: 'Opened · not paid', tone: 'info' }
  if (bill.stage === 'SHARED') return { label: 'Sent · not opened', tone: 'pending' }
  return { label: 'Not sent yet', tone: 'pending' }
}
export function BillStatus({ bill }: { bill: Pick<Bill, 'state' | 'stage' | 'payWay' | 'offlineMode'> }) {
  const s = billStatus(bill)
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

/** "+91 98400 11223" — a number read out on a call. */
export function spacedPhone(phone: string) {
  const d = phone.replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone
}

/** A quiet grey tag (stage, "From a bill"). */
export function QuietTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md bg-fg/6 px-2 text-xs font-medium whitespace-nowrap text-muted">
      {children}
    </span>
  )
}

/** "Size M" for one option, "Red / M" for several. */
export function variantLabel(product: Pick<PickerProduct, 'optionTypes'>, variant: Pick<PickerVariant, 'name' | 'optionValues'>): string {
  if (!variant.name) return ''
  const values = variant.optionValues ? Object.values(variant.optionValues) : []
  if (product.optionTypes.length === 1 && values.length === 1) return `${product.optionTypes[0]!.name} ${values[0]}`
  return variant.name
}

/** One line of the draft bill (enough to show it even when the picker has moved on). */
export interface DraftLine {
  key: string
  productId: string
  variantId: string | null
  name: string
  variantLabel: string
  price: string
  stock: number
  imageUrl: string | null
  qty: number
}

export const lineKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ''}`

export interface BillDraft {
  phone: string
  name: string
  lines: DraftLine[]
  shipping: string
  discountType: 'AMOUNT' | 'PERCENT'
  discount: string
  note: string
  expiryDays: 1 | 3 | 7
  /** LINK = they pay from the link; OFFLINE = already paid to the seller. */
  payWay: BillPayWay
  offlineMode: OfflineMode | ''
  offlineRef: string
  /** OFFLINE: DELIVER (seller types the address) or TAKEN (in the shop, now). */
  handover: 'DELIVER' | 'TAKEN'
  address: string
  pincode: string
  state: string
}

export const emptyDraft = (): BillDraft => ({
  phone: '',
  name: '',
  lines: [],
  shipping: '',
  discountType: 'AMOUNT',
  discount: '',
  note: '',
  expiryDays: 3,
  payWay: 'LINK',
  offlineMode: '',
  offlineRef: '',
  handover: 'DELIVER',
  address: '',
  pincode: '',
  state: '',
})

/** The draft survives a reload or a quick trip elsewhere (this tab only). */
const draftKey = (storeId: string) => `um.billDraft.${storeId}`
export function loadDraft(storeId: string): BillDraft {
  try {
    const raw = sessionStorage.getItem(draftKey(storeId))
    return raw ? { ...emptyDraft(), ...(JSON.parse(raw) as Partial<BillDraft>) } : emptyDraft()
  } catch {
    return emptyDraft()
  }
}
export function saveDraft(storeId: string, draft: BillDraft | null) {
  try {
    if (draft) sessionStorage.setItem(draftKey(storeId), JSON.stringify(draft))
    else sessionStorage.removeItem(draftKey(storeId))
  } catch {
    /* private mode — the draft just does not survive a reload */
  }
}

/** A new draft from an old bill (same customer, items and charges). */
export function draftFromBill(bill: Bill): BillDraft {
  return {
    ...emptyDraft(),
    phone: bill.customerPhone.replace(/^\+91/, ''),
    name: bill.customerName ?? '',
    lines: bill.items.map((i) => ({
      key: lineKey(i.productId, i.variantId),
      productId: i.productId,
      variantId: i.variantId,
      name: i.productName,
      variantLabel: i.variantName ?? '',
      price: i.unitPrice,
      // Checked again when the bill is made.
      stock: 999,
      imageUrl: i.imageUrl,
      qty: i.quantity,
    })),
    discountType: bill.discountType ?? 'AMOUNT',
    discount: bill.discountValue && Number(bill.discountValue) > 0 ? String(Number(bill.discountValue)) : '',
    note: bill.note ?? '',
    // Same way of paying and address; a new payment is never copied (mode, reference).
    payWay: bill.payWay,
    handover: bill.handedOver ? 'TAKEN' : 'DELIVER',
    address: bill.address?.address ?? '',
    pincode: bill.address?.pincode ?? '',
    state: bill.address?.state ?? '',
  }
}

/** A product photo (the server's sized copy) or a quiet placeholder tile. */
export function Thumb({ src, size = 'h-11 w-11', px = '44px', dim = false }: { src: string | null; size?: string; px?: string; dim?: boolean }) {
  return src ? (
    <MediaImg src={src} sizes={px} alt="" loading="lazy" className={`${size} shrink-0 rounded-md border border-line object-cover ${dim ? 'opacity-40' : ''}`} />
  ) : (
    <span aria-hidden="true" className={`${size} shrink-0 rounded-md border border-line bg-surface-alt ${dim ? 'opacity-40' : ''}`} />
  )
}
