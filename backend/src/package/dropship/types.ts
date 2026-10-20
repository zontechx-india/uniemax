import type { PrismaClient } from "../../generated/prisma/client.js";

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

export interface DropshipDeps {
  prisma: PrismaClient;
  host: DropshipHost;
}
