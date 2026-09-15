import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * What the affiliate package needs from the platform it runs inside.
 * Today `hosts/inProcess.ts` answers these straight from the core database;
 * when the package becomes its own service an HTTP host answers them instead,
 * and nothing above this interface changes.
 */
export interface AffiliateHost {
  getStore(storeId: string): Promise<StoreRef | null>;
  /** A store the customer owns, by id or slug. Throws 404 otherwise. */
  getOwnedStore(customerId: string, storeRef: string): Promise<StoreRef>;
  listProducts(
    storeId: string,
    query: ProductQuery,
  ): Promise<{ items: ProductRef[]; total: number }>;
  getProducts(storeId: string, ids: string[]): Promise<ProductRef[]>;
  getOrder(orderId: string): Promise<OrderSnapshot | null>;
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
  isPublished: boolean;
}

export interface ProductQuery {
  q?: string | undefined;
  page: number;
  pageSize: number;
}

export interface ProductRef {
  id: string;
  name: string;
  slug: string;
  price: number | null;
  imageUrl: string | null;
}

export interface OrderSnapshot {
  id: string;
  orderNumber: string;
  storeId: string | null;
  storeName: string;
  customerId: string | null;
  status: string;
  paymentStatus: string;
  affiliateRef: string | null;
  deliveredAt: Date | null;
  items: {
    id: string;
    productId: string | null;
    productName: string;
    quantity: number;
    /** Decimal as a string so the snapshot stays plain JSON. */
    lineTotal: string;
  }[];
}

export interface CustomerRef {
  id: string;
  name: string | null;
  email: string | null;
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

export interface AffiliateDeps {
  prisma: PrismaClient;
  host: AffiliateHost;
}
