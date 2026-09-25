import { call, callList, http } from '../../shared/auth/http'
import type { ListMeta } from '../../shared/auth/http'
import { AFFILIATE_API_BASE as BASE } from './config'

/**
 * Typed client for the affiliate API. Three audiences, one prefix: the seller
 * managing a store's programme, the affiliate partner, and the public pieces
 * (invitation preview/accept and the link click).
 */

export type CommissionType = 'PERCENTAGE' | 'FIXED'
export type CommissionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PAID'
  | 'CANCELLED'
  | 'REVERSED'
  | 'REJECTED'
export type Channel =
  | 'YOUTUBE'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'WEBSITE'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'OTHER'

export const CHANNELS: Channel[] = [
  'YOUTUBE',
  'INSTAGRAM',
  'FACEBOOK',
  'WEBSITE',
  'WHATSAPP',
  'TELEGRAM',
  'OTHER',
]

export interface Program {
  id: string
  storeId: string
  enabled: boolean
  commissionType: CommissionType
  commissionRate: number
  attributionDays: number
  holdDays: number
}

export interface Totals {
  orders: number
  sales: number
  pending: number
  approved: number
  paid: number
}

export interface SellerSummary extends Totals {
  partners: number
  clicks: number
}

export interface SellerProduct {
  id: string
  name: string
  slug: string
  price: number | null
  imageUrl: string | null
  enabled: boolean
  commissionType: CommissionType | null
  commissionRate: number | null
  hasOverride: boolean
}

export interface Invite {
  id: string
  token: string
  name: string
  email: string
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED'
  commissionType: CommissionType | null
  commissionRate: number | null
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
  url: string
}

export interface Partner {
  id: string
  affiliateId: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'REMOVED'
  accountStatus: 'ACTIVE' | 'SUSPENDED'
  commissionType: CommissionType | null
  commissionRate: number | null
  hasOverride: boolean
  commissions: number
  earned: number
  joinedAt: string
}

export interface Commission {
  id: string
  storeId: string
  storeName: string
  orderId: string
  orderNumber: string
  productName: string
  lineTotal: number
  commissionType: CommissionType
  commissionRate: number
  amount: number
  status: CommissionStatus
  maturesAt: string | null
  approvedAt: string | null
  paidAt: string | null
  note: string | null
  createdAt: string
  affiliate: { id: string; displayName: string }
}

export interface Me extends Totals {
  id: string
  displayName: string
  status: 'ACTIVE' | 'SUSPENDED'
  joinedAt: string
  stores: number
  clicks: number
}

export interface PartnerStore {
  id: string
  storeId: string
  storeName: string
  storeSlug: string
  status: 'ACTIVE' | 'PAUSED'
  programEnabled: boolean
  commissionType: CommissionType | null
  commissionRate: number | null
  joinedAt: string
}

export interface PartnerProduct {
  id: string
  name: string
  slug: string
  price: number | null
  imageUrl: string | null
  commissionType: CommissionType
  commissionRate: number
  estimatedCommission: number | null
}

export interface AffiliateLink {
  id: string
  token: string
  storeId: string
  storeSlug: string
  storeName: string
  productId: string | null
  productName: string | null
  productSlug: string | null
  channel: Channel | null
  label: string | null
  enabled: boolean
  clickCount: number
  createdAt: string
  url: string
}

export interface InvitePreview {
  storeName: string
  name: string
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED' | 'CLOSED'
  commissionType: CommissionType
  commissionRate: number | null
  expiresAt: string
}

export interface ClickResult {
  path: string
  storeSlug: string
  ref: string
  expiresAt: string
}

export interface AdminAffiliate {
  id: string
  customerId: string
  displayName: string
  status: 'ACTIVE' | 'SUSPENDED'
  stores: number
  links: number
  createdAt: string
}

export type Page<T> = { items: T[]; meta: ListMeta }

interface PageQuery {
  page?: number
  q?: string
  status?: CommissionStatus
}

// ---- seller ---------------------------------------------------------------

export const sellerAffiliateApi = {
  summary: (storeId: string) =>
    call<SellerSummary>(http.get(`${BASE}/seller/stores/${storeId}/summary`)),
  program: (storeId: string) =>
    call<Program>(http.get(`${BASE}/seller/stores/${storeId}/program`)),
  updateProgram: (storeId: string, patch: Partial<Omit<Program, 'id' | 'storeId'>>) =>
    call<Program>(http.patch(`${BASE}/seller/stores/${storeId}/program`, patch)),
  products: (storeId: string, query: PageQuery) =>
    callList<SellerProduct>(
      http.get(`${BASE}/seller/stores/${storeId}/products`, { params: query }),
    ),
  updateProduct: (
    storeId: string,
    productId: string,
    patch: { enabled?: boolean; commissionType?: CommissionType | null; commissionRate?: number | null },
  ) => call(http.patch(`${BASE}/seller/stores/${storeId}/products/${productId}`, patch)),
  invites: (storeId: string) =>
    call<Invite[]>(http.get(`${BASE}/seller/stores/${storeId}/invitations`)),
  invite: (
    storeId: string,
    input: { name: string; email: string; commissionType?: CommissionType; commissionRate?: number },
  ) => call<Invite>(http.post(`${BASE}/seller/stores/${storeId}/invitations`, input)),
  cancelInvite: (storeId: string, id: string) =>
    call(http.delete(`${BASE}/seller/stores/${storeId}/invitations/${id}`)),
  partners: (storeId: string) =>
    call<Partner[]>(http.get(`${BASE}/seller/stores/${storeId}/partners`)),
  updatePartner: (
    storeId: string,
    id: string,
    patch: { status?: Partner['status']; commissionType?: CommissionType | null; commissionRate?: number | null },
  ) => call<Partner>(http.patch(`${BASE}/seller/stores/${storeId}/partners/${id}`, patch)),
  commissions: (storeId: string, query: PageQuery) =>
    callList<Commission>(
      http.get(`${BASE}/seller/stores/${storeId}/commissions`, { params: query }),
    ),
}

// ---- affiliate partner ----------------------------------------------------

export const partnerApi = {
  me: () => call<Me>(http.get(`${BASE}/me`)),
  stores: () => call<PartnerStore[]>(http.get(`${BASE}/me/stores`)),
  products: (storeId: string, query: PageQuery) =>
    callList<PartnerProduct>(
      http.get(`${BASE}/me/stores/${storeId}/products`, { params: query }),
    ),
  links: () => call<AffiliateLink[]>(http.get(`${BASE}/me/links`)),
  createLink: (input: {
    storeId: string
    productId?: string | null
    channel?: Channel | null
    label?: string | null
  }) => call<AffiliateLink>(http.post(`${BASE}/me/links`, input)),
  updateLink: (id: string, patch: { enabled?: boolean; label?: string | null }) =>
    call<AffiliateLink>(http.patch(`${BASE}/me/links/${id}`, patch)),
  commissions: (query: PageQuery) =>
    callList<Commission>(http.get(`${BASE}/me/commissions`, { params: query })),
}

// ---- public ---------------------------------------------------------------

export const publicAffiliateApi = {
  invite: (token: string) =>
    call<InvitePreview>(http.get(`${BASE}/public/invitations/${token}`)),
  accept: (token: string) =>
    call<{ storeName: string; storeSlug: string }>(
      http.post(`${BASE}/public/invitations/${token}/accept`),
    ),
  click: (token: string) => call<ClickResult>(http.post(`${BASE}/public/click/${token}`)),
}

// ---- platform admin -------------------------------------------------------

/** Inside the admin API subtree — the admin session cookies are scoped to it. */
const ADMIN_BASE = '/api/v1/admin/affiliate'

export const adminAffiliateApi = {
  affiliates: (page: number) =>
    callList<AdminAffiliate>(http.get(`${ADMIN_BASE}/affiliates`, { params: { page } })),
  setStatus: (id: string, status: AdminAffiliate['status']) =>
    call<AdminAffiliate>(http.patch(`${ADMIN_BASE}/affiliates/${id}`, { status })),
  commissions: (query: PageQuery) =>
    callList<Commission>(http.get(`${ADMIN_BASE}/commissions`, { params: query })),
  updateCommission: (id: string, patch: { status: 'APPROVED' | 'REJECTED'; note?: string }) =>
    call<Commission>(http.patch(`${ADMIN_BASE}/commissions/${id}`, patch)),
  approveNow: () => call<{ approved: number }>(http.post(`${ADMIN_BASE}/jobs/approve`)),
}
