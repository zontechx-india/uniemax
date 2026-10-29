import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ListMeta } from '../../shared/auth/http'
import { useSeo } from '../../shared/seo'
import { buttonClass } from '../../shared/ui/Button'
import { EmptyState, ErrorState } from '../../shared/ui/states'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type { MarketStore } from '../features/discovery/discoveryApi'
import {
  CardSkeletons,
  gridFor,
  StoreCard,
} from '../features/discovery/MarketCards'
import {
  ListingHeader,
  ListingPagination,
} from '../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
import { StoreIcon } from '../layout/icons'

/** Four full rows of the widest (6-up) grid. */
const PAGE_SIZE = 24

/**
 * `/shops` — every listed store, in the server's Top Stores order (verified
 * and delivering shops first; see `GET /public/stores`). The homepage shows
 * the first dozen; "View all" lands here.
 *
 * Not `/stores`: that prefix still redirects old seller links to
 * `/mystores`. Page 2+ is `noindex, follow` — the same list re-cut.
 */
export function AllShopsPage() {
  const [params] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  const [data, setData] = useState<{ items: MarketStore[]; meta: ListMeta } | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setData(null)
    discoveryApi
      .listStores({ page, pageSize: PAGE_SIZE })
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
    title: ['All shops'],
    description:
      'Every independent shop on UnieMax in one place — browse their stores and buy direct from the seller with cash on delivery or secure online payment.',
    canonical: '/shops',
    robots: page > 1 ? 'noindex, follow' : null,
  })

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        <ListingHeader
          title="All shops"
          lead="Stocked shops, ready to order from — every order goes straight to the seller."
        />

        <div className="mt-6">
          {failed ? (
            <ErrorState
              message="Shops could not load. Check your connection and try again."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          ) : data === null ? (
            <CardSkeletons count={6} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="No shops to show yet"
              description="Open the first one — it is free to start."
              action={
                <Link to="/sell" className={buttonClass({ size: 'md' })}>
                  Open your store
                </Link>
              }
            />
          ) : (
            <>
              <div className={gridFor(data.items.length)}>
                {data.items.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
              <ListingPagination
                meta={data.meta}
                href={(target) => (target > 1 ? `/shops?page=${target}` : '/shops')}
              />
            </>
          )}
        </div>
      </div>
    </MarketChrome>
  )
}
