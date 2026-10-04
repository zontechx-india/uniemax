import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  publicStoreApi,
  storeCategoryUrl,
  type PublicCategoryDetail,
  type PublicStore,
} from '../../features/stores/storesApi'
import {
  StorePageShell,
  usePublicStore,
} from '../../features/publicStore/PublicStoreLayout'
import { useSeo } from '../../../shared/seo'
import {
  breadcrumbJsonLd,
  categoryTrail,
} from '../../features/publicStore/structuredData'
import { ProductListing } from '../../features/publicStore/ProductListing'
import type { Crumb } from '../../features/publicStore/ListingControls'
import { findCategory } from '../../features/publicStore/shopShape'

/**
 * A category page is the shop's best shot at a "<thing> in <shop>" query, so
 * its snippet names what is actually on the shelf — the subcategories when it
 * has them, the product count when it does not. Both come free from the
 * payload the page already fetches.
 */
function useCategorySeo(
  store: PublicStore,
  categorySlug: string,
  category: PublicCategoryDetail | null | undefined,
) {
  const children = category?.subcategories.map((sub) => sub.name).join(', ') ?? ''
  const draft = !store.isPublished

  useSeo({
    title: category ? [category.name, store.name] : [store.name],
    description: category
      ? children
        ? `${category.name} at ${store.name} — ${children}. Order online with delivery or store pickup on UnieMax.`
        : `Shop ${category.name} at ${store.name} on UnieMax. Order online with delivery or store pickup.`
      : null,
    canonical: storeCategoryUrl(store.slug, categorySlug),
    image: store.shareImageUrl,
    robots: draft || category === null ? 'noindex, follow' : null,
    jsonLd:
      category && !draft
        ? breadcrumbJsonLd(store, categoryTrail(store.slug, category))
        : null,
  })
}

/**
 * `/store/{storeSlug}/category/{categorySlug}` — a dedicated page per
 * category, replacing the old "one page filters everything" model.
 *
 * A category shows its subcategories as chips (each its own page) and lists
 * products from itself and everything beneath it.
 */
export function StoreCategoryPage() {
  const { store, skin } = usePublicStore()
  const { categorySlug = '' } = useParams()
  const [category, setCategory] = useState<
    PublicCategoryDetail | null | undefined
  >(undefined)
  useCategorySeo(store, categorySlug, category)

  useEffect(() => {
    let cancelled = false
    setCategory(undefined)
    publicStoreApi
      .getCategory(store.slug, categorySlug)
      .then((found) => {
        if (!cancelled) setCategory(found)
      })
      .catch(() => {
        if (!cancelled) setCategory(null)
      })
    return () => {
      cancelled = true
    }
  }, [store.slug, categorySlug])

  if (category === undefined) {
    return (
      <StorePageShell>
        <p className={`py-16 text-center text-sm ${skin.muted}`}>Loading…</p>
      </StorePageShell>
    )
  }

  if (category === null) {
    return (
      <StorePageShell>
        <div className="py-16 text-center">
          <h1 className={`font-heading text-lg font-bold ${skin.text}`}>
            Category not found
          </h1>
          <p className={`mt-2 text-sm ${skin.muted}`}>
            It may have been renamed or removed.
          </p>
          <Link
            to={`/store/${store.slug}`}
            className={`mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-bold ${skin.cta}`}
          >
            Back to store
          </Link>
        </div>
      </StorePageShell>
    )
  }

  // A single subcategory holding everything here is not a choice — the chip
  // would open the same products again ("Office & Business" → "Printing 4").
  const total = findCategory(store.categories, category.id)?.productCount ?? null
  const subcategories =
    category.subcategories.length === 1 &&
    total !== null &&
    category.subcategories[0]!.productCount >= total
      ? []
      : category.subcategories

  const trail: Crumb[] = [
    ...category.ancestors.map((crumb) => ({
      label: crumb.name,
      to: storeCategoryUrl(store.slug, crumb.slug),
    })),
    { label: category.name },
  ]

  return (
    <ProductListing
      store={store}
      skin={skin}
      title={category.name}
      trail={trail}
      category={category.slug}
    >
      {subcategories.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {subcategories.map((sub) => (
            <li key={sub.id}>
              <Link
                to={storeCategoryUrl(store.slug, sub.slug)}
                className={`flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors hover:border-brand ${skin.border} ${skin.chip} ${skin.text}`}
              >
                {sub.name}
                <span className={`text-[11px] font-bold ${skin.muted}`}>
                  {sub.productCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ProductListing>
  )
}
