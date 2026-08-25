import { call, callList, http } from '../../../shared/auth/http'
import type { ListMeta } from '../../../shared/auth/http'

/**
 * Stores feature — typed client for the real backend API
 * (`/api/v1/stores`, cookie-authed; endpoints in docs/API.md).
 *
 * A customer account can own multiple stores. Creation is minimal by
 * design: name required, logo optional (S3 upload lands later — until
 * then no logo is sent).
 */

export interface StoreTheme {
  backgroundColor: string
  primaryColor: string
  /** Links, prices & flat highlights. `null` = Auto (follows primary). */
  secondaryColor: string | null
  /** Cards & panels. `null` = Auto (derived from the background). */
  surfaceColor: string | null
  /**
   * Text on primary (CTA) buttons. `null` = Auto — white or near-black,
   * picked from the button color's luminance so the label stays readable.
   */
  buttonTextColor: string | null
}

/**
 * Storefront homepage sections. The owner controls both **order** and
 * visibility, so this is an ORDERED LIST, not a flag map. A section renders
 * only when it is enabled AND has content — enabling one never forces an empty
 * row to appear. The header/top bar is not a section (fixed chrome).
 */
export const HOMEPAGE_SECTION_KEYS = [
  'hero',
  'categories',
  'featured',
  'newArrivals',
  'bestSellers',
] as const

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number]

export interface HomepageSection {
  key: HomepageSectionKey
  enabled: boolean
}

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSection[] =
  HOMEPAGE_SECTION_KEYS.map((key) => ({ key, enabled: true }))

/**
 * Normalise the `homepage` JSON the server stores into an ordered section
 * list. Mirror of the backend `resolveHomepage`: tolerates null, the new
 * `{ sections }` shape (appending any newly-added key), and the legacy boolean
 * map. Keep the two in lockstep.
 */
export function resolveHomepage(raw: unknown): HomepageSection[] {
  const isKey = (k: unknown): k is HomepageSectionKey =>
    typeof k === 'string' &&
    (HOMEPAGE_SECTION_KEYS as readonly string[]).includes(k)

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.sections)) {
      const seen = new Set<HomepageSectionKey>()
      const out: HomepageSection[] = []
      for (const item of obj.sections) {
        const key = (item as { key?: unknown } | null)?.key
        if (isKey(key) && !seen.has(key)) {
          seen.add(key)
          out.push({
            key,
            enabled: (item as { enabled?: unknown }).enabled !== false,
          })
        }
      }
      for (const key of HOMEPAGE_SECTION_KEYS) {
        if (!seen.has(key)) out.push({ key, enabled: true })
      }
      return out
    }
    // Legacy boolean-map shape.
    return HOMEPAGE_SECTION_KEYS.map((key) => ({
      key,
      enabled: obj[key] !== false,
    }))
  }
  return DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s }))
}

// ---------------------------------------------------------------------------
// Footer — owner-managed storefront footer content
// ---------------------------------------------------------------------------

/**
 * One business location shown in the storefront footer. Address, mobile
 * number and email are required; the rest is optional. `lat`/`lng` come from
 * the management page's map picker (always both or neither) and power the
 * storefront's "View on Google Maps" link.
 */
export interface FooterLocation {
  /** Stable row id, minted by the server (null on a not-yet-saved row). */
  id: string | null
  /** Branch / location name, e.g. "Head Office". */
  label: string | null
  address: string
  contactPerson: string | null
  phone: string
  altPhone: string | null
  email: string
  /** Free-text business hours, e.g. "Mon–Sat, 9 AM – 8 PM". */
  hours: string | null
  isPrimary: boolean
  lat: number | null
  lng: number | null
}

/**
 * Social profiles. Facebook / Instagram / YouTube are the launch platforms;
 * the rest are future-ready — the storefront renders whichever are set.
 * `whatsapp` is a NUMBER (rendered as a wa.me link), not a URL.
 */
export const FOOTER_SOCIAL_KEYS = [
  'facebook',
  'instagram',
  'youtube',
  'whatsapp',
  'x',
  'linkedin',
  'telegram',
  'pinterest',
] as const

export type FooterSocialKey = (typeof FOOTER_SOCIAL_KEYS)[number]

export type FooterSocial = Record<FooterSocialKey, string | null>

export interface FooterInfo {
  /** Short business description ("About Us"). */
  about: string | null
  establishedYear: number | null
  gstNumber: string | null
  registrationNumber: string | null
}

export interface FooterSupport {
  email: string | null
  phone: string | null
  whatsapp: string | null
  hours: string | null
}

/**
 * Store policy links. The dedicated policy PAGES arrive in a later release —
 * until then each entry is an optional external URL, so the footer structure
 * supports policies from day one.
 */
export const FOOTER_POLICY_KEYS = [
  'privacy',
  'terms',
  'shipping',
  'returns',
  'cancellation',
] as const

export type FooterPolicyKey = (typeof FOOTER_POLICY_KEYS)[number]

export type FooterPolicies = Record<FooterPolicyKey, string | null>

/** A custom footer link (About Us, FAQ, Careers, Blog…). */
export interface FooterLink {
  label: string
  /** Full URL (https://…) or an in-app path starting with /. */
  url: string
}

/**
 * The full footer configuration. The server stores it as the `Store.footer`
 * JSON column and always returns it RESOLVED to this complete shape (missing
 * sections defaulted), so no client-side normalizer is needed.
 */
export interface StoreFooter {
  locations: FooterLocation[]
  social: FooterSocial
  info: FooterInfo
  support: FooterSupport
  policies: FooterPolicies
  links: FooterLink[]
  /**
   * Full custom copyright line. `null` = default — the storefront renders
   * "© {year} {store name}. All Rights Reserved."
   */
  copyrightText: string | null
}

export const EMPTY_FOOTER: StoreFooter = {
  locations: [],
  social: {
    facebook: null,
    instagram: null,
    youtube: null,
    whatsapp: null,
    x: null,
    linkedin: null,
    telegram: null,
    pinterest: null,
  },
  info: {
    about: null,
    establishedYear: null,
    gstNumber: null,
    registrationNumber: null,
  },
  support: { email: null, phone: null, whatsapp: null, hours: null },
  policies: {
    privacy: null,
    terms: null,
    shipping: null,
    returns: null,
    cancellation: null,
  },
  links: [],
  copyrightText: null,
}

/**
 * PATCH payload — any subset of the footer SECTIONS. A present section
 * replaces that section wholesale (the management page saves one card at a
 * time); absent sections are untouched.
 */
export type StoreFooterPatch = Partial<StoreFooter>

/**
 * Payment methods the store accepts — how customers PAY. Online payment is
 * processed by UnieMax (payouts go to the seller's primary bank account);
 * the actual gateway arrives with the payments module — these switches gate
 * what the checkout will offer. How customers RECEIVE the order lives in
 * the separate shipping settings (`StoreShipping`).
 */
export interface StorePayments {
  acceptOnlinePayment: boolean
  acceptCod: boolean
}

/** Server defaults: COD on (the Phase-1 method), online off. */
export const DEFAULT_PAYMENTS: StorePayments = {
  acceptOnlinePayment: false,
  acceptCod: true,
}

/**
 * Fulfilment mode — the seller delivers orders, lets customers pick up
 * from a business location, or both. Default DELIVERY.
 */
export type ShippingMode = 'DELIVERY' | 'PICKUP' | 'BOTH'

export interface StoreShipping {
  mode: ShippingMode
}

export const DEFAULT_SHIPPING: StoreShipping = { mode: 'DELIVERY' }

/**
 * Which customer fields this store's checkout collects — seller-toggled,
 * all default TRUE. A disabled field is hidden from the customer and
 * excluded from checkout validation. `name`/`phone`/`email` are CONTACT
 * fields (asked even for store pickup); the rest are DELIVERY fields
 * (skipped when the customer picks up).
 */
export const CHECKOUT_FIELD_KEYS = [
  'name',
  'phone',
  'email',
  'address',
  'pincode',
  'state',
  'country',
] as const

export type CheckoutFieldKey = (typeof CHECKOUT_FIELD_KEYS)[number]

export type StoreCheckoutFields = Record<CheckoutFieldKey, boolean>

export const DEFAULT_CHECKOUT_FIELDS: StoreCheckoutFields = {
  name: true,
  phone: true,
  email: true,
  address: true,
  pincode: true,
  state: true,
  country: true,
}

export interface Store {
  id: string
  name: string
  /** URL identity of the store (stable across renames) — used in share links. */
  slug: string
  logoUrl: string | null
  theme: StoreTheme
  /** Ordered homepage sections (order + per-section enabled). */
  homepage: HomepageSection[]
  /** Storefront footer content (always the complete resolved shape). */
  footer: StoreFooter
  /** Accepted payment methods (always the complete resolved shape). */
  payments: StorePayments
  /** Fulfilment mode (always the complete resolved shape). */
  shipping: StoreShipping
  /** Checkout field toggles (always the complete resolved shape). */
  checkout: StoreCheckoutFields
  /** Whether the store's public page is live for customers. */
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

/**
 * The storefront "shell" — branding + the category tree, and deliberately
 * **no products**. Fetched once per store and reused by every storefront page,
 * so it stays small and cacheable however big the catalog is. Products are
 * queried per page through `publicStoreApi.listProducts`.
 */
export interface PublicStore {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  theme: StoreTheme
  /**
   * False only when the viewer is the store's owner looking at an
   * unpublished store (the draft preview) — for anyone else an unpublished
   * store is a plain 404. Drives the "draft preview" banner.
   */
  isPublished: boolean
  /** Owner-managed footer content (always the complete resolved shape). */
  footer: StoreFooter
  /** Accepted payment methods — what the checkout can offer. */
  payments: StorePayments
  /** Fulfilment mode — delivery, pickup or both. */
  shipping: StoreShipping
  /** Which customer fields this store's checkout collects. */
  checkout: StoreCheckoutFields
  /** Root categories that have something shoppable, newest-first by creation. */
  categories: PublicCategory[]
}

export interface PublicCategory {
  id: string
  name: string
  /** URL identity — /store/{storeSlug}/category/{slug}. */
  slug: string
  /** Owner-picked for the homepage "Featured Categories" row. */
  isFeatured: boolean
  /** Visible products in this category *including* its subcategories. */
  productCount: number
  subcategories: PublicSubcategory[]
}

export interface PublicSubcategory {
  id: string
  name: string
  slug: string
  productCount: number
}

/**
 * A product as a listing card needs it. Variants are represented only by a
 * COUNT — the listing never renders them (that belongs on the product page),
 * which is what keeps a page of a thousand-product catalog small.
 */
export interface PublicProduct {
  id: string
  name: string
  slug: string
  description: string | null
  /** Cheapest sellable variant ("From ₹X"). Decimal serialized as a string. */
  price: string | null
  priceMax: string | null
  /** Total stock across sellable variants. */
  stockQuantity: number
  /** Real options only; 0 means a simple product with no picker. */
  variantCount: number
  category: { name: string; slug: string }
  /** Cover image (first by display order), or null while no image exists. */
  image: { url: string | null; altText: string | null } | null
}

/** One gallery item on the public product page. */
export interface PublicProductMediaItem {
  id: string
  type: 'IMAGE' | 'VIDEO'
  url: string | null
  altText: string | null
}

export interface PublicStoreVariant {
  id: string
  name: string
  /** Every variant carries its own price (the variant is the unit of sale). */
  price: string
  stockQuantity: number
}

/** Full product detail — the only payload that carries variants. */
export interface PublicProductDetail {
  id: string
  name: string
  slug: string
  description: string | null
  price: string | null
  priceMax: string | null
  stockQuantity: number
  category: {
    name: string
    slug: string
    parent: { name: string; slug: string } | null
  }
  /** Empty for a simple product (the implicit Default is never exposed). */
  variants: PublicStoreVariant[]
  /** Gallery, ordered: images by display order (first = cover), video last. */
  media: PublicProductMediaItem[]
  related: PublicProduct[]
}

/** Category page header + breadcrumb ancestry. */
export interface PublicCategoryDetail {
  id: string
  name: string
  slug: string
  parent: { name: string; slug: string } | null
  subcategories: PublicSubcategory[]
}

/** Homepage merchandising payload. */
export interface PublicStoreHome {
  /**
   * The owner's ordered section list — drives BOTH what renders and in what
   * order. Disabled sections arrive with their data array empty.
   */
  sections: HomepageSection[]
  featuredCategories: PublicCategory[]
  featured: PublicProduct[]
  newArrivals: PublicProduct[]
  bestSellers: PublicProduct[]
}

export type PublicSort =
  | 'newest'
  | 'popular'
  | 'bestselling'
  | 'price-asc'
  | 'price-desc'
  | 'alphabetical'

/**
 * Homepage merchandising sections a listing can be scoped to — each maps to
 * exactly one owner-controlled flag (same rule as the homepage rows). Target
 * of the homepage "View all" links.
 */
export type PublicSection = 'featured' | 'newArrivals' | 'bestSellers'

export const SECTION_TITLES: Record<PublicSection, string> = {
  featured: 'Featured Products',
  newArrivals: 'New Arrivals',
  bestSellers: 'Best Sellers',
}

/** Everything narrows server-side; nothing is filtered in the browser. */
export interface PublicProductQuery {
  /** Category SLUG — a root also covers its subcategories. */
  category?: string
  q?: string
  /** Scope to one homepage merchandising section. */
  section?: PublicSection
  sort?: PublicSort
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  page?: number
  pageSize?: number
}

/** "4999" → "₹4,999" · "499.5" → "₹499.50" (en-IN grouping). */
export function formatPrice(price: string | number): string {
  const value = Number(price)
  if (Number.isNaN(value)) return `₹${price}`
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export const DEFAULT_THEME: StoreTheme = {
  backgroundColor: '#f9fafb',
  // The platform's Primary Purple — a store that never opens Appearance
  // still looks like it belongs to UnieMax. Mirrors DEFAULT_STORE_THEME in
  // the backend's `stores.schema.ts`.
  primaryColor: '#6c3ef4',
  secondaryColor: null,
  surfaceColor: null,
  buttonTextColor: null,
}

const STORES = '/api/v1/stores'
const PUBLIC_STORES = '/api/v1/public/stores'

/** Wire shape: theme/homepage are free JSON columns server-side. */
type RawStore = Omit<
  Store,
  'theme' | 'homepage' | 'footer' | 'payments' | 'shipping' | 'checkout'
> & {
  theme: Partial<StoreTheme> | null
  homepage: unknown
  footer?: StoreFooter | null
  payments?: StorePayments | null
  shipping?: StoreShipping | null
  checkout?: StoreCheckoutFields | null
}
type RawPublicStore = Omit<
  PublicStore,
  'theme' | 'footer' | 'payments' | 'shipping' | 'checkout'
> & {
  theme: Partial<StoreTheme> | null
  footer?: StoreFooter | null
  payments?: StorePayments | null
  shipping?: StoreShipping | null
  checkout?: StoreCheckoutFields | null
}

/** Guarantees complete theme/homepage values regardless of what the row holds. */
function normalize(raw: RawStore): Store {
  return {
    ...raw,
    theme: { ...DEFAULT_THEME, ...(raw.theme ?? {}) },
    homepage: resolveHomepage(raw.homepage),
    // The server resolves footer/payments to their full shapes; the fallback
    // only guards against an older backend still in flight during a deploy.
    footer: raw.footer ?? EMPTY_FOOTER,
    payments: raw.payments ?? DEFAULT_PAYMENTS,
    shipping: raw.shipping ?? DEFAULT_SHIPPING,
    checkout: raw.checkout ?? DEFAULT_CHECKOUT_FIELDS,
  }
}

function normalizePublic(raw: RawPublicStore): PublicStore {
  return {
    ...raw,
    theme: { ...DEFAULT_THEME, ...(raw.theme ?? {}) },
    footer: raw.footer ?? EMPTY_FOOTER,
    payments: raw.payments ?? DEFAULT_PAYMENTS,
    shipping: raw.shipping ?? DEFAULT_SHIPPING,
    checkout: raw.checkout ?? DEFAULT_CHECKOUT_FIELDS,
  }
}

/** The customer-facing URL a store is shared at (public storefront page). */
export function publicStoreUrl(slug: string): string {
  return `${window.location.origin}/store/${slug}`
}

export const storesApi = {
  async list(): Promise<Store[]> {
    return (await call<RawStore[]>(http.get(STORES))).map(normalize)
  },

  async create(input: { name: string }): Promise<Store> {
    return normalize(await call<RawStore>(http.post(STORES, input)))
  },

  async get(storeId: string): Promise<Store> {
    return normalize(await call<RawStore>(http.get(`${STORES}/${storeId}`)))
  },

  async update(storeId: string, patch: { name?: string }): Promise<Store> {
    return normalize(await call<RawStore>(http.patch(`${STORES}/${storeId}`, patch)))
  },

  /** Upload/replace the store logo (multipart to the dedicated logo bucket). */
  async uploadLogo(
    storeId: string,
    file: Blob,
    filename: string,
    onProgress?: (fraction: number) => void,
  ): Promise<Store> {
    const form = new FormData()
    form.append('file', file, filename)
    return normalize(
      await call<RawStore>(
        http.put(`${STORES}/${storeId}/logo`, form, {
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(e.loaded / e.total)
          },
        }),
      ),
    )
  },

  async removeLogo(storeId: string): Promise<Store> {
    return normalize(await call<RawStore>(http.delete(`${STORES}/${storeId}/logo`)))
  },

  async updateTheme(
    storeId: string,
    patch: Partial<StoreTheme>,
  ): Promise<Store> {
    return normalize(
      await call<RawStore>(http.patch(`${STORES}/${storeId}/theme`, patch)),
    )
  },

  /**
   * Set the storefront homepage section order + visibility. Sends the FULL
   * ordered list (reorder and toggle are the same write); the server requires
   * a complete permutation of the known sections.
   */
  async updateHomepage(
    storeId: string,
    sections: HomepageSection[],
  ): Promise<Store> {
    return normalize(
      await call<RawStore>(
        http.patch(`${STORES}/${storeId}/homepage`, { sections }),
      ),
    )
  },

  /**
   * Update the storefront footer. Sends any subset of the footer sections —
   * each present section replaces that section wholesale (the Footer page
   * saves one card at a time); absent sections are untouched.
   */
  async updateFooter(storeId: string, patch: StoreFooterPatch): Promise<Store> {
    return normalize(
      await call<RawStore>(http.patch(`${STORES}/${storeId}/footer`, patch)),
    )
  },

  /** Update the payment acceptance switches (partial — absent keys kept). */
  async updatePayments(
    storeId: string,
    patch: Partial<StorePayments>,
  ): Promise<Store> {
    return normalize(
      await call<RawStore>(http.patch(`${STORES}/${storeId}/payments`, patch)),
    )
  },

  /** Update which checkout fields the store collects (partial merge). */
  async updateCheckout(
    storeId: string,
    patch: Partial<StoreCheckoutFields>,
  ): Promise<Store> {
    return normalize(
      await call<RawStore>(http.patch(`${STORES}/${storeId}/checkout`, patch)),
    )
  },

  /** Set the fulfilment mode (Delivery / Pickup / Both). */
  async updateShipping(storeId: string, mode: ShippingMode): Promise<Store> {
    return normalize(
      await call<RawStore>(http.patch(`${STORES}/${storeId}/shipping`, { mode })),
    )
  },

  /** Seller dashboard — order counters + latest orders for one store. */
  async getDashboard(storeRef: string): Promise<StoreDashboard> {
    return call<StoreDashboard>(http.get(`${STORES}/${storeRef}/dashboard`))
  },

  /** Toggle the store's public page live/offline. */
  async setPublished(storeId: string, isPublished: boolean): Promise<Store> {
    return normalize(
      await call<RawStore>(
        http.patch(`${STORES}/${storeId}/publish`, { isPublished }),
      ),
    )
  },
}

// ---------------------------------------------------------------------------
// Seller dashboard
// ---------------------------------------------------------------------------

/**
 * Order counters + latest orders for one store. `pending` are new orders;
 * `processing` (CONFIRMED + PACKED) / `shipped` / `completed` follow the
 * seller status lifecycle (progressed from the Orders section) and
 * `refunded` counts refunded payments.
 */
export interface StoreDashboard {
  stats: {
    today: number
    pending: number
    processing: number
    shipped: number
    completed: number
    cancelled: number
    refunded: number
    totalOrders: number
    /** Sum of non-cancelled order totals — decimal string. */
    revenue: string
  }
  recentOrders: SellerOrderSummary[]
}

// ---------------------------------------------------------------------------
// Payout bank accounts
// ---------------------------------------------------------------------------

/**
 * Verification lifecycle of a payout account. Accounts start PENDING; the
 * third-party account-validation and the UnieMax admin panel (both future)
 * move them to VERIFIED/FAILED. Editing a verified account's bank details
 * resets it to PENDING.
 */
export type BankVerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED'
export type BankVerificationMethod = 'THIRD_PARTY' | 'MANUAL'

/**
 * A seller payout account. Exactly one per store is `isPrimary` — that
 * account alone receives payouts from UnieMax when customers pay through
 * the platform.
 */
export interface StoreBankAccount {
  id: string
  accountHolderName: string
  accountNumber: string
  ifsc: string
  bankName: string
  branch: string
  upiId: string | null
  isPrimary: boolean
  verificationStatus: BankVerificationStatus
  verificationMethod: BankVerificationMethod | null
  /** Failure reason / admin note — set by the (future) verification flows. */
  verificationNote: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BankAccountDetails {
  accountHolderName: string
  accountNumber: string
  ifsc: string
  bankName: string
  branch: string
  upiId: string | null
}

export interface BankAccountInput extends BankAccountDetails {
  /** Make this the payout account (the first account is primary automatically). */
  isPrimary?: boolean
}

/**
 * Payout bank accounts of one store (`storeRef` = id or slug). Capped at 5;
 * updating any bank detail resets the account's verification to PENDING.
 */
export const storeBankApi = {
  async list(storeRef: string): Promise<StoreBankAccount[]> {
    return call<StoreBankAccount[]>(
      http.get(`${STORES}/${storeRef}/bank-accounts`),
    )
  },

  async create(
    storeRef: string,
    input: BankAccountInput,
  ): Promise<StoreBankAccount> {
    return call<StoreBankAccount>(
      http.post(`${STORES}/${storeRef}/bank-accounts`, input),
    )
  },

  async update(
    storeRef: string,
    accountId: string,
    patch: Partial<BankAccountDetails> & { isPrimary?: true },
  ): Promise<StoreBankAccount> {
    return call<StoreBankAccount>(
      http.patch(`${STORES}/${storeRef}/bank-accounts/${accountId}`, patch),
    )
  },

  /** Promote an account to primary (the only way to demote the current one). */
  async setPrimary(
    storeRef: string,
    accountId: string,
  ): Promise<StoreBankAccount> {
    return this.update(storeRef, accountId, { isPrimary: true })
  },

  async remove(storeRef: string, accountId: string): Promise<void> {
    await call(http.delete(`${STORES}/${storeRef}/bank-accounts/${accountId}`))
  },
}

// ---------------------------------------------------------------------------
// Store catalog (categories + products inside one store)
// ---------------------------------------------------------------------------

export interface StoreCategory {
  id: string
  name: string
  /** URL identity, generated on create and stable across renames. */
  slug: string
  /** Parent category id — null for root categories (one level of nesting). */
  parentId: string | null
  /** Disabled categories (and everything inside) are hidden from the public storefront. */
  isActive: boolean
  /** Shows this root category in the storefront homepage's Featured row. */
  isFeatured: boolean
  productCount: number
  subcategoryCount: number
  createdAt: string
}

/**
 * Owner-controlled merchandising. Each flag maps to exactly ONE storefront
 * homepage section — a product shows in a section if and only if that flag is
 * set. `hideFromSearch` is separate: it hides the product from search while
 * leaving it browsable in its category.
 */
export interface StoreProductMerchandising {
  isFeatured: boolean
  isBestSeller: boolean
  isNewArrival: boolean
  hideFromSearch: boolean
}

export interface StoreProductVariant {
  id: string
  name: string
  /** Decimal on the wire. Every variant carries its own price. */
  price: string
  stockQuantity: number
  /** Disabled variants are hidden from the public storefront. */
  isActive: boolean
  createdAt: string
}

/**
 * One media item of a product — up to 8 images + 1 video. `url` is derived
 * server-side from storage configuration (the DB stores only object keys).
 * The image with the lowest displayOrder is the COVER image.
 */
export interface StoreProductMediaItem {
  id: string
  type: 'IMAGE' | 'VIDEO'
  url: string | null
  altText: string | null
  displayOrder: number
}

/**
 * The variant is the unit of sale, so a product has no price column of its
 * own — `price` / `priceMax` / `stockQuantity` are **derived** from its
 * variants. A product with no options still has exactly one variant behind
 * the scenes (the implicit "Default"), surfaced here as `defaultVariant`.
 */
export interface StoreProduct extends StoreProductMerchandising {
  id: string
  name: string
  /** URL identity, generated on create and stable across renames. */
  slug: string
  description: string | null
  /** Cheapest variant price ("from" price). Decimal serialized as a string. */
  price: string | null
  /** Dearest variant price — equal to `price` unless options differ. */
  priceMax: string | null
  /** Total stock across variants. */
  stockQuantity: number
  /** False when the product only carries its implicit Default variant. */
  hasVariants: boolean
  /** The implicit variant of an option-less product (null once options exist). */
  defaultVariant: { id: string; price: string; stockQuantity: number } | null
  /** Disabled products are hidden from the public storefront. */
  isActive: boolean
  category: { id: string; name: string; parentId: string | null }
  /** Real options only — the Default variant is never listed here. */
  variants: StoreProductVariant[]
  /** Ordered media: images by displayOrder (first = cover), video last. */
  media: StoreProductMediaItem[]
  createdAt: string
}

export interface StoreVariantInput {
  name: string
  /** Required — a variant always sets its own price. */
  price: number
  stockQuantity: number
}

/**
 * `hasVariants` picks the product shape:
 *   false → `price` + `stockQuantity` required, `variants` omitted.
 *   true  → `variants` required (≥ 1), `price`/`stockQuantity` omitted.
 */
export interface StoreProductCreateInput {
  name: string
  categoryId: string
  description?: string
  hasVariants: boolean
  price?: number
  stockQuantity?: number
  variants?: StoreVariantInput[]
}

/**
 * Catalog endpoints of one store (`storeRef` = store id or slug). Products
 * require a category of the same store, so a category must be created
 * before the first product — the enforced setup sequence.
 */
export const storeCatalogApi = {
  async listCategories(storeRef: string): Promise<StoreCategory[]> {
    return call<StoreCategory[]>(http.get(`${STORES}/${storeRef}/categories`))
  },

  async createCategory(
    storeRef: string,
    name: string,
    parentId?: string,
  ): Promise<StoreCategory> {
    return call<StoreCategory>(
      http.post(`${STORES}/${storeRef}/categories`, {
        name,
        ...(parentId ? { parentId } : {}),
      }),
    )
  },

  async setCategoryActive(
    storeRef: string,
    categoryId: string,
    isActive: boolean,
  ): Promise<StoreCategory> {
    return call<StoreCategory>(
      http.patch(`${STORES}/${storeRef}/categories/${categoryId}`, { isActive }),
    )
  },

  /** Feature a root category on the storefront homepage. */
  async setCategoryFeatured(
    storeRef: string,
    categoryId: string,
    isFeatured: boolean,
  ): Promise<StoreCategory> {
    return call<StoreCategory>(
      http.patch(`${STORES}/${storeRef}/categories/${categoryId}`, {
        isFeatured,
      }),
    )
  },

  /** Rename a category (same PATCH endpoint as the active toggle). */
  async renameCategory(
    storeRef: string,
    categoryId: string,
    name: string,
  ): Promise<StoreCategory> {
    return call<StoreCategory>(
      http.patch(`${STORES}/${storeRef}/categories/${categoryId}`, { name }),
    )
  },

  async deleteCategory(storeRef: string, categoryId: string): Promise<void> {
    await call(http.delete(`${STORES}/${storeRef}/categories/${categoryId}`))
  },

  async listProducts(storeRef: string): Promise<StoreProduct[]> {
    return call<StoreProduct[]>(http.get(`${STORES}/${storeRef}/products`))
  },

  async createProduct(
    storeRef: string,
    input: StoreProductCreateInput,
  ): Promise<StoreProduct> {
    return call<StoreProduct>(http.post(`${STORES}/${storeRef}/products`, input))
  },

  /**
   * Partial product update — editable details (name, description, category),
   * the storefront visibility switch and/or any of the merchandising flags
   * (one endpoint serves the whole row). `description: null` clears it. The
   * slug never changes on rename (stable public URL).
   */
  async updateProduct(
    storeRef: string,
    productId: string,
    patch: Partial<StoreProductMerchandising> & {
      isActive?: boolean
      name?: string
      description?: string | null
      categoryId?: string
    },
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.patch(`${STORES}/${storeRef}/products/${productId}`, patch),
    )
  },

  async deleteProduct(storeRef: string, productId: string): Promise<void> {
    await call(http.delete(`${STORES}/${storeRef}/products/${productId}`))
  },

  // Variants — every mutation returns the full parent product (variants
  // included), so callers can replace one product row in place.

  async createVariant(
    storeRef: string,
    productId: string,
    input: StoreVariantInput,
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.post(`${STORES}/${storeRef}/products/${productId}/variants`, input),
    )
  },

  async updateVariant(
    storeRef: string,
    productId: string,
    variantId: string,
    patch: {
      name?: string
      price?: number | null
      stockQuantity?: number
      isActive?: boolean
    },
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.patch(
        `${STORES}/${storeRef}/products/${productId}/variants/${variantId}`,
        patch,
      ),
    )
  },

  async deleteVariant(
    storeRef: string,
    productId: string,
    variantId: string,
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.delete(
        `${STORES}/${storeRef}/products/${productId}/variants/${variantId}`,
      ),
    )
  },

  // Media — up to 8 images + 1 video per product; first image = cover. Like
  // variants, every mutation returns the full parent product.

  /** Upload one image or video (the file's content type decides which). */
  async addProductMedia(
    storeRef: string,
    productId: string,
    file: Blob,
    filename: string,
    onProgress?: (fraction: number) => void,
  ): Promise<StoreProduct> {
    const form = new FormData()
    form.append('file', file, filename)
    return call<StoreProduct>(
      http.post(`${STORES}/${storeRef}/products/${productId}/media`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total)
        },
      }),
    )
  },

  /** Swap a media item's file, keeping its position and alt text. */
  async replaceProductMediaFile(
    storeRef: string,
    productId: string,
    mediaId: string,
    file: Blob,
    filename: string,
    onProgress?: (fraction: number) => void,
  ): Promise<StoreProduct> {
    const form = new FormData()
    form.append('file', file, filename)
    return call<StoreProduct>(
      http.put(
        `${STORES}/${storeRef}/products/${productId}/media/${mediaId}/file`,
        form,
        {
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(e.loaded / e.total)
          },
        },
      ),
    )
  },

  /** Set or clear (null) a media item's alt text. */
  async updateProductMediaAlt(
    storeRef: string,
    productId: string,
    mediaId: string,
    altText: string | null,
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.patch(
        `${STORES}/${storeRef}/products/${productId}/media/${mediaId}`,
        { altText },
      ),
    )
  },

  /** Persist the full image order — the first id becomes the cover. */
  async reorderProductMedia(
    storeRef: string,
    productId: string,
    mediaIds: string[],
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.put(`${STORES}/${storeRef}/products/${productId}/media/order`, {
        mediaIds,
      }),
    )
  },

  async deleteProductMedia(
    storeRef: string,
    productId: string,
    mediaId: string,
  ): Promise<StoreProduct> {
    return call<StoreProduct>(
      http.delete(
        `${STORES}/${storeRef}/products/${productId}/media/${mediaId}`,
      ),
    )
  },
}

/**
 * Anonymous storefront lookups — no session required. Split by page so a
 * large catalog is never fetched in one go: `getBySlug` returns the shell
 * (branding + category tree) once, and products are queried per page.
 */
export const publicStoreApi = {
  /**
   * Store shell by slug; 404 for unknown or unpublished stores — except for
   * the signed-in owner, who receives their unpublished store as a draft
   * preview (`isPublished: false`).
   */
  async getBySlug(slug: string): Promise<PublicStore> {
    return normalizePublic(
      await call<RawPublicStore>(http.get(`${PUBLIC_STORES}/${slug}`)),
    )
  },

  async getHome(slug: string): Promise<PublicStoreHome> {
    return call<PublicStoreHome>(http.get(`${PUBLIC_STORES}/${slug}/home`))
  },

  /** Server-paginated product listing (category page + search results). */
  async listProducts(
    slug: string,
    query: PublicProductQuery = {},
  ): Promise<{ items: PublicProduct[]; meta: ListMeta }> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value))
    }
    const qs = params.toString()
    return callList<PublicProduct>(
      http.get(`${PUBLIC_STORES}/${slug}/products${qs ? `?${qs}` : ''}`),
    )
  },

  async getCategory(
    slug: string,
    categorySlug: string,
  ): Promise<PublicCategoryDetail> {
    return call<PublicCategoryDetail>(
      http.get(`${PUBLIC_STORES}/${slug}/categories/${categorySlug}`),
    )
  },

  async getProduct(
    slug: string,
    productSlug: string,
  ): Promise<PublicProductDetail> {
    return call<PublicProductDetail>(
      http.get(`${PUBLIC_STORES}/${slug}/products/${productSlug}`),
    )
  },
}

// ---------------------------------------------------------------------------
// Orders — placement + confirmation lookup (guest checkout, no auth)
// ---------------------------------------------------------------------------

export interface OrderItemInput {
  productId: string
  /** Chosen option id — null for simple products. */
  variantId: string | null
  quantity: number
}

/**
 * Order payload. Items carry references + quantities only — the server
 * re-prices everything from the live catalog and re-checks stock, so stale
 * cart snapshots can never buy at an old price.
 */
export interface OrderCreateInput {
  fulfilment: 'DELIVERY' | 'PICKUP'
  paymentMethod: 'ONLINE' | 'COD'
  customer: {
    name?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    pincode?: string | null
    state?: string | null
    country?: string | null
  }
  items: OrderItemInput[]
}

export interface PlacedOrderItem {
  id: string
  productName: string
  variantName: string | null
  productSlug: string | null
  imageUrl: string | null
  /** Decimal strings on the wire. */
  unitPrice: string
  quantity: number
  lineTotal: string
}

/** The order lifecycle. Sellers move orders forward; CANCELLED sits apart. */
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export interface PlacedOrder {
  id: string
  orderNumber: string
  status: OrderStatus
  storeName: string
  storeSlug: string
  fulfilment: 'DELIVERY' | 'PICKUP'
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  addressLine: string | null
  pincode: string | null
  state: string | null
  country: string | null
  subtotal: string
  shippingCharge: string
  total: string
  paymentMethod: 'ONLINE' | 'COD'
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  /** "DEV-SIMULATED" on development-mode online payments. */
  paymentRef: string | null
  placedAt: string
  /** Lifecycle stamps — null until the seller reaches that stage (a skipped
   *  stage, e.g. SHIPPED on a pickup order, stays null forever). */
  confirmedAt: string | null
  packedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  /** Optional seller note captured on cancellation. */
  cancelReason: string | null
  items: PlacedOrderItem[]
  /** Cashfree session for an ONLINE order awaiting payment — feed it to the
   *  web SDK's checkout(). Null/absent on COD, simulated and read paths. */
  payment?: PaymentSession | null
}

/** A live Cashfree payment session (drives @cashfreepayments/cashfree-js). */
export interface PaymentSession {
  paymentSessionId: string
  cfOrderId: string
  /** Which SDK environment to load. */
  mode: 'sandbox' | 'production'
}

/** "Pay now" answer — PAID means the money already landed (nothing to do). */
export type PaySessionResult =
  | { paymentStatus: 'PAID' }
  | { paymentStatus: 'PENDING'; payment: PaymentSession }

export const publicOrderApi = {
  /**
   * Place the order (201). Server-side gates: published store only, method/
   * fulfilment must be seller-enabled, required checkout fields validated
   * per the store's config, stock re-checked. With the gateway configured,
   * ONLINE orders return `payment.paymentSessionId` for the Cashfree SDK;
   * without it dev simulates the payment and production answers 503.
   */
  async place(slug: string, input: OrderCreateInput): Promise<PlacedOrder> {
    return call<PlacedOrder>(
      http.post(`${PUBLIC_STORES}/${slug}/orders`, input),
    )
  },

  /** Confirmation lookup by the order's unguessable id (guest-friendly). */
  async get(slug: string, orderId: string): Promise<PlacedOrder> {
    return call<PlacedOrder>(
      http.get(`${PUBLIC_STORES}/${slug}/orders/${orderId}`),
    )
  },

  /**
   * Pay now / retry payment on an unpaid ONLINE order (signed-in owner
   * only). Reuses the active Cashfree session or registers a new attempt.
   */
  async paySession(slug: string, orderId: string): Promise<PaySessionResult> {
    return call<PaySessionResult>(
      http.post(`${PUBLIC_STORES}/${slug}/orders/${orderId}/pay`),
    )
  },
}

/** Launch the Cashfree hosted checkout — navigates away on success. */
export async function launchCashfreeCheckout(
  payment: PaymentSession,
): Promise<void> {
  const { load } = await import('@cashfreepayments/cashfree-js')
  const cashfree = await load({ mode: payment.mode })
  await cashfree.checkout({
    paymentSessionId: payment.paymentSessionId,
    redirectTarget: '_self',
  })
}

// ---------------------------------------------------------------------------
// Seller order management (/stores/:id/orders — owner-scoped)
// ---------------------------------------------------------------------------

/** Lean list row — the shape of the orders list and dashboard rows. */
export interface SellerOrderSummary {
  id: string
  orderNumber: string
  status: OrderStatus
  fulfilment: 'DELIVERY' | 'PICKUP'
  customerName: string | null
  paymentMethod: 'ONLINE' | 'COD'
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  /** Decimal string. */
  total: string
  placedAt: string
  itemCount: number
}

export interface SellerOrderListQuery {
  status?: OrderStatus
  /** Matches order number or customer name/phone. */
  q?: string
  page?: number
  pageSize?: number
}

export const sellerOrderApi = {
  /** The store's orders, newest first (server-paginated + filtered). */
  async list(
    storeRef: string,
    query: SellerOrderListQuery = {},
  ): Promise<{ items: SellerOrderSummary[]; meta: ListMeta }> {
    return callList<SellerOrderSummary>(
      http.get(`${STORES}/${storeRef}/orders`, { params: query }),
    )
  },

  /** One order, full shape (items, customer, payment, lifecycle stamps). */
  async get(storeRef: string, orderId: string): Promise<PlacedOrder> {
    return call<PlacedOrder>(
      http.get(`${STORES}/${storeRef}/orders/${orderId}`),
    )
  },

  /**
   * Move the order forward (confirm → pack → ship → deliver; jumps ahead are
   * allowed, never backwards). Delivering a COD order also marks it paid.
   */
  async updateStatus(
    storeRef: string,
    orderId: string,
    status: 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED',
  ): Promise<PlacedOrder> {
    return call<PlacedOrder>(
      http.patch(`${STORES}/${storeRef}/orders/${orderId}/status`, { status }),
    )
  },

  /**
   * Cancel the order (only before it ships) — restores stock; a paid
   * (dev-simulated) payment flips to refunded.
   */
  async cancel(
    storeRef: string,
    orderId: string,
    reason: string | null,
  ): Promise<PlacedOrder> {
    return call<PlacedOrder>(
      http.post(`${STORES}/${storeRef}/orders/${orderId}/cancel`, { reason }),
    )
  },
}

// --- Storefront URL builders (one place that knows the route shape) --------

/**
 * The combined cart. `from` is the slug of the store the visitor opens the
 * cart FROM — carried as `?from=` so /cart can continue that store's theme.
 * The context lives in the URL (not storage) on purpose: history back/
 * forward, refresh and multiple tabs all restore the right theme for free.
 * Omit it from marketplace surfaces — the cart then renders neutral.
 */
export const cartUrl = (from?: string | null) =>
  from ? `/cart?from=${encodeURIComponent(from)}` : '/cart'

export const storeHomeUrl = (storeSlug: string) => `/store/${storeSlug}`
/** Help & Support WITH THIS SHOP — answered by the seller, not by UnieMax. */
export const storeSupportUrl = (storeSlug: string) =>
  `/store/${storeSlug}/support`
export const storeCategoryUrl = (storeSlug: string, categorySlug: string) =>
  `/store/${storeSlug}/category/${categorySlug}`
export const storeProductUrl = (storeSlug: string, productSlug: string) =>
  `/store/${storeSlug}/product/${productSlug}`
/**
 * Browse-all page; doubles as the search results page when `q` is given and
 * as a section listing (the homepage "View all" target) when `section` is.
 */
export const storeShopUrl = (
  storeSlug: string,
  opts: { q?: string; section?: PublicSection } = {},
) => {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  if (opts.section) params.set('section', opts.section)
  const qs = params.toString()
  return `/store/${storeSlug}/shop${qs ? `?${qs}` : ''}`
}
