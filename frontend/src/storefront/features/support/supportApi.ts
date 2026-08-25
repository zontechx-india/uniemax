import { call, callList, http } from '../../../shared/auth/http'
import type { ListMeta } from '../../../shared/auth/http'

/**
 * Support feature — a signed-in account's side of a ticket thread with the
 * UnieMax platform team (`/api/v1/support`, cookie-authed; endpoints in
 * docs/API.md).
 *
 * **One API, two entry points.** A ticket raised from a store's Help & Support
 * carries that `storeId`; one raised from the account menu carries none. That
 * single field is what separates "a seller about their shop" from "a shopper
 * about their orders" — on both this side and the console's — so there is
 * nothing to keep in sync.
 */

export const TICKET_CATEGORIES = [
  'ORDERS',
  'PAYMENTS',
  'PAYOUTS',
  'PRODUCTS',
  'STORE_SETUP',
  'STORE_REPORT',
  'ACCOUNT',
  'TECHNICAL',
  'OTHER',
] as const

export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/**
 * Which side of the platform a ticket came from — derived from whether it
 * names a store, not stored twice. `STORE` = a seller writing from their
 * shop's Help & Support; `ACCOUNT` = the account menu's Help & Support.
 */
export type TicketScope = 'STORE' | 'ACCOUNT'

/**
 * Who answers a ticket. `PLATFORM` = the UnieMax team (a shopper from the
 * account menu, or a seller from their store's Help & Support); `STORE` = the
 * shop's own owner (a shopper writing to the shop they bought from).
 */
export type TicketRecipient = 'PLATFORM' | 'STORE'

/**
 * Who wrote a message — **derived by the server**, because `authorType`
 * cannot answer it: on a store thread the seller replies from a Customer
 * account, so both sides are `CUSTOMER`.
 */
export type MessageAuthorRole = 'REPORTER' | 'STORE' | 'PLATFORM'

/**
 * One label per category, **audience-neutral on purpose**: the same ticket is
 * read by the seller who raised it and by the admin answering it, and two
 * wordings for one enum value is how a queue starts disagreeing with itself.
 * What differs per audience is which categories are *offered* — see below.
 */
export const CATEGORY_LABELS: Record<TicketCategory, string> = {
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
 * What a **seller** can pick, writing about their own shop. No STORE_REPORT —
 * reporting your own store is not a thing.
 */
export const SELLER_CATEGORIES: TicketCategory[] = [
  'ORDERS',
  'PAYMENTS',
  'PAYOUTS',
  'PRODUCTS',
  'STORE_SETUP',
  'ACCOUNT',
  'TECHNICAL',
  'OTHER',
]

/**
 * What a **shopper** can pick, writing from their account. No PAYOUTS or
 * STORE_SETUP (seller-only concerns); STORE_REPORT is here instead, because
 * "this seller is a problem" is the one escalation only the platform can act
 * on. Complaints a *seller* should handle go to the store directly — a
 * customer↔seller channel is a separate, later feature.
 */
export const CUSTOMER_CATEGORIES: TicketCategory[] = [
  'ORDERS',
  'PAYMENTS',
  'PRODUCTS',
  'STORE_REPORT',
  'ACCOUNT',
  'TECHNICAL',
  'OTHER',
]

/**
 * What a shopper can pick writing **to a shop**. Only the things that shop
 * can actually act on: no ACCOUNT or TECHNICAL (UnieMax runs those), and no
 * STORE_REPORT — reporting a seller *to* that same seller is not a channel.
 */
export const STORE_CATEGORIES: TicketCategory[] = [
  'ORDERS',
  'PAYMENTS',
  'PRODUCTS',
  'OTHER',
]

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export interface TicketMessage {
  id: string
  authorType: 'ADMIN' | 'CUSTOMER'
  /** Render from this, not `authorType` — see `MessageAuthorRole`. */
  authorRole: MessageAuthorRole
  authorId: string
  authorName: string | null
  body: string
  createdAt: string
}

export interface SupportTicket {
  id: string
  ticketNumber: string
  recipient: TicketRecipient
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
  /** Who raised it — the seller's inbox names them; the reporter's own
   *  lists ignore it (they already know). */
  customer: { id: string; name: string | null; email: string | null; phone: string | null }
  /** Present on detail responses (and on every write's response). */
  messages?: TicketMessage[]
}

/** A ticket fetched by id always carries its thread. */
export interface SupportTicketDetail extends SupportTicket {
  messages: TicketMessage[]
}

export interface SupportContact {
  email: string
  phone: string
  hours: string
}

/**
 * Shown while the contact call is in flight, and kept if it fails.
 *
 * A Support page that renders no way to reach support is the one failure this
 * screen must not have — so the live values from the API are an *upgrade* on
 * these, never a precondition for showing the page.
 */
export const FALLBACK_SUPPORT_CONTACT: SupportContact = {
  email: 'support@uniemax.com',
  phone: '+91 7708774542',
  hours: 'Mon–Sat, 10 AM – 7 PM IST',
}

export interface TicketCreateInput {
  subject: string
  category: TicketCategory
  message: string
  /** Store id or slug — the Support section passes the store it opened from. */
  storeId?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

const BASE = '/api/v1/support'

export const supportApi = {
  /** Platform contact details (public endpoint — no session needed). */
  async contact(): Promise<SupportContact> {
    return call<SupportContact>(http.get('/api/v1/public/support-contact'))
  },

  /** The signed-in customer's tickets, most recently active first. */
  async list(
    query: {
      storeId?: string
      /** `ACCOUNT` keeps a seller's store threads out of their personal list. */
      scope?: TicketScope
      status?: TicketStatus
      page?: number
      pageSize?: number
    } = {},
  ): Promise<{ items: SupportTicket[]; meta: ListMeta }> {
    return callList<SupportTicket>(http.get(`${BASE}/tickets`, { params: query }))
  },

  async get(ticketId: string): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(http.get(`${BASE}/tickets/${ticketId}`))
  },

  async create(input: TicketCreateInput): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(http.post(`${BASE}/tickets`, input))
  },

  /** Reply on the thread. A reply to a resolved ticket reopens it. */
  async reply(ticketId: string, message: string): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(
      http.post(`${BASE}/tickets/${ticketId}/messages`, { message }),
    )
  },

  /** Close it yourself. Terminal — a closed ticket takes no more replies. */
  async close(ticketId: string): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(http.post(`${BASE}/tickets/${ticketId}/close`))
  },
}

/**
 * A shopper's conversation with a **shop**.
 *
 * Only list + create are store-scoped: opening, replying to and closing a
 * thread is the same act whoever answers it, so those go through
 * `supportApi` above. The store is a path segment rather than a body field —
 * you write *to* a shop, and a body that could name a different one would be
 * a way to post into a store you never opened.
 */
export const storeSupportApi = {
  /** This shopper's threads with one store, most recent activity first. */
  async list(
    storeSlug: string,
    query: { status?: TicketStatus; page?: number; pageSize?: number } = {},
  ): Promise<{ items: SupportTicket[]; meta: ListMeta }> {
    return callList<SupportTicket>(
      http.get(`${BASE}/stores/${storeSlug}/tickets`, { params: query }),
    )
  },

  async create(
    storeSlug: string,
    input: Omit<TicketCreateInput, 'storeId'>,
  ): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(
      http.post(`${BASE}/stores/${storeSlug}/tickets`, input),
    )
  },
}

/** Extra counters a seller's inbox returns alongside the page. */
export interface StoreInboxMeta extends ListMeta {
  /** Everything still OPEN/IN_PROGRESS for the store, whatever is filtered. */
  openCount: number
}

/**
 * The **seller's** side of those conversations — their shop's inbox, under
 * the store-management API (`/api/v1/stores/:id/support`).
 *
 * No priority anywhere: that is the platform's triage vocabulary, and a
 * shop's inbox is small enough to read without one.
 */
export const storeInboxApi = {
  async list(
    storeRef: string,
    query: { q?: string; status?: TicketStatus; open?: 'true'; page?: number; pageSize?: number } = {},
  ): Promise<{ items: SupportTicket[]; meta: StoreInboxMeta }> {
    return callList<SupportTicket>(
      http.get(`/api/v1/stores/${storeRef}/support/tickets`, { params: query }),
    ) as Promise<{ items: SupportTicket[]; meta: StoreInboxMeta }>
  },

  async get(storeRef: string, ticketId: string): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(
      http.get(`/api/v1/stores/${storeRef}/support/tickets/${ticketId}`),
    )
  },

  /** Answering also picks the thread up (OPEN → In progress), server-side. */
  async reply(
    storeRef: string,
    ticketId: string,
    message: string,
  ): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(
      http.post(`/api/v1/stores/${storeRef}/support/tickets/${ticketId}/messages`, {
        message,
      }),
    )
  },

  async setStatus(
    storeRef: string,
    ticketId: string,
    status: TicketStatus,
  ): Promise<SupportTicketDetail> {
    return call<SupportTicketDetail>(
      http.patch(`/api/v1/stores/${storeRef}/support/tickets/${ticketId}`, { status }),
    )
  },
}

/** `tel:` / `mailto:` targets — a phone number with spaces is not dialable. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const mailtoHref = (email: string, subject?: string) =>
  subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`
