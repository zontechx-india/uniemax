import { resolveShipping } from "../stores/stores.schema.js";
import { resolveOptionTypes, resolveOptionValues } from "../stores/storeCatalog.schema.js";
import { sortByOptionOrder } from "../stores/productOptions.js";
import {
  effectiveProductShipping,
  resolveProductShippingOverride,
} from "../stores/shippingRates.js";
import { productMetaDescription } from "./productText.js";
import { absoluteUrl, storeProductPath } from "./structuredData.js";

/**
 * The product feed — every publicly visible product on the marketplace, in
 * Google's RSS 2.0 product-data format (`g:` namespace). One file serves both
 * **Google Merchant Center** (free listings on the Shopping tab, Images,
 * YouTube) and the **Meta catalogue** (Facebook/Instagram Shops, ads), which
 * reads the same format.
 *
 * ## What an item says, and why it must match the page
 *
 * Merchant Center crawls each `link` and suspends items — eventually the
 * account — when the feed and the landing page disagree. So every value here
 * is what the product page shows **when it first opens**:
 *
 * - **Price** — the page opens on the first in-stock variant in option order
 *   (`firstSellableSelection` in the frontend's `productOptions.ts`), else the
 *   first variant; a simple product shows its single price. The feed quotes
 *   that same variant. A strike-through MRP above it becomes `g:price` with
 *   the selling price as `g:sale_price`, which is how Google shows a discount.
 * - **Availability** — that variant's stock (the page disables Buy at 0).
 * - **Shipping** — the rate the page advertises (`effectiveProductShipping`):
 *   the product's override, else the store's rate, FREE above the store's
 *   `freeAbove` threshold.
 *
 * ## What is left out
 *
 * Same visibility predicates as the storefront and the sitemaps, plus:
 * "Hide from Search" products (the seller asked not to be found by search),
 * and products with no photo (an item without `image_link` is rejected).
 *
 * ## Facts the platform does not have yet
 *
 * - **Brand / GTIN** — products have no brand or barcode field (SEO roadmap
 *   step 2). `g:brand` is the store name, the same stand-in the `Product`
 *   JSON-LD uses, and `g:identifier_exists` is `no`, which is the honest
 *   answer for a product without a GTIN/MPN.
 * - **Condition** — every listing on the platform is sold new; there is no
 *   used/refurbished field, so `g:condition` is `new`.
 */

/** Merchant Center's per-item cap on extra photos. */
export const MAX_ADDITIONAL_IMAGES = 10;
/** Field limits from the product-data spec; longer values are rejected. */
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;


// Rows in, XML out — no database here, so `test/unit/product-feed.test.ts`
// can cover it; the query lives in `productFeed.service.ts`.

type Money = { toString(): string } | number | string;

export interface FeedProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  optionTypes: unknown;
  shippingOverride: unknown;
  category: { name: string };
  globalCategory: { name: string } | null;
  store: { name: string; slug: string; shipping: unknown };
  variants: {
    price: Money;
    compareAtPrice: Money | null;
    stockQuantity: number;
    optionValues: unknown;
    isDefault: boolean;
  }[];
  /** Image URLs (absolute or `/uploads/...`), gallery order, cover first. */
  images: string[];
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  price: number;
  salePrice: number | null;
  inStock: boolean;
  brand: string;
  productType: string;
  shippingPrice: number;
}

/**
 * The variant the product page opens on — a port of the frontend's
 * `firstSellableSelection` over `sortByOptionOrder`. A simple product has
 * only its implicit Default variant, which is the one it sells.
 */
export function landingVariant(row: FeedProductRow): FeedProductRow["variants"][number] | null {
  const optionTypes = resolveOptionTypes(row.optionTypes);
  const options = row.variants.filter((variant) => !variant.isDefault);
  if (options.length === 0) return row.variants[0] ?? null;
  const ordered = sortByOptionOrder(
    optionTypes,
    options.map((variant) => ({
      ...variant,
      optionValues: resolveOptionValues(variant.optionValues),
    })),
  );
  return ordered.find((variant) => variant.stockQuantity > 0) ?? ordered[0] ?? null;
}

/** Whole rupees stay whole; paise are kept to two places. */
function rupees(value: Money): number {
  return Math.round(Number(value.toString()) * 100) / 100;
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** One row → one feed item, or null when the row cannot make a valid item. */
export function toFeedItem(row: FeedProductRow, origin: string): FeedItem | null {
  const variant = landingVariant(row);
  if (!variant) return null;
  const [cover, ...rest] = row.images;
  if (!cover) return null;

  const selling = rupees(variant.price);
  if (!Number.isFinite(selling) || selling <= 0) return null;
  const mrp = variant.compareAtPrice === null ? null : rupees(variant.compareAtPrice);
  const discounted = mrp !== null && Number.isFinite(mrp) && mrp > selling;

  const rate = effectiveProductShipping(
    resolveProductShippingOverride(row.shippingOverride),
    resolveShipping(row.store.shipping).rate,
  );
  const shippingPrice =
    rate.type === "FREE" || (rate.freeAbove !== null && selling >= rate.freeAbove)
      ? 0
      : rate.amount;

  return {
    id: row.id,
    title: clip(row.name, MAX_TITLE),
    description: clip(
      productMetaDescription(
        {
          name: row.name,
          description: row.description,
          price: String(selling),
          category: row.category,
        },
        row.store.name,
      ),
      MAX_DESCRIPTION,
    ),
    link: absoluteUrl(storeProductPath(row.store.slug, row.slug), origin),
    imageLink: absoluteUrl(cover, origin),
    additionalImageLinks: rest
      .slice(0, MAX_ADDITIONAL_IMAGES)
      .map((image) => absoluteUrl(image, origin)),
    price: discounted ? (mrp as number) : selling,
    salePrice: discounted ? selling : null,
    inStock: variant.stockQuantity > 0,
    brand: clip(row.store.name, 70),
    productType: [row.globalCategory?.name, row.category.name]
      .filter((name): name is string => Boolean(name))
      .filter((name, index, all) => all.indexOf(name) === index)
      .join(" > "),
    shippingPrice,
  };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escapes markup and drops the control characters XML 1.0 forbids — a seller
 * pasting from a PDF can bring in a stray \u000b, and one such character makes
 * Merchant Center reject the whole file, not the one item.
 */
function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

const money = (value: number) => `${value.toFixed(2)} INR`;

export function renderProductFeed(items: FeedItem[], origin: string): string {
  const tag = (name: string, value: string) => `<g:${name}>${escapeXml(value)}</g:${name}>`;
  const body = items
    .map((item) =>
      [
        "<item>",
        tag("id", item.id),
        tag("title", item.title),
        tag("description", item.description),
        tag("link", item.link),
        tag("image_link", item.imageLink),
        ...item.additionalImageLinks.map((link) => tag("additional_image_link", link)),
        tag("availability", item.inStock ? "in_stock" : "out_of_stock"),
        tag("price", money(item.price)),
        ...(item.salePrice !== null ? [tag("sale_price", money(item.salePrice))] : []),
        tag("condition", "new"),
        tag("brand", item.brand),
        tag("identifier_exists", "no"),
        ...(item.productType ? [tag("product_type", item.productType)] : []),
        `<g:shipping>${tag("country", "IN")}${tag("price", money(item.shippingPrice))}</g:shipping>`,
        "</item>",
      ].join(""),
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>UnieMax</title><link>${escapeXml(`${origin}/`)}</link>` +
    `<description>Products from independent stores on UnieMax</description>` +
    body +
    `</channel></rss>`
  );
}
