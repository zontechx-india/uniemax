import type { FooterLocation, StoreFooter } from "../stores/stores.schema.js";
import type { getPublicProduct } from "../stores/publicStore.service.js";

/**
 * schema.org JSON-LD for the page shells.
 *
 * A **port** of `frontend/src/storefront/features/publicStore/structuredData.ts`
 * — the SPA writes the same blocks after mount, and the two must agree, so a
 * change to one side belongs in the other. The only structural difference is
 * that URLs are made absolute against an explicit `origin` (there is no
 * `window.location` here).
 *
 * The same two rules hold: **never invent a fact** (no reviews exist, so no
 * `aggregateRating`) and **omit rather than guess** (`prune` drops empties —
 * an absent optional is valid, an empty string is a validation error).
 */

export type Json = Record<string, unknown>;

type PublicProduct = Awaited<ReturnType<typeof getPublicProduct>>;

/** The store fields the blocks read — satisfied by the public store shell. */
export interface StoreFacts {
  name: string;
  slug: string;
  logoUrl: string | null;
  footer: StoreFooter;
}

export const storeHomePath = (storeSlug: string) => `/store/${storeSlug}`;
export const storeCategoryPath = (storeSlug: string, categorySlug: string) =>
  `/store/${storeSlug}/category/${categorySlug}`;
export const storeProductPath = (storeSlug: string, productSlug: string) =>
  `/store/${storeSlug}/product/${productSlug}`;

/** Absolute URL from an app path, a `/uploads/...` path or an already-absolute URL. */
export function absoluteUrl(value: string, origin: string): string {
  try {
    return new URL(value, origin).href;
  } catch {
    return value;
  }
}

/** Drops null/undefined/empty entries so no field is emitted blank. */
function prune(object: Json): Json {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === null || value === undefined || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

/**
 * The store as a `Store` (LocalBusiness) when it has a postal address,
 * otherwise as an `Organization` — LocalBusiness without `address` is invalid.
 */
export function storeJsonLd(store: StoreFacts, origin: string): Json {
  const { footer } = store;
  const primary =
    footer.locations.find((location) => location.isPrimary) ?? footer.locations[0] ?? null;
  const logo = store.logoUrl ? absoluteUrl(store.logoUrl, origin) : null;

  const base = prune({
    name: store.name,
    url: absoluteUrl(storeHomePath(store.slug), origin),
    logo,
    image: logo,
    description: footer.info.about,
    email: footer.support.email ?? primary?.email ?? null,
    telephone: footer.support.phone ?? primary?.phone ?? null,
    sameAs: Object.entries(footer.social)
      .filter(([platform, value]) => value && platform !== "whatsapp")
      .map(([, value]) => value as string),
    foundingDate: footer.info.establishedYear ? String(footer.info.establishedYear) : null,
    parentOrganization: { "@type": "Organization", name: "UnieMax" },
  });

  if (!primary) return { "@context": "https://schema.org", "@type": "Organization", ...base };

  return {
    "@context": "https://schema.org",
    "@type": "Store",
    ...base,
    ...prune({
      address: postalAddress(primary),
      geo:
        primary.lat !== null && primary.lng !== null
          ? { "@type": "GeoCoordinates", latitude: primary.lat, longitude: primary.lng }
          : null,
      openingHours: footer.support.hours ?? primary.hours ?? null,
    }),
  };
}

/** The footer address is one free-text block — never split into invented parts. */
function postalAddress(location: FooterLocation): Json {
  return {
    "@type": "PostalAddress",
    streetAddress: location.address,
    addressCountry: "IN",
  };
}

/**
 * The delivery charge for the quoted price, as `OfferShippingDetails` — or
 * `null` when it cannot be stated honestly:
 *
 *  - a pickup-only store does not ship at all;
 *  - delivery limited to some pincodes cannot be written as "ships to IN",
 *    and the pincode lists are never published.
 *
 * The amount is what the product page advertises (`product.shipping`, its
 * override else the store rate), FREE once the price reaches the store's
 * free-above threshold — the same rule the product feed applies. No
 * `deliveryTime`: sellers set no handling or transit times.
 */
function shippingDetails(
  mode: string,
  product: Pick<PublicProduct, "shipping" | "delivery">,
  price: number,
): Json | null {
  if (mode === "PICKUP" || product.delivery.restricted || !Number.isFinite(price)) return null;
  const { type, amount, freeAbove } = product.shipping;
  const charge = type === "FREE" || (freeAbove !== null && price >= freeAbove) ? 0 : amount;
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: charge, currency: "INR" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
  };
}

/**
 * `Product` + `Offer` — an `AggregateOffer` across the sellable variants for
 * an option product, a single `Offer` for a simple one.
 *
 * No `hasMerchantReturnPolicy` here on purpose: the platform policy
 * (`/refund-policy`) excludes whole kinds of product (food, innerwear,
 * custom-made) and products carry no "returnable" flag, so a per-product
 * claim would be false for some. The policy is stated once, on the
 * platform's `Organization` (`platformOrganizationJsonLd`).
 */
export function productJsonLd(
  store: { name: string; slug: string; shippingMode: string },
  product: PublicProduct,
  description: string | null,
  origin: string,
): Json {
  const url = absoluteUrl(storeProductPath(store.slug, product.slug), origin);
  const inStock = product.stockQuantity > 0;
  const availability = `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`;
  const seller = { "@type": "Organization", name: store.name };
  // Every listing on the platform is sold new (no used/refurbished field) —
  // the same fact the product feed states as `g:condition`.
  const itemCondition = "https://schema.org/NewCondition";

  const prices = product.variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price));
  const low = prices.length ? Math.min(...prices) : Number(product.price);
  const high = prices.length ? Math.max(...prices) : Number(product.priceMax ?? product.price);
  const shipping = shippingDetails(store.shippingMode, product, low);

  const offers =
    product.variants.length > 1 && prices.length > 1
      ? prune({
          "@type": "AggregateOffer",
          url,
          priceCurrency: "INR",
          lowPrice: Number.isFinite(low) ? low : null,
          highPrice: Number.isFinite(high) ? high : null,
          offerCount: product.variants.length,
          availability,
          itemCondition,
          shippingDetails: shipping,
          seller,
        })
      : prune({
          "@type": "Offer",
          url,
          priceCurrency: "INR",
          price: Number.isFinite(low) ? low : null,
          availability,
          itemCondition,
          shippingDetails: shipping,
          seller,
        });

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    ...prune({
      name: product.name,
      description,
      url,
      sku: product.sku,
      category: product.category.name,
      // No brand field exists on a product; the store is the closest honest
      // stand-in (same choice as the SPA).
      brand: { "@type": "Brand", name: store.name },
      image: product.media
        .filter((item) => item.type === "IMAGE" && item.url)
        .map((item) => absoluteUrl(item.url as string, origin)),
      additionalProperty: product.specifications.map((spec) => ({
        "@type": "PropertyValue",
        name: spec.label,
        value: spec.value,
      })),
      offers,
    }),
  };
}

/**
 * UnieMax itself, for the homepage: the name and logo Google may show for the
 * site, and the one return policy that covers every order
 * (`/refund-policy`, `RefundPolicy` in `InfoComingSoonPage.tsx` — change
 * both together). Only what that page states: 7 days from delivery, sent
 * back by courier, in India. Return fees are left out — they depend on the
 * reason (free for damaged, the customer's postage otherwise) and the
 * postage has no fixed amount. No `sameAs`: there are no official social
 * profiles to list.
 */
export function platformOrganizationJsonLd(origin: string): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "UnieMax",
    url: absoluteUrl("/", origin),
    logo: absoluteUrl("/pwa-512.png", origin),
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "IN",
      returnPolicyCountry: "IN",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
      returnMethod: "https://schema.org/ReturnByMail",
      merchantReturnLink: absoluteUrl("/refund-policy", origin),
    },
  };
}

/** A `BreadcrumbList` from root-first `{ name, path }` hops. */
export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
  origin: string,
): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, origin),
    })),
  };
}

/** The store's own breadcrumb: the store first, then the given trail. */
export function storeBreadcrumbJsonLd(
  store: { name: string; slug: string },
  trail: { name: string; path: string }[],
  origin: string,
): Json {
  return breadcrumbJsonLd([{ name: store.name, path: storeHomePath(store.slug) }, ...trail], origin);
}

/** The category ancestry as breadcrumb hops — root first, the page last. */
export function categoryTrail(
  storeSlug: string,
  category: { name: string; slug: string; ancestors: { name: string; slug: string }[] },
): { name: string; path: string }[] {
  return [...category.ancestors, { name: category.name, slug: category.slug }].map((hop) => ({
    name: hop.name,
    path: storeCategoryPath(storeSlug, hop.slug),
  }));
}
