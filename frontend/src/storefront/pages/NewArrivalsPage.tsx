import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ListMeta } from '../../shared/auth/http'
import { useSeo } from '../../shared/seo'
import { buttonClass } from '../../shared/ui/Button'
import { EmptyState, ErrorState } from '../../shared/ui/states'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type { MarketProduct } from '../features/discovery/discoveryApi'
import {
  ListingHeader,
  ListingPagination,
  ListingSkeleton,
  MarketProductCard,
  PRODUCT_LISTING_GRID,
} from '../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
import { BoxIcon } from '../layout/icons'

/** Full rows at 2, 3 and 4 columns. */
const PAGE_SIZE = 24

/**
 * `/new` — the homepage's Fresh Finds rail in full: the newest products
 * across every published store, newest first (`GET /public/products`). Only
 * one order exists — the API has no popularity data to sort by — so there is
 * no sort control. Page 2+ is `noindex, follow`.
 */
export function NewArrivalsPage() {
  const [params] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  const [data, setData] = useState<{ items: MarketProduct[]; meta: ListMeta } | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setData(null)
    discoveryApi
      .newProductsPage({ page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [page, attempt])

  useSeo({
    title: ['Fresh Finds', 'New products'],
    description:
      'The newest products from independent shops on UnieMax — buy direct from the seller with cash on delivery or secure online payment.',
    canonical: '/new',
    robots: page > 1 ? 'noindex, follow' : null,
  })

  if (data === null && !failed) {
    return (
      <MarketChrome>
        <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
          <ListingSkeleton />
        </div>
      </MarketChrome>
    )
  }

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        <ListingHeader
          title="Fresh Finds"
          lead="The latest products added across all stores, newest first."
        />

        {failed || data === null ? (
          <ErrorState
            message="Products could not load. Check your connection and try again."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={BoxIcon}
            title="Nothing new yet"
            description="New products show up here as soon as sellers add them."
            action={
              <Link to="/" className={buttonClass({ size: 'md' })}>
                Back to UnieMax
              </Link>
            }
          />
        ) : (
          <>
            <ul className={`mt-6 ${PRODUCT_LISTING_GRID}`}>
              {data.items.map((product) => (
                <MarketProductCard key={product.id} product={product} />
              ))}
            </ul>
            <ListingPagination
              meta={data.meta}
              href={(target) => (target > 1 ? `/new?page=${target}` : '/new')}
            />
          </>
        )}
      </div>
    </MarketChrome>
  )
}
