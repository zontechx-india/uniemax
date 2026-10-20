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

export interface StoreRole {
  supplier: { status: SupplierStatus; supplyOnly: boolean } | null
  hasSuppliers: boolean
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
  stores: (token: string) => call<JoinStore[]>(http.get(`${BASE}/invites/${token}/stores`)),
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
