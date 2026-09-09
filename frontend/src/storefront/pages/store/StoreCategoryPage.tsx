import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  publicStoreApi,
  storeCategoryUrl,
  type PublicCategoryDetail,
} from '../../features/stores/storesApi'
import {
  StorePageShell,
  usePublicStore,
} from '../../features/publicStore/PublicStoreLayout'
import { usePageTitle } from '../../../shared/usePageTitle'
import { ProductListing } from '../../features/publicStore/ProductListing'
import type { Crumb } from '../../features/publicStore/ListingControls'

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
  usePageTitle(category?.name, store.name)

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
      {category.subcategories.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {category.subcategories.map((sub) => (
            <li key={sub.id}>
              <Link
                to={storeCategoryUrl(store.slug, sub.slug)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-brand ${skin.border} ${skin.chip} ${skin.text}`}
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
