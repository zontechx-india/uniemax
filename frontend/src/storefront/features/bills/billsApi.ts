import { call, callList, http, toApiError } from '../../../shared/auth/http'
import type { ListMeta } from '../../../shared/auth/http'
import type { PaymentSession } from '../stores/storesApi'

/**
 * Seller bills (docs/API.md → Seller bills). A bill is an order the SELLER
 * fills in from the store's own products; the customer pays it from a link.
 *
 *   seller   /api/v1/stores/:id/bills/**     list, make, share, cancel, item picker
 *   customer /api/v1/public/bills/:token     see it; pay (signed in)
 */

export type BillState = 'OPEN' | 'PAID' | 'CANCELLED' | 'EXPIRED'
/** Where an OPEN bill is: not shared yet, shared, opened by the customer. */
export type BillStage = 'NEW' | 'SHARED' | 'OPENED'
export type ShareVia = 'WHATSAPP' | 'COPY' | 'SHARE'
/** LINK = the customer pays online from the link; OFFLINE = the seller was already paid. */
export type BillPayWay = 'LINK' | 'OFFLINE'
export type OfflineMode = 'CASH' | 'UPI' | 'BANK' | 'OTHER'
export const OFFLINE_MODE: Record<OfflineMode, string> = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank transfer', OTHER: 'Other' }

export interface BillLine {
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  sku: string | null
  productSlug: string
  imageUrl: string | null
  unitPrice: string
  quantity: number
  lineTotal: string
}

export interface Bill {
  id: string
  /** 8 digits; the paid order usually gets the same number. */
  number: string
  /** The link the seller shares (uniemax.com/b/…). */
  link: string
  state: BillState
  stage: BillStage
  store: { id: string; name: string; slug: string }
  customerName: string | null
  customerPhone: string
  fulfilment: 'DELIVERY' | 'PICKUP'
  payWay: BillPayWay
  offlineMode: OfflineMode | null
  offlineRef: string | null
  /** OFFLINE: the customer took it in the shop. */
  handedOver: boolean
  /** OFFLINE + delivery: the address the seller typed. */
  address: { address: string; pincode: string; state: string } | null
  items: BillLine[]
  itemCount: number
  subtotal: string
  shippingCharge: string
  discountType: 'AMOUNT' | 'PERCENT' | null
  discountValue: string | null
  discount: string
  total: string
  note: string | null
  expiresAt: string
  sharedAt: string | null
  shares: { at: string; via: ShareVia }[]
  openedAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
  order: {
    id: string
    orderNumber: string
    status: string
    paymentRef: string | null
    /** Someone other than the bill's customer paid the link. */
    paidByName: string | null
    paidByPhone: string | null
  } | null
}

export type BillTab = 'ALL' | 'WAITING' | 'PAID' | 'CLOSED'

export interface BillListSummary {
  waiting: number
  waitingTotal: string
  notShared: number
  tabs: Record<BillTab, number>
}

export interface BillCreateInput {
  customerPhone: string
  customerName?: string
  items: { productId: string; variantId: string | null; quantity: number }[]
  /** Null = the store's usual delivery rate. */
  shippingCharge: number | null
  discountType: 'AMOUNT' | 'PERCENT'
  discountValue: number
  note?: string
  expiryDays: 1 | 3 | 7
  payWay: BillPayWay
  /** OFFLINE only. */
  offlineMode?: OfflineMode
  offlineRef?: string
  handover?: 'DELIVER' | 'TAKEN'
  address?: string
  pincode?: string
  state?: string
}

/** A product as the item picker sees it: options + every active variant. */
export interface PickerProduct {
  id: string
  name: string
  /** "Sarees › Soft silk" */
  category: string
  imageUrl: string | null
  /** The real product options, in order: [{ name: 'Colour', values }, { name: 'Size', values }]. */
  optionTypes: { name: string; values: string[] }[]
  priceMin: string | null
  stock: number
  variants: PickerVariant[]
}
export interface PickerVariant {
  /** Null for a product without options (its default variant). */
  id: string | null
  /** "M / Red" — null for the default variant. */
  name: string | null
  optionValues: Record<string, string> | null
  price: string
  stock: number
  sku: string | null
  imageUrl: string | null
}
export interface PickerCategory {
  id: string
  name: string
  parentId: string | null
  count: number
}

export interface PublicBill {
  number: string
  state: BillState
  store: { name: string; slug: string }
  customerName: string | null
  /** Masked: "+91 98400 •••23". */
  customerPhone: string
  fulfilment: 'DELIVERY' | 'PICKUP'
  payWay: BillPayWay
  offlineMode: OfflineMode | null
  items: Omit<BillLine, 'productId' | 'productSlug'>[]
  subtotal: string
  shippingCharge: string
  discount: string
  total: string
  note: string | null
  expiresAt: string
  createdAt: string
  paidAt: string | null
  /** The paid order — only for the account that paid it. */
  order: { id: string; orderNumber: string } | null
}

export interface BillPayInput {
  name: string
  phone: string
  address?: string
  pincode?: string
  state?: string
}

export interface BillPayResult {
  orderId: string
  orderNumber: string
  storeSlug: string
  /** Dev without gateway keys pays at once. */
  paid: boolean
  payment: PaymentSession | null
}

const SELLER = '/api/v1/stores'
const PUBLIC = '/api/v1/public/bills'

export const billsApi = {
  async list(
    storeRef: string,
    query: { tab?: BillTab; page?: number; pageSize?: number } = {},
  ): Promise<{ items: Bill[]; meta: ListMeta; summary: BillListSummary }> {
    try {
      const res = await http.get(`${SELLER}/${storeRef}/bills`, { params: query })
      return { items: res.data.data as Bill[], meta: res.data.meta as ListMeta, summary: res.data.summary as BillListSummary }
    } catch (err) {
      // Same error shape as every other call.
      throw toApiError(err)
    }
  },
  get: (storeRef: string, billId: string) => call<Bill>(http.get(`${SELLER}/${storeRef}/bills/${billId}`)),
  create: (storeRef: string, input: BillCreateInput) => call<Bill>(http.post(`${SELLER}/${storeRef}/bills`, input)),
  share: (storeRef: string, billId: string, via: ShareVia) =>
    call<Bill>(http.post(`${SELLER}/${storeRef}/bills/${billId}/share`, { via })),
  cancel: (storeRef: string, billId: string) => call<Bill>(http.post(`${SELLER}/${storeRef}/bills/${billId}/cancel`, {})),

  /** The item picker: words over name / size / colour / SKU / category, 30 a page. */
  catalog: (storeRef: string, query: { q?: string; categoryId?: string; page?: number; pageSize?: number }) =>
    callList<PickerProduct>(http.get(`${SELLER}/${storeRef}/bills/catalog`, { params: query })),
  categories: (storeRef: string) => call<PickerCategory[]>(http.get(`${SELLER}/${storeRef}/bills/catalog/categories`)),
  often: (storeRef: string) =>
    call<{ product: PickerProduct; variant: PickerVariant }[]>(http.get(`${SELLER}/${storeRef}/bills/catalog/often`)),
}

export const publicBillApi = {
  get: (token: string) => call<PublicBill>(http.get(`${PUBLIC}/${token}`)),
  pay: (token: string, input: BillPayInput) => call<BillPayResult>(http.post(`${PUBLIC}/${token}/pay`, input)),
}

/** "4820 3917" — read out in two halves on a call. */
export const spacedNumber = (n: string) => (/^\d{8}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4)}` : n)

/** The text the seller sends from their own WhatsApp. */
export function billMessage(
  bill: Pick<Bill, 'customerName' | 'itemCount' | 'total' | 'link' | 'expiresAt' | 'store' | 'number'> & { payWay?: BillPayWay },
  rupees: (v: string) => string,
) {
  const hi = bill.customerName ? `Hi ${bill.customerName.split(' ')[0]}` : 'Hi'
  const until = new Date(bill.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const items = `${bill.itemCount} item${bill.itemCount === 1 ? '' : 's'}`
  // Already paid: a receipt, no "pay here".
  if (bill.payWay === 'OFFLINE') {
    return `${hi}, thank you for shopping at ${bill.store.name}. Your bill ${spacedNumber(bill.number)}: ${items}, ${rupees(bill.total)}, paid. See it here: ${bill.link}`
  }
  return `${hi}, here is your bill from ${bill.store.name}: ${items}, ${rupees(bill.total)}. See it and pay here: ${bill.link} (open till ${until})`
}

/** wa.me opens the seller's own WhatsApp on a chat with the customer, text filled in. */
export const whatsappUrl = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '').replace(/^(?!91)(\d{10})$/, '91$1')}?text=${encodeURIComponent(text)}`
