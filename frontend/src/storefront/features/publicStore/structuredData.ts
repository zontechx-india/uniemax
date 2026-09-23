import {
  storeCategoryUrl,
  storeHomeUrl,
  storeProductUrl,
  type FooterLocation,
  type PublicProductDetail,
  type PublicStore,
} from '../stores/storesApi'

/**
 * schema.org JSON-LD for the public storefront.
 *
 * This is the part of SEO that pays off fastest for a marketplace: a
 * `Product` block is what turns a plain blue link into a result carrying a
 * price, a stock state and (once reviews exist) stars — and Google reads it
 * from the rendered DOM, so it works today without server rendering.
 *
 * Two rules everything here follows:
 *
 *  - **Never invent a fact.** There is no review system yet, so no
 *    `aggregateRating` / `review` is emitted. Claiming either is a manual
 *    action against the whole domain, not just the page.
 *  - **Omit rather than guess.** A field with no real value is left out
 *    (`prune` below), because an empty string is a validation error while an
 *    absent optional field is simply absent.
 */

type Json = Record<string, unknown>

/** Drops null/undefined/empty entries so no field is emitted blank. */
function prune(object: Json): Json {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === null || value === undefined || value === '') return false
      if (Array.isArray(value) && value.length === 0) return false
      return true
    }),
  )
}

function absolute(path: string): string {
  try {
    return new URL(path, window.location.origin).href
  } catch {
    return path
  }
}

/**
 * The store as a schema.org entity.
 *
 * A store with a real postal address is a `Store` (a LocalBusiness subtype)
 * — that is what can earn a knowledge panel and map presence for "cricket
 * bat shop <city>" queries, which is the local intent a small seller can
 * realistically win. Without an address it degrades to `Organization`:
 * LocalBusiness without `address` is invalid, not merely incomplete.
 */
export function storeJsonLd(store: PublicStore): Json {
  const primary =
    store.footer.locations.find((location) => location.isPrimary) ??
    store.footer.locations[0] ??
    null

  const base = prune({
    name: store.name,
    url: absolute(storeHomeUrl(store.slug)),
    logo: store.logoUrl ? absolute(store.logoUrl) : null,
    image: store.logoUrl ? absolute(store.logoUrl) : null,
    description: store.footer.info.about,
    email: store.footer.support.email ?? primary?.email ?? null,
    telephone: store.footer.support.phone ?? primary?.phone ?? null,
    sameAs: Object.entries(store.footer.social)
      .filter(([platform, value]) => value && platform !== 'whatsapp')
      .map(([, value]) => value as string),
    foundingDate: store.footer.info.establishedYear
      ? String(store.footer.info.establishedYear)
      : null,
    // The storefront is a page inside UnieMax, not a standalone site — say so
    // rather than letting Google guess at the relationship.
    parentOrganization: { '@type': 'Organization', name: 'UnieMax' },
  })

  if (!primary) return { '@context': 'https://schema.org', '@type': 'Organization', ...base }

  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    ...base,
    ...prune({
      address: postalAddress(primary),
      geo:
        primary.lat !== null && primary.lng !== null
          ? {
              '@type': 'GeoCoordinates',
              latitude: primary.lat,
              longitude: primary.lng,
            }
          : null,
      openingHours: store.footer.support.hours ?? primary.hours ?? null,
    }),
  }
}

/**
 * The footer address is one free-text block plus a location label — the
 * seller never breaks it into street/city/region, so neither does this. A
 * `streetAddress` carrying the whole thing with `addressCountry: IN` is
 * valid and honest; splitting it on commas would invent structure.
 */
function postalAddress(location: FooterLocation): Json {
  return {
    '@type': 'PostalAddress',
    streetAddress: location.address,
    addressCountry: 'IN',
  }
}

/**
 * `Product` + `Offer`. An option product quotes an `AggregateOffer` across
 * its sellable variants (the "from ₹X" the listing already shows); a simple
 * product quotes the single `Offer`.
 */
export function productJsonLd(
  store: PublicStore,
  product: PublicProductDetail,
  description: string | null,
): Json {
  const url = absolute(storeProductUrl(store.slug, product.slug))
  const inStock = product.stockQuantity > 0
  const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`
  const seller = { '@type': 'Organization', name: store.name }

  const prices = product.variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price))
  const low = prices.length ? Math.min(...prices) : Number(product.price)
  const high = prices.length ? Math.max(...prices) : Number(product.priceMax ?? product.price)

  const offers =
    product.variants.length > 1 && prices.length > 1
      ? prune({
          '@type': 'AggregateOffer',
          url,
          priceCurrency: 'INR',
          lowPrice: Number.isFinite(low) ? low : null,
          highPrice: Number.isFinite(high) ? high : null,
          offerCount: product.variants.length,
          availability,
          seller,
        })
      : prune({
          '@type': 'Offer',
          url,
          priceCurrency: 'INR',
          price: Number.isFinite(low) ? low : null,
          availability,
          seller,
        })

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    ...prune({
      name: product.name,
      description,
      url,
      sku: product.sku,
      category: product.category.name,
      // The store is the closest thing to a brand the data model has — there
      // is no brand field on a product, and omitting `brand` entirely costs
      // Merchant Center eligibility.
      brand: { '@type': 'Brand', name: store.name },
      image: product.media
        .filter((item) => item.type === 'IMAGE' && item.url)
        .map((item) => absolute(item.url as string)),
      // Seller specifications ("Material: Memory foam") map exactly onto
      // additionalProperty — free, and it is what Google reads for the
      // product-details enrichment in Shopping results.
      additionalProperty: product.specifications.map((spec) => ({
        '@type': 'PropertyValue',
        name: spec.label,
        value: spec.value,
      })),
      offers,
    }),
  }
}

/**
 * `BreadcrumbList` from the trail the page already renders. Google replaces
 * the ugly URL under a result with this, which measurably lifts click-through
 * on deep paths like /store/rahul-sports/product/mrf-genius-bat.
 */
export function breadcrumbJsonLd(
  store: PublicStore,
  trail: { name: string; path: string }[],
): Json {
  const items = [{ name: store.name, path: storeHomeUrl(store.slug) }, ...trail]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  }
}

/** The category ancestry as breadcrumb hops — root first, the page last. */
export function categoryTrail(
  storeSlug: string,
  category: { name: string; slug: string; ancestors: { name: string; slug: string }[] },
): { name: string; path: string }[] {
  return [...category.ancestors, { name: category.name, slug: category.slug }].map(
    (hop) => ({ name: hop.name, path: storeCategoryUrl(storeSlug, hop.slug) }),
  )
}
