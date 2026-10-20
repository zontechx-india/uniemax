import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

/**
 * What the dropship package needs from the platform it runs inside.
 * `hosts/inProcess.ts` answers from the core database today; a standalone
 * service would answer over HTTP and nothing above this interface changes.
 * Phase 2 subset — later phases add copies, stock, orders and parcels
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
