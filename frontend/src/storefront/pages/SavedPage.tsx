import { useEffect, useState } from 'react'
import { toApiError } from '../../shared/auth/http'
import { usePrivatePageTitle } from '../../shared/seo'
import { buttonClass } from '../../shared/ui/Button'
import { EmptyState, ErrorState } from '../../shared/ui/states'
import { MarketProductCard } from '../features/discovery/MarketListing'
import { wishlistApi, type SavedProduct } from '../features/wishlist/wishlist'
import { HeartIcon } from '../layout/icons'

/**
 * `/saved` — the customer's wishlist, newest save first.
 *
 * A product un-hearted here stays on screen (heart hollow) until the page is
 * left, so a mis-tap is undone with one more tap instead of a search. Hidden
 * or unpublished products are left out by the server and come back on their
 * own when they are visible again.
 */
export function SavedPage() {
  usePrivatePageTitle('Saved')

  const [items, setItems] = useState<SavedProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    wishlistApi
      .list()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-body text-2xl font-semibold tracking-normal text-fg">Saved</h1>
      <p className="mt-1 text-sm text-muted">
        Products you saved with the heart, from every store on UnieMax.
      </p>

      <div className="mt-5">
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null)
              setItems(null)
              setAttempt((n) => n + 1)
            }}
          />
        ) : items === null ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon={HeartIcon}
            title="Nothing saved yet"
            description="Tap the heart on any product to keep it here for later."
            action={
              <a href="/new" className={buttonClass({ size: 'md' })}>
                Browse new products
              </a>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((product) => (
              <MarketProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
