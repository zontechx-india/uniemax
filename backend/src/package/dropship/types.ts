import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

/**
 * What the dropship package needs from the platform it runs inside.
 * `hosts/inProcess.ts` answers from the core database today; a standalone
 * service would answer over HTTP and nothing above this interface changes.
 * Phase 2 people and stores, Phase 3 copies, Phase 4 orders and parcels
 * (docs/dropshipping/architecture/context.md).
 */
export interface DropshipHost {
  getStore(storeId: string): Promise<StoreRef | null>;
  getStores(storeIds: string[]): Promise<StoreRef[]>;
  /** A store the customer owns, by id or slug. Throws 404 otherwise. */
  getOwnedStore(customerId: string, storeRef: string): Promise<StoreRef>;
  listOwnedStores(customerId: string): Promise<StoreRef[]>;
  /** An unpublished store with no logo, for a supplier joining without one (D-28). */
  createSupplyStore(customerId: string, input: SupplyStoreInput): Promise<StoreRef>;
  /** The store's own COD switch, turned on in place from the invite sheet (SU-6). */
  setStoreCod(customerId: string, storeId: string, on: boolean): Promise<void>;
  /** The store's own products with their options' shop prices. */
  listStoreProducts(storeId: string): Promise<ProductRef[]>;
  getStoreProducts(storeId: string, productIds: string[]): Promise<ProductRef[]>;
  getCustomer(customerId: string): Promise<CustomerRef | null>;

  // ---- Phase 3: copies ----------------------------------------------------
  /** Everything a copy mirrors from a product; the effective delivery rule included. */
  getProductSnapshots(productIds: string[]): Promise<ProductSnapshot[]>;
  /** The store's fulfilment mode and its default delivery charge. */
  getStoreSelling(storeId: string): Promise<StoreSelling>;
  listShelves(storeId: string): Promise<ShelfRef[]>;
  /** The shelf for a taxonomy category, creating it (and its parents) if missing (D-32). */
  ensureShelf(customerId: string, storeId: string, globalCategoryId: string): Promise<string>;
  /** Home delivery switched on in place for a pickup-only store (C-22). */
  setStoreDelivery(customerId: string, storeId: string, amount: number): Promise<void>;
  /** Copies one stored object to a new key in the same bucket; null when the source is gone. */
  copyMedia(key: string, toStoreId: string): Promise<string | null>;
  removeMedia(keys: string[]): Promise<void>;
  createCopy(tx: Tx, input: CopyInput): Promise<{ productId: string; variantIds: string[] }>;
  updateCopy(tx: Tx, productId: string, patch: CopyPatch): Promise<void>;
  addCopyVariant(tx: Tx, productId: string, variant: CopyVariantInput): Promise<string>;
  /** Swap a copy's photos and description for new ones (refresh, C-20). */
  replaceCopyContent(
    tx: Tx,
    productId: string,
    content: { description: string | null; media: CopyMediaInput[] },
  ): Promise<string[]>;
  /** The copy's own product row: on/off, name, variants' current prices. */
  getCopyState(productId: string): Promise<CopyState | null>;
  /** An order's store and the products on its lines (stock moved on a supplier's own sale). */
  getOrderLines(orderId: string): Promise<{ storeId: string | null; productIds: string[] } | null>

  // ---- Phase 4: orders and parcels ---------------------------------------
  /** The order being placed, read inside its own transaction (`order.placing`). */
  getPlacingOrder(tx: Tx, orderId: string): Promise<PlacingOrder | null>;
  /** Conditional decrement of a variant's stock (K-1, K-2); false = not enough left. */
  reserveStock(tx: Tx, variantId: string, quantity: number): Promise<boolean>;
  releaseStock(tx: Tx, variantId: string, quantity: number): Promise<void>;
  /**
   * Takes the row locks on the stock of every line of an order — the lines' own variants —
   * so a hook that is about to touch the supplier's stock does so in the core's lock order
   * (the line's variant first, then the supplier's). Changes nothing.
   */
  lockOrderStock(tx: Tx, orderId: string): Promise<void>;
  /** The supplier's own SKUs, for its packing slips. */
  getVariantSkus(tx: Tx, variantIds: string[]): Promise<Map<string, string | null>>;
  /** Marks order lines as shipped by another party (`OrderItem.fulfilledBy`). */
  tagItems(tx: Tx, orderItemIds: string[]): Promise<void>;
  getOrderViews(orderIds: string[]): Promise<OrderView[]>;
  /** A parcel of package lines; the customer is told at once (D-4). Returns its id. */
  createShipment(input: {
    orderId: string;
    orderItemIds: string[];
    tracking: TrackingInput;
    senderName: string;
    externalRef: string;
  }): Promise<string>;
  updateShipmentTracking(shipmentId: string, tracking: TrackingInput): Promise<void>;
  markShipmentDelivered(shipmentId: string, podKey: string | null): Promise<void>;
  markShipmentReturned(shipmentId: string): Promise<void>;
  /** The customer order, confirmed / cancelled by the system (the seller's rules, no store scope). */
  confirmOrder(orderId: string): Promise<void>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  // ---- Phase 6: payouts (Easy Split) — sandbox today, PaymentHub later (D-44) ---------
  /** Whether payouts can be split right now (the provider is ready). */
  splitLive(): boolean;
  /** Which stores can be paid out to. Sandbox: a primary bank account that isn't FAILED (D-45). */
  getPayoutAccounts(storeIds: string[]): Promise<Map<string, { active: boolean }>>;
  /** One request per order, idempotent by key. Throws `HostSplitError` when it can't be done. */
  requestSplit(orderId: string, entries: SplitEntry[], key: string): Promise<{ ref: string }>;
  /** Debit or credit a store's payout balance (the COD platform fee). Idempotent by key. */
  adjustPayout(storeId: string, direction: "DEBIT" | "CREDIT", amount: Prisma.Decimal, key: string): Promise<{ ref: string }>;
  /** A support ticket to UnieMax about an order (F-9). Returns its id. */
  openTicket(customerId: string, storeId: string, subject: string, message: string): Promise<string>;
  notify(customerId: string, message: HostNotification): void;
  sendMail(message: HostMail): Promise<void>;
  /** Storefront origin used in emails and share links; null when unknown. */
  webUrl: string | null;
}

export interface StoreRef {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  logoUrl: string | null;
  isPublished: boolean;
  suspended: boolean;
  acceptCod: boolean;
  /** The business phone and email from the store's profile. */
  phone: string | null;
  email: string | null;
  hasAddress: boolean;
  /** The business address on one line (a supplier's return address on its slips). */
  address: string | null;
}

export interface SupplyStoreInput {
  name: string;
  phone: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
    country: string;
    lat: number | null;
    lng: number | null;
  };
}

export interface ProductRef {
  id: string;
  name: string;
  isActive: boolean;
  imageUrl: string | null;
  variants: {
    id: string;
    name: string;
    isDefault: boolean;
    isActive: boolean;
    /** Shop price, Decimal as a string. */
    price: string;
    stock: number;
  }[];
}

export interface CustomerRef {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface HostNotification {
  title: string;
  body: string;
  url?: string;
}

export interface HostMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Tx = Prisma.TransactionClient;

export interface DeliveryRuleRef {
  type: "ALL" | "INCLUDE" | "EXCLUDE";
  pincodes: string[];
}

export interface OptionTypeRef {
  name: string;
  values: string[];
}

export interface ProductSnapshot {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  specifications: unknown;
  isActive: boolean;
  globalCategoryId: string | null;
  globalCategoryName: string | null;
  optionTypes: OptionTypeRef[];
  deliveryRule: DeliveryRuleRef;
  media: { id: string; key: string; type: "IMAGE" | "VIDEO"; altText: string | null; displayOrder: number }[];
  variants: {
    id: string;
    name: string;
    isDefault: boolean;
    isActive: boolean;
    price: string;
    /** MRP, Decimal as a string; null when unset. */
    compareAtPrice: string | null;
    stock: number;
    optionValues: Record<string, string> | null;
    sku: string | null;
    mediaId: string | null;
  }[];
}

export interface StoreSelling {
  mode: "DELIVERY" | "PICKUP" | "BOTH";
  rate: { type: "FREE" | "FLAT"; amount: number; freeAbove: number | null };
}

export interface ShelfRef {
  id: string;
  name: string;
  globalCategoryId: string | null;
}

export interface CopyMediaInput {
  key: string;
  type: "IMAGE" | "VIDEO";
  altText: string | null;
  displayOrder: number;
}

export interface CopyVariantInput {
  name: string;
  isDefault: boolean;
  optionValues: Record<string, string> | null;
  price: string;
  compareAtPrice: string | null;
  stockQuantity: number;
  isActive: boolean;
  /** Index into the copy's media list for the option's photo. */
  mediaIndex: number | null;
}

export interface CopyInput {
  storeId: string;
  shelfId: string;
  globalCategoryId: string | null;
  name: string;
  description: string | null;
  specifications: unknown;
  optionTypes: OptionTypeRef[];
  deliveryRule: DeliveryRuleRef;
  codAvailable: boolean;
  isActive: boolean;
  media: CopyMediaInput[];
  variants: CopyVariantInput[];
}

export interface CopyPatch {
  optionTypes?: OptionTypeRef[];
  deliveryRule?: DeliveryRuleRef;
  codAvailable?: boolean;
  isActive?: boolean;
  variants?: {
    variantId: string;
    name?: string;
    optionValues?: Record<string, string> | null;
    price?: string;
    compareAtPrice?: string | null;
    stockQuantity?: number;
    isActive?: boolean;
  }[];
}

export interface CopyState {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
  hasImage: boolean;
  variants: { id: string; name: string; price: string; isActive: boolean }[];
}

export interface DropshipDeps {
  prisma: PrismaClient;
  host: DropshipHost;
}

// ---- Phase 4 -------------------------------------------------------------

export interface PlacingOrder {
  id: string;
  orderNumber: string;
  storeId: string | null;
  paymentMethod: "COD" | "ONLINE";
  /** Already paid at placement (the dev build without gateway keys, K-12). */
  paid: boolean;
  total: Prisma.Decimal;
  lines: {
    itemId: string;
    productId: string | null;
    /** The variant whose stock the line took: its own, or the product's Default. */
    stockVariantId: string | null;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }[];
}

/** Courier and tracking as the core's parcel form takes them (validated there). */
export interface TrackingInput {
  carrierCode: string;
  carrierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}

export interface ParcelRef {
  id: string;
  carrierCode: string | null;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date;
  deliveredAt: Date | null;
  returnedAt: Date | null;
}

/** What the package shows of a customer order. Never the customer's email. */
export interface OrderView {
  id: string;
  orderNumber: string;
  storeId: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: "COD" | "ONLINE";
  total: Prisma.Decimal;
  shippingCharge: Prisma.Decimal;
  customerName: string | null;
  customerPhone: string | null;
  addressLine: string | null;
  pincode: string | null;
  state: string | null;
  country: string | null;
  createdAt: Date;
  items: { id: string; fulfilledBy: string | null; shipmentId: string | null; lineTotal: Prisma.Decimal; imageKey: string | null }[];
  parcels: ParcelRef[];
}

// ---- Phase 6 --------------------------------------------------------------

export interface SplitEntry {
  /** The store (a Cashfree vendor, D-22) that gets this amount. */
  storeId: string;
  role: "SUPPLIER" | "SELLER";
  amount: Prisma.Decimal;
}

/** Why a split or an adjustment couldn't be done. `INSUFFICIENT`: the vendor's balance is too low. */
export class HostSplitError extends Error {
  constructor(
    public code: "FAILED" | "INSUFFICIENT" | "NO_ACCOUNT",
    message: string,
  ) {
    super(message);
  }
}
