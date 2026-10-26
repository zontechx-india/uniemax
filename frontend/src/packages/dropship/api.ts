import { call, callList, http } from '../../shared/auth/http'
import { DROPSHIP_ADMIN_API_BASE as ADMIN, DROPSHIP_API_BASE as BASE } from './config'

/**
 * Typed client for the supplier API (docs/dropshipping/suppliers/context.md).
 * Three audiences: the seller with its suppliers, the supplier with its
 * sellers and products, and the invite link in between. `storeId` may be the
 * store's id or slug.
 */

export type ReturnFeePayer = 'SELLER' | 'SUPPLIER'
export type LinkStatus = 'ACTIVE' | 'PAUSED' | 'ENDED'
export type InviteStatus = 'SENT' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
export type SupplierStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
export type Actor = 'SUPPLIER' | 'SELLER' | 'ADMIN' | 'SYSTEM'

export type SplitMode = 'off' | 'sandbox' | 'live'

export interface StoreRole {
  supplier: { status: SupplierStatus; supplyOnly: boolean } | null
  hasSuppliers: boolean
  /** A supplier's new orders waiting to be shipped (0 for a store that isn't one). */
  ordersToShip: number
  /** Easy Split payouts: off, simulated (no money moves), or real. */
  split: SplitMode
  /** Whether THIS store can be paid out to; null while payouts are off. */
  payout: { active: boolean } | null
}

export interface StoreCard {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  phone: string | null
}

export interface SupplierProfile {
  id: string
  storeId: string
  supplyOnly: boolean
  status: SupplierStatus
  shippingFee: number
  shipWithinDays: number
  returnDays: number
}

export interface Invite {
  id: string
  name: string
  phone: string | null
  email: string | null
  codAllowed: boolean
  returnFeePayer: ReturnFeePayer
  status: InviteStatus
  expiresAt: string
  createdAt: string
}

export interface InviteSent {
  invite: Invite
  inviteUrl: string
  shareText: string
  emailed: boolean
}

export interface SellerSupplier {
  linkId: string
  status: LinkStatus
  statusBy: Actor | null
  codAllowed: boolean
  returnFeePayer: ReturnFeePayer
  since: string
  supplierStatus: SupplierStatus
  store: StoreCard | null
  profile: SupplierProfile
}

export interface SupplierSeller {
  linkId: string
  status: LinkStatus
  statusBy: Actor | null
  codAllowed: boolean
  returnFeePayer: ReturnFeePayer
  since: string
  store: StoreCard | null
}

export interface Terms {
  current: {
    codAllowed: boolean
    returnFeePayer: ReturnFeePayer
    shippingFee: number
    shipWithinDays: number
    returnDays: number
  }
  log: {
    id: string
    field: string
    fromValue: string | null
    toValue: string | null
    changedAs: Actor
    createdAt: string
    text: string
  }[]
}

export interface InvitePreview {
  sellerName: string
  sellerLogoUrl: string | null
  name: string
  /** Who it is for, half hidden: "98••••••10" or "ra•••@gmail.com" (D-52). */
  sentTo: string
  codAllowed: boolean
  returnFeePayer: ReturnFeePayer
  status: InviteStatus
  expiresAt: string
  shipWithinDaysMax: number
  returnDaysMax: number
}

export interface JoinStore {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  hasAddress: boolean
  isSeller: boolean
  supplier: {
    status: SupplierStatus
    shippingFee: number
    shipWithinDays: number
    returnDays: number
  } | null
}

export interface JoinStores {
  /** False when the signed-in account isn't the invited phone or email (D-52); `stores` is then empty. */
  forYou: boolean
  stores: JoinStore[]
}

export interface JoinResult {
  linkId: string
  storeId: string
  storeSlug: string | null
  supplyOnly: boolean
  alreadyJoined: boolean
}

export interface SupplyItem {
  productId: string
  name: string
  imageUrl: string | null
  isActive: boolean
  isOpen: boolean
  variants: {
    variantId: string
    name: string
    isDefault: boolean
    isActive: boolean
    price: number
    stock: number
    cost: number | null
    isOpen: boolean
    aboveShopPrice: boolean
  }[]
}

export interface AdminSupplier extends SupplierProfile {
  statusNote: string | null
  createdAt: string
  store: StoreCard | null
  sellers: { status: LinkStatus; store: StoreCard | null }[]
}

export interface ProfileInput {
  shippingFee: number
  shipWithinDays: number
  returnDays: number
}

export interface AddressInput {
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  country: string
  lat: number | null
  lng: number | null
}

const store = (id: string) => `${BASE}/stores/${encodeURIComponent(id)}`

export const dropshipApi = {
  /** 200 when the package is on; a 404 (thrown) when it isn't (D-30). */
  status: () => call<{ enabled: boolean }>(http.get(`${BASE}/status`)),
  role: (storeId: string) => call<StoreRole>(http.get(`${store(storeId)}/role`)),
}

export const sellerSuppliersApi = {
  overview: (storeId: string) =>
    call<{ invites: Invite[]; suppliers: SellerSupplier[] }>(http.get(`${store(storeId)}/suppliers`)),
  invite: (
    storeId: string,
    input: {
      name: string
      phone?: string
      email?: string
      codAllowed: boolean
      returnFeePayer: ReturnFeePayer
      turnOnStoreCod?: boolean
    },
  ) => call<InviteSent>(http.post(`${store(storeId)}/supplier-invites`, input)),
  resend: (storeId: string, id: string) =>
    call<InviteSent>(http.post(`${store(storeId)}/supplier-invites/${id}/resend`)),
  revoke: (storeId: string, id: string) =>
    call(http.post(`${store(storeId)}/supplier-invites/${id}/revoke`)),
  update: (
    storeId: string,
    linkId: string,
    patch: {
      codAllowed?: boolean
      returnFeePayer?: ReturnFeePayer
      status?: LinkStatus
      turnOnStoreCod?: boolean
    },
  ) => call<SellerSupplier>(http.patch(`${store(storeId)}/suppliers/${linkId}`, patch)),
  terms: (storeId: string, linkId: string) =>
    call<Terms>(http.get(`${store(storeId)}/suppliers/${linkId}/terms`)),
}

export const supplierApi = {
  profile: (storeId: string) => call<SupplierProfile>(http.get(`${store(storeId)}/supplier`)),
  updateProfile: (storeId: string, patch: Partial<ProfileInput>) =>
    call<SupplierProfile>(http.patch(`${store(storeId)}/supplier`, patch)),
  sellers: (storeId: string) => call<SupplierSeller[]>(http.get(`${store(storeId)}/sellers`)),
  updateSeller: (storeId: string, linkId: string, status: LinkStatus) =>
    call<SupplierSeller[]>(http.patch(`${store(storeId)}/sellers/${linkId}`, { status })),
  terms: (storeId: string, linkId: string) =>
    call<Terms>(http.get(`${store(storeId)}/sellers/${linkId}/terms`)),
  supply: (storeId: string) => call<SupplyItem[]>(http.get(`${store(storeId)}/supply`)),
  updateSupply: (
    storeId: string,
    productId: string,
    input: { isOpen: boolean; variants: { variantId: string; cost: number | null; isOpen: boolean }[] },
  ) => call<SupplyItem>(http.put(`${store(storeId)}/supply/${productId}`, input)),
  bulk: (storeId: string, productIds: string[], discountPct: number) =>
    call<SupplyItem[]>(http.post(`${store(storeId)}/supply/bulk`, { productIds, discountPct })),
}

export const inviteApi = {
  preview: (token: string) => call<InvitePreview>(http.get(`${BASE}/invites/${token}`)),
  stores: (token: string) => call<JoinStores>(http.get(`${BASE}/invites/${token}/stores`)),
  accept: (
    token: string,
    input: Partial<ProfileInput> & {
      storeId?: string
      newStore?: { name: string; phone: string; address: AddressInput }
    },
  ) => call<JoinResult>(http.post(`${BASE}/invites/${token}/accept`, input)),
}

export const adminSuppliersApi = {
  list: (page: number, status?: SupplierStatus) =>
    callList<AdminSupplier>(http.get(`${ADMIN}/suppliers`, { params: { page, status } })),
  suspend: (id: string, note: string) =>
    call<SupplierProfile>(http.post(`${ADMIN}/suppliers/${id}/suspend`, { note })),
  restore: (id: string, note: string) =>
    call<SupplierProfile>(http.post(`${ADMIN}/suppliers/${id}/restore`, { note })),
}

// ---- Phase 3: supplier products in the seller's store ----------------------

export type PauseReason =
  | 'COST_ABOVE_PRICE'
  | 'SUPPLY_CLOSED'
  | 'SUPPLIER_INACTIVE'
  | 'LINK_INACTIVE'
  | 'SOURCE_REMOVED'

export interface CatalogVariant {
  supplyVariantId: string
  name: string
  isDefault: boolean
  optionValues: Record<string, string> | null
  cost: number
  shopPrice: number
  mrp: number | null
  suggested: number
  stock: number
}

export interface CatalogItem {
  supplyProductId: string
  name: string
  imageUrl: string | null
  supplier: { id: string; name: string }
  category: { id: string; name: string | null } | null
  costMin: number
  costMax: number
  suggestedPrice: number
  youEarn: number
  delivery: string
  returnDays: number
  shipWithinDays: number
  supplierShippingFee: number
  codAllowed: boolean
  inStoreProductId: string | null
  variants: CatalogVariant[]
}

export interface DeliveryRate {
  type: 'FREE' | 'FLAT'
  amount: number
  freeAbove: number | null
}

export interface Catalog {
  items: CatalogItem[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
  filters: { suppliers: { id: string; name: string }[]; categories: { id: string; name: string | null }[] }
  store: {
    mode: 'DELIVERY' | 'PICKUP' | 'BOTH'
    deliveryRate: DeliveryRate
    shelves: { id: string; name: string; globalCategoryId: string | null }[]
    platformFeePct: number
    minMarginWarnPct: number
  }
}

export interface CatalogQuery {
  supplierId?: string
  q?: string
  categoryId?: string
  page?: number
}

export interface AddInput {
  items: { supplyProductId: string; prices?: { supplyVariantId: string; price: number }[] }[]
  shelf: { shelfId: string } | { newShelf: true }
  addOnTop?: { amount: number } | { percent: number }
  followCost: boolean
  deliveryAmount?: number
}

export interface Supplied {
  id: string
  productId: string
  name: string
  isActive: boolean
  followCost: boolean
  state: 'ACTIVE' | 'PAUSED'
  pauseReason: PauseReason | null
  pauseText: string | null
  supplier: { name: string; linkId: string }
  supplierShippingFee: number
  variants: {
    variantId: string
    name: string
    price: number
    cost: number | null
    mrp: number | null
    isActive: boolean
    youEarn: number | null
    fixPrice: number | null
  }[]
  newOptions: { supplyVariantId: string; name: string; cost: number; mrp: number | null }[]
}

export const suppliedApi = {
  catalog: (storeId: string, query: CatalogQuery) =>
    call<Catalog>(http.get(`${store(storeId)}/catalog`, { params: query })),
  add: (storeId: string, input: AddInput) =>
    call<{ supplyProductId: string; productId: string; added: boolean; isActive: boolean }[]>(
      http.post(`${store(storeId)}/resales`, input),
    ),
  list: (storeId: string, productId?: string) =>
    call<Supplied[]>(http.get(`${store(storeId)}/resales`, { params: productId ? { productId } : {} })),
  setFollow: (storeId: string, id: string, followCost: boolean) =>
    call<Supplied>(http.patch(`${store(storeId)}/resales/${id}`, { followCost })),
  refresh: (storeId: string, id: string) => call<Supplied>(http.post(`${store(storeId)}/resales/${id}/refresh`)),
  addOption: (storeId: string, id: string, supplyVariantId: string, price: number) =>
    call<Supplied>(http.post(`${store(storeId)}/resales/${id}/options`, { supplyVariantId, price })),
  fixPrice: (storeId: string, id: string) => call<Supplied>(http.post(`${store(storeId)}/resales/${id}/fix-price`)),
  remove: (storeId: string, id: string) => call(http.delete(`${store(storeId)}/resales/${id}`)),
}

// ---- Phase 4: supplier orders ------------------------------------------------

export type SupplierOrderStatus =
  | 'AWAITING_PAYMENT'
  | 'EXPIRED'
  | 'NEW'
  | 'ACCEPTED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RETURNED'

export interface ParcelInfo {
  id: string
  carrierCode: string | null
  carrier: string
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string
  deliveredAt: string | null
  returnedAt: string | null
}

/** One order as the supplier sees it: what to ship, collect and where. No customer email, no selling prices. */
export interface SupplierOrder {
  id: string
  orderNumber: string
  status: SupplierOrderStatus
  createdAt: string
  shipBy: string | null
  late: boolean
  paymentMode: 'PREPAID' | 'COD'
  collectAmount: number | null
  items: {
    id: string
    productName: string
    variantName: string | null
    sku: string | null
    quantity: number
    imageUrl: string | null
  }[]
  /** Null once the order closed long enough ago (the customer's data is hidden). */
  delivery: { name: string | null; phone: string | null; address: string | null; pincode: string | null; state: string | null } | null
  seller: { name: string; phone: string | null } | null
  parcel: ParcelInfo | null
  closeReason: string | null
  amounts: { costTotal: number | null; shippingFee: number | null; supplierShare: number | null }
  /** Paid by UnieMax (Easy Split) or directly by the seller. */
  paidBy: 'UNIEMAX' | 'SELLER'
  split: { state: string; payoutOn: string | null } | null
  terms: string
}

export interface SupplierInbox {
  items: SupplierOrder[]
  counts: { new: number; shipped: number }
}

export type SupplierTab = 'new' | 'shipped' | 'done'
export type CantShipReason = 'OUT_OF_STOCK' | 'DAMAGED' | 'PINCODE' | 'OTHER'

export interface Slip {
  id: string
  orderNumber: string
  soldBy: { name: string; logoUrl: string | null }
  shippedBy: { name: string; returnAddress: string | null; phone: string | null }
  items: { productName: string; variantName: string | null; sku: string | null; quantity: number }[]
  delivery: { name: string | null; phone: string | null; address: string | null; pincode: string | null; state: string | null }
  paymentMode: 'PREPAID' | 'COD'
  collectAmount: number | null
}

export interface TrackingBody {
  carrierCode: string
  carrierName?: string | null
  trackingNumber: string
  trackingUrl?: string | null
}

const supplierOrders = (storeId: string) => `${store(storeId)}/supplier-orders`

export const supplierOrdersApi = {
  inbox: (storeId: string, tab: SupplierTab) =>
    call<SupplierInbox>(http.get(supplierOrders(storeId), { params: { tab } })),
  confirm: (storeId: string, id: string) => call<SupplierOrder>(http.post(`${supplierOrders(storeId)}/${id}/confirm`)),
  ship: (storeId: string, id: string, tracking: TrackingBody) =>
    call<SupplierOrder>(http.post(`${supplierOrders(storeId)}/${id}/ship`, tracking)),
  editTracking: (storeId: string, id: string, tracking: TrackingBody) =>
    call<SupplierOrder>(http.patch(`${supplierOrders(storeId)}/${id}/tracking`, tracking)),
  cantShip: (storeId: string, id: string, reason: CantShipReason, note: string | null) =>
    call<SupplierOrder>(http.post(`${supplierOrders(storeId)}/${id}/cant-ship`, { reason, note })),
  delivered: (
    storeId: string,
    id: string,
    photo: { blob: Blob; filename: string } | null,
    onProgress?: (fraction: number) => void,
  ) => {
    const url = `${supplierOrders(storeId)}/${id}/delivered`
    if (!photo) return call<SupplierOrder>(http.post(url, {}))
    const form = new FormData()
    form.append('file', photo.blob, photo.filename)
    return call<SupplierOrder>(
      http.post(url, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total)
        },
      }),
    )
  },
  cameBack: (storeId: string, id: string, restock: boolean) =>
    call<SupplierOrder>(http.post(`${supplierOrders(storeId)}/${id}/came-back`, { restock })),
  slips: (storeId: string, ids: string[]) =>
    call<Slip[]>(http.get(`${supplierOrders(storeId)}/slips`, { params: { ids: ids.join(',') } })),
}

/** One supplier's part of an order, as the seller sees it. */
export interface SellerPart {
  id: string
  status: SupplierOrderStatus
  shipBy: string | null
  late: boolean
  supplier: { name: string; phone: string | null }
  items: { orderItemId: string; productName: string; variantName: string | null; quantity: number }[]
  parcel: ParcelInfo | null
  closeReason: string | null
  youEarn: number
  supplierShare: number | null
  terms: string
  problem: { openedAt: string; ticketId: string | null; resolvedAt: string | null } | null
  /** Mixed order, a part failed: the seller decides whether to cancel the whole order. */
  needsDecision: boolean
  canMarkDelivered: boolean
  canReportProblem: boolean
}

export interface SellerParts {
  orderStatus: string
  hasOwnItems: boolean
  parts: SellerPart[]
}

export const sellerPartsApi = {
  parts: (storeId: string, orderId: string) =>
    call<SellerParts>(http.get(`${store(storeId)}/orders/${orderId}/parts`)),
  delivered: (storeId: string, orderId: string, id: string) =>
    call<SellerParts>(http.post(`${store(storeId)}/orders/${orderId}/parts/${id}/delivered`)),
  problem: (storeId: string, orderId: string, id: string, note: string) =>
    call<SellerParts>(http.post(`${store(storeId)}/orders/${orderId}/parts/${id}/problem`, { note })),
}

export type NeedsKind = 'late' | 'cant_ship' | 'came_back' | 'problem' | 'refund' | 'split' | 'vendor_balance'

export interface NeedsItem {
  key: string
  kind: NeedsKind
  supplierOrderId: string
  orderId: string
  orderNumber: string
  status: SupplierOrderStatus
  seller: string
  supplier: string
  shipBy: string | null
  closeReason: string | null
  ticketId: string | null
  orderTotal: number | null
  supplierShare: number | null
  /** A Split Refund's per-vendor amounts (refund items of a split order). */
  vendorAmounts: { entries: { name: string; role: 'SUPPLIER' | 'SELLER'; amount: number }[]; fee: number } | null
  splitError: string | null
  splitAttempts: number
  feeAdjustError: string | null
  platformFee: number | null
  createdAt: string
}

export const adminNeedsApi = {
  list: (page: number, kind?: NeedsKind) =>
    callList<NeedsItem>(http.get(`${ADMIN}/needs-action`, { params: { page, kind } })),
  resolve: (supplierOrderId: string, note: string) =>
    call<{ resolved: boolean }>(http.post(`${ADMIN}/needs-action/${supplierOrderId}/resolve`, { note })),
}

// ---- Phase 5: the account with one supplier or seller -----------------------------

export interface AccountLine {
  supplierOrderId: string
  orderId: string
  orderNumber: string
  date: string
  paymentMode: 'PREPAID' | 'COD'
  status: SupplierOrderStatus
  state: 'PENDING' | 'OWED' | 'HELD' | 'VOID' | 'SPLIT'
  stateText: string
  counts: boolean
  customerPaid: number | null
  supplierGets: number
  /** From your side: positive = you get, negative = you owe. */
  forYou: number
  /** Cash a courier collected on a COD order. */
  collected: number | null
  settleVia: 'DIRECT' | 'SPLIT'
  /** A split line: when the supplier's share reaches its bank. */
  payoutOn: string | null
}

export interface AccountPayment {
  id: string
  text: string
  amount: number
  paidOn: string
  reference: string | null
  note: string | null
  recordedByYou: boolean
  canDelete: boolean
  createdAt: string
}

export interface Account {
  linkId: string
  viewer: 'seller' | 'supplier'
  other: { name: string; phone: string | null }
  /** Positive = they owe you; negative = you owe them. */
  balance: number
  words: string
  lines: AccountLine[]
  /** More orders than the list shows; every one is in the balance. */
  moreLines: boolean
  split: SplitMode
  payments: AccountPayment[]
}

export interface PaymentBody {
  paid: 'me' | 'them'
  amount: number
  paidOn: string
  reference?: string | null
  note?: string | null
}

/** The seller's account with a supplier, and the supplier's with a seller — the same numbers. */
const accountBase = (side: 'seller' | 'supplier', storeId: string, linkId: string) =>
  `${store(storeId)}/${side === 'seller' ? 'suppliers' : 'sellers'}/${linkId}`

export const accountApi = {
  get: (side: 'seller' | 'supplier', storeId: string, linkId: string) =>
    call<Account>(http.get(`${accountBase(side, storeId, linkId)}/account`)),
  record: (side: 'seller' | 'supplier', storeId: string, linkId: string, body: PaymentBody) =>
    call<Account>(http.post(`${accountBase(side, storeId, linkId)}/payments`, body)),
  remove: (side: 'seller' | 'supplier', storeId: string, linkId: string, paymentId: string) =>
    call<Account>(http.delete(`${accountBase(side, storeId, linkId)}/payments/${paymentId}`)),
}

// ---- Phase 6: Easy Split payouts ------------------------------------------------------

export interface PayoutRow {
  supplierOrderId: string
  orderId: string
  orderNumber: string
  seller: string
  supplier: string
  settleVia: 'DIRECT' | 'SPLIT'
  /** WAITING · REQUESTED · DONE · FAILED · FALLBACK_DIRECT */
  state: string
  ref: string | null
  attempts: number
  error: string | null
  paidAt: string | null
  splitAt: string | null
  payoutOn: string | null
  orderTotal: number | null
  supplierGets: number | null
  platformFee: number | null
  sellerGets: number | null
}

export const adminPayoutsApi = {
  list: (page: number) => callList<PayoutRow>(http.get(`${ADMIN}/payouts`, { params: { page } })),
}
