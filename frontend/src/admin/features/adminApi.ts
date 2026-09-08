import { call, callList, http } from '../../shared/auth/http'
import type { ListMeta } from '../../shared/auth/http'
import type { Admin } from '../../shared/auth/authApi'

/**
 * Typed client for `/api/v1/admin/**` — the ONE place the console knows the
 * shape of the admin API. Pages call these functions; nothing else in the
 * admin app touches `http` directly.
 *
 * **Money arrives as a decimal string** ("14250.00"), never a number: the
 * backend serialises Prisma `Decimal` that way so no amount is ever rounded
 * by a float. Format it with `formatMoney()` (ui/format.ts) — don't do
 * arithmetic on it in the browser.
 */

const BASE = '/api/v1/admin'

// ---- Shared row shapes ----------------------------------------------------

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
export type PaymentMethod = 'ONLINE' | 'COD'
export type BankVerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED'

export interface OrderRow {
  id: string
  orderNumber: string
  status: OrderStatus
  storeId: string | null
  storeName: string
  storeSlug: string
  customerName: string | null
  customerPhone: string | null
  fulfilment: 'DELIVERY' | 'PICKUP'
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentRef: string | null
  total: string
  placedAt: string
  itemCount: number
}

export interface OrderDetail extends OrderRow {
  customerEmail: string | null
  addressLine: string | null
  pincode: string | null
  state: string | null
  country: string | null
  subtotal: string
  shippingCharge: string
  /** "Free delivery" / "Standard delivery" / "Store pickup"; null on legacy orders. */
  shippingMethod: string | null
  tax: string
  discount: string
  /** Billing snapshot when it differed from delivery; null = same. */
  billingAddress: {
    name: string
    phone: string | null
    addressLine: string
    pincode: string
    state: string | null
    country: string | null
  } | null
  cfOrderId: string | null
  confirmedAt: string | null
  packedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null
  store: { id: string; name: string; slug: string } | null
  items: {
    id: string
    productId: string | null
    productName: string
    variantName: string | null
    imageUrl: string | null
    unitPrice: string
    quantity: number
    lineTotal: string
  }[]
}

/**
 * How far a seller has got with setting their store up — the console's
 * mirror of the backend's `summariseReadiness()`.
 *
 * The platform evaluates this from ONE requirement registry
 * (`storeReadiness.ts`), which is also what the publish and payment
 * endpoints enforce and what the seller sees on their own pages. So an admin
 * chasing a seller is never quoting a different rulebook.
 */
export interface SetupSummary {
  complete: boolean
  metCount: number
  totalCount: number
  /** Unfinished steps in registry order. Empty when `complete`. */
  pending: SetupStep[]
}

export interface SetupStep {
  key: string
  /** "Business & contact", "Address", "Tax details"… */
  title: string
  /** Section path under `/mystores/{slug}` — `business`, `products`, … */
  href: string
  metCount: number
  totalCount: number
}

/** One requirement, from the detail endpoint's full evaluation. */
export interface SetupRequirement {
  key: string
  label: string
  step: string
  gates: ('PUBLISH' | 'ONLINE_PAYMENT' | 'PICKUP')[]
  met: boolean
}

export interface StoreRow {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  isPublished: boolean
  publishedAt: string | null
  suspendedAt: string | null
  suspendedReason: string | null
  createdAt: string
  owner: { id: string; name: string | null; email: string | null; phone: string | null }
  counts: { products: number; categories: number; orders: number }
  revenue: string
  setup: SetupSummary
}

/**
 * A store appearance template — a curated palette a seller can apply to their
 * storefront in one click. Colors ONLY: the same five keys as a store's own
 * theme, and nothing else about a store.
 */
export interface ThemeTemplateColors {
  backgroundColor: string
  primaryColor: string
  /** Links, prices & highlights. `null` = Auto (follows primary). */
  secondaryColor: string | null
  /** Cards & panels. `null` = Auto (derived from the background). */
  surfaceColor: string | null
  /** Text on CTA buttons. `null` = Auto (from the primary's luminance). */
  buttonTextColor: string | null
}

export interface ThemeTemplate {
  id: string
  name: string
  description: string | null
  theme: ThemeTemplateColors
  isActive: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface ThemeTemplateInput {
  name: string
  description: string | null
  theme: ThemeTemplateColors
  isActive: boolean
  displayOrder: number
}

export interface BankAccount {
  id: string
  accountHolderName: string
  accountNumberLast4: string
  ifsc: string
  bankName: string
  branch: string
  upiId: string | null
  isPrimary: boolean
  verificationStatus: BankVerificationStatus
  verificationNote: string | null
  verifiedAt: string | null
  createdAt: string
}

export interface StoreDetail extends StoreRow {
  /**
   * The full evaluation, not just the summary — the detail page names the
   * individual missing requirements ("Contact email", "PAN"), which is what
   * an admin has to put in the message they send the seller.
   */
  readiness: {
    steps: (SetupStep & {
      blurb: string
      complete: boolean
      requirements: SetupRequirement[]
    })[]
    complete: boolean
    metCount: number
    totalCount: number
  }
  settings: {
    payments: { acceptOnlinePayment: boolean; acceptCod: boolean }
    shipping: {
      mode: 'DELIVERY' | 'PICKUP' | 'BOTH'
      rate: { type: 'FREE' | 'FLAT'; amount: number; freeAbove: number | null }
    }
    checkout: Record<string, boolean>
  }
  bankAccounts: BankAccount[]
  orderStatus: Partial<Record<OrderStatus, number>>
  recentOrders: Pick<
    OrderRow,
    'id' | 'orderNumber' | 'status' | 'customerName' | 'paymentMethod' | 'paymentStatus' | 'total' | 'placedAt'
  >[]
}

export interface CustomerRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  blockedAt: string | null
  blockedReason: string | null
  createdAt: string
  counts: { stores: number; orders: number; addresses: number }
  isSeller: boolean
}

export interface CustomerDetail extends CustomerRow {
  altPhone: string | null
  stores: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    isPublished: boolean
    suspendedAt: string | null
    createdAt: string
  }[]
  spend: { orders: number; total: string }
  recentOrders: Pick<
    OrderRow,
    'id' | 'orderNumber' | 'status' | 'storeName' | 'storeSlug' | 'paymentMethod' | 'paymentStatus' | 'total' | 'placedAt'
  >[]
  revokedSessions?: number
}

/**
 * One seller's shelf, seen from the console. `state` says how far it is from
 * being a platform category: typed and never linked, linked by the earlier
 * bulk migration but still wearing its typed name, or fully converted.
 */
export type ShelfState = 'unmapped' | 'tagged' | 'converted'

export interface ShelfConversionPlan {
  action: 'rename' | 'merge'
  /** Why it must not run, in the admin's words; null when it can. */
  blocked: string | null
  from: { name: string; shelfPath: string; productCount: number; subcategoryCount: number }
  to: { name: string; pathLabel: string }
  parent: { name: string; created: boolean } | null
  mergeInto: { id: string; name: string } | null
  productsMoved: number
  nameChanges: boolean
}

export interface ShelfRow {
  id: string
  name: string
  slug: string
  isActive: boolean
  /** "KTM › Duke 200" — how the shelf reads inside the seller's own shop. */
  shelfPath: string
  isSubcategory: boolean
  store: { id: string; name: string; slug: string }
  productCount: number
  subcategoryCount: number
  categoryId: string | null
  category: { id: string; name: string; pathLabel: string } | null
  state: ShelfState
  converted: boolean
}

export interface ProductRow {
  id: string
  name: string
  slug: string
  isActive: boolean
  priceMin: string | null
  priceMax: string | null
  stockTotal: number
  isFeatured: boolean
  isBestSeller: boolean
  isNewArrival: boolean
  createdAt: string
  store: { id: string; name: string; slug: string; isPublished: boolean }
  category: { id: string; name: string }
  imageUrl: string | null
  variantCount: number
}

/** Seller-defined purchasable dimension: `{ name: "Size", values: ["S", "M"] }`. */
export interface ProductOptionType {
  name: string
  values: string[]
}

/** Descriptive spec-table row: `{ label: "Material", value: "Memory foam" }`. */
export interface ProductSpecification {
  label: string
  value: string
}

/** Per-product delivery-area override. `null` on the product = follows the store default. */
export interface ProductDeliveryRule {
  type: 'ALL' | 'INCLUDE' | 'EXCLUDE'
  pincodes: string[]
}

export interface ProductDetail extends ProductRow {
  description: string | null
  hideFromSearch: boolean
  updatedAt: string
  optionTypes: ProductOptionType[]
  specifications: ProductSpecification[]
  deliveryRule: ProductDeliveryRule | null
  /** Per-product shipping charge. `null` = follows the store rate. */
  shippingOverride: { type: 'FREE' | 'FLAT'; amount: number } | null
  /** Whether cash on delivery may be chosen for orders containing this product. */
  codAvailable: boolean
  variants: {
    id: string
    name: string
    price: string
    stockQuantity: number
    isActive: boolean
    isDefault: boolean
    /** `{ [optionTypeName]: value }`; null on the implicit default variant. */
    optionValues: Record<string, string> | null
  }[]
  media: { id: string; type: 'IMAGE' | 'VIDEO'; url: string | null; altText: string | null }[]
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type TicketCategory =
  | 'ORDERS'
  | 'PAYMENTS'
  | 'PAYOUTS'
  | 'PRODUCTS'
  | 'STORE_SETUP'
  | 'STORE_REPORT'
  | 'ACCOUNT'
  | 'TECHNICAL'
  | 'OTHER'

/**
 * Which side of the platform a ticket came from. Derived server-side from
 * whether the ticket names a store, so it can never disagree with the row:
 * `STORE` = a seller writing from their shop's Help & Support, `ACCOUNT` = a
 * shopper writing from the account menu.
 */
export type TicketScope = 'STORE' | 'ACCOUNT'

export interface TicketMessage {
  id: string
  authorType: 'ADMIN' | 'CUSTOMER'
  authorId: string
  authorName: string | null
  body: string
  createdAt: string
}

export interface TicketRow {
  id: string
  ticketNumber: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority
  storeId: string | null
  storeName: string | null
  storeSlug: string | null
  contactEmail: string | null
  contactPhone: string | null
  lastMessageAt: string
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  messageCount: number
  customer: { id: string; name: string | null; email: string | null; phone: string | null }
}

export interface TicketDetail extends TicketRow {
  messages: TicketMessage[]
}

/**
 * The support list's meta carries `openCount` — every OPEN/IN_PROGRESS ticket
 * platform-wide, regardless of the current filter — so the queue tab can show
 * the backlog without a second request.
 */
export interface TicketListMeta extends ListMeta {
  openCount: number
}

export interface AuditRow {
  id: string
  adminId: string
  adminEmail: string
  action: string
  entityType: string
  entityId: string
  meta: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface Dashboard {
  range: { days: number; since: string }
  totals: {
    stores: number
    publishedStores: number
    draftStores: number
    customers: number
    sellers: number
    blockedCustomers: number
    products: number
    orders: number
    revenue: string
  }
  today: { orders: number; revenue: string }
  orderStatus: Record<
    'pending' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled',
    number
  >
  payments: {
    paid: number
    pending: number
    failed: number
    refunded: number
    collected: string
    codRevenue: string
    onlineRevenue: string
  }
  series: { date: string; orders: number; revenue: string }[]
  topStores: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    orders: number
    revenue: string
  }[]
  topProducts: {
    id: string
    name: string
    storeName: string
    storeSlug: string
    unitsSold: number
    revenue: string
  }[]
  recentOrders: Pick<
    OrderRow,
    'id' | 'orderNumber' | 'status' | 'storeName' | 'storeSlug' | 'customerName' | 'paymentMethod' | 'paymentStatus' | 'total' | 'placedAt'
  >[]
  lowStock: { id: string; name: string; stockTotal: number; storeName: string; storeSlug: string }[]
  integrations: { paymentGateway: boolean; push: boolean }
}

export interface Paged<T> {
  items: T[]
  meta: ListMeta
}

/** Query params, with `undefined` entries dropped so URLs stay clean. */
type Params = Record<string, string | number | boolean | undefined>

const params = (input: Params) => ({
  params: Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ''),
  ),
})

// ---- Endpoints ------------------------------------------------------------

export const adminApi = {
  dashboard(days: number) {
    return call<Dashboard>(http.get(`${BASE}/dashboard`, params({ days })))
  },

  // Stores
  listStores(query: Params) {
    return callList<StoreRow>(http.get(`${BASE}/stores`, params(query)))
  },
  getStore(id: string) {
    return call<StoreDetail>(http.get(`${BASE}/stores/${id}`))
  },
  suspendStore(id: string, body: { suspended: boolean; reason?: string | null }) {
    return call<StoreDetail>(http.patch(`${BASE}/stores/${id}/suspend`, body))
  },
  verifyBankAccount(
    storeId: string,
    accountId: string,
    body: { status: BankVerificationStatus; note?: string | null },
  ) {
    return call<StoreDetail>(
      http.patch(`${BASE}/stores/${storeId}/bank-accounts/${accountId}/verification`, body),
    )
  },

  // Customers
  listCustomers(query: Params) {
    return callList<CustomerRow>(http.get(`${BASE}/customers`, params(query)))
  },
  getCustomer(id: string) {
    return call<CustomerDetail>(http.get(`${BASE}/customers/${id}`))
  },
  blockCustomer(id: string, body: { blocked: boolean; reason?: string | null }) {
    return call<CustomerDetail>(http.patch(`${BASE}/customers/${id}/block`, body))
  },

  // Orders & payments
  listOrders(query: Params) {
    return callList<OrderRow>(http.get(`${BASE}/orders`, params(query)))
  },
  getOrder(id: string) {
    return call<OrderDetail>(http.get(`${BASE}/orders/${id}`))
  },
  listPayments(query: Params) {
    return callList<OrderRow>(http.get(`${BASE}/payments`, params(query)))
  },

  // Catalog
  listProducts(query: Params) {
    return callList<ProductRow>(http.get(`${BASE}/catalog/products`, params(query)))
  },
  getProduct(id: string) {
    return call<ProductDetail>(http.get(`${BASE}/catalog/products/${id}`))
  },
  setProductVisibility(id: string, body: { isActive: boolean; reason?: string | null }) {
    return call<ProductDetail>(http.patch(`${BASE}/catalog/products/${id}/visibility`, body))
  },

  // Converting sellers' legacy free-text shelves into platform categories
  listShelves(query: Params) {
    return callList<ShelfRow>(http.get(`${BASE}/catalog/shelves`, params(query)))
  },
  /** What convertShelf would do — nothing is written. */
  planShelfConversion(id: string, categoryId: string) {
    return call<ShelfConversionPlan>(
      http.post(`${BASE}/catalog/shelves/${id}/convert`, { categoryId, dryRun: true }),
    )
  },
  /** One-way: renames/re-parents the shelf, or merges it into the one already standing for the category. */
  convertShelf(id: string, categoryId: string) {
    return call<{ shelf: ShelfRow; plan: ShelfConversionPlan }>(
      http.post(`${BASE}/catalog/shelves/${id}/convert`, { categoryId }),
    )
  },

  // Support tickets
  listTickets(query: Params) {
    return callList<TicketRow>(http.get(`${BASE}/support/tickets`, params(query))) as Promise<{
      items: TicketRow[]
      meta: TicketListMeta
    }>
  },
  getTicket(id: string) {
    return call<TicketDetail>(http.get(`${BASE}/support/tickets/${id}`))
  },
  replyTicket(id: string, message: string) {
    return call<TicketDetail>(http.post(`${BASE}/support/tickets/${id}/messages`, { message }))
  },
  updateTicket(id: string, body: { status?: TicketStatus; priority?: TicketPriority }) {
    return call<TicketDetail>(http.patch(`${BASE}/support/tickets/${id}`, body))
  },

  // Audit trail
  listAudit(query: Params) {
    return callList<AuditRow>(http.get(`${BASE}/audit`, params(query)))
  },

  // Admin accounts (SUPER_ADMIN only — the API enforces it)
  listAdmins() {
    return call<Admin[]>(http.get(`${BASE}/admins`))
  },
  createAdmin(body: { email: string; password: string; name?: string; role: 'ADMIN' | 'SUPER_ADMIN' }) {
    return call<Admin>(http.post(`${BASE}/admins`, body))
  },
  updateAdmin(id: string, body: { name?: string; role?: 'ADMIN' | 'SUPER_ADMIN'; isActive?: boolean }) {
    return call<Admin>(http.patch(`${BASE}/admins/${id}`, body))
  },
  resetAdminPassword(id: string, password: string) {
    return call<{ revokedSessions: number }>(http.post(`${BASE}/admins/${id}/password`, { password }))
  },

  // Store appearance templates — the palettes sellers pick from. Applying
  // one COPIES its colors onto a store, so edits here never reach a live
  // storefront; disabling one only removes it from the seller's picker.
  listThemeTemplates() {
    return call<ThemeTemplate[]>(http.get(`${BASE}/theme-templates`))
  },
  createThemeTemplate(body: ThemeTemplateInput) {
    return call<ThemeTemplate>(http.post(`${BASE}/theme-templates`, body))
  },
  updateThemeTemplate(id: string, body: Partial<ThemeTemplateInput>) {
    return call<ThemeTemplate>(http.patch(`${BASE}/theme-templates/${id}`, body))
  },
  deleteThemeTemplate(id: string) {
    return call<{ id: string; deleted: boolean }>(
      http.delete(`${BASE}/theme-templates/${id}`),
    )
  },

  // Broadcast (the feed itself lives in notificationsApi)
  broadcast(body: {
    audience: 'ADMINS' | 'CUSTOMERS' | 'SELLERS'
    title: string
    body: string
    url?: string | null
  }) {
    return call<{ recipients: number }>(http.post(`${BASE}/notifications/broadcast`, body))
  },
}
