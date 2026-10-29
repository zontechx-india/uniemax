import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { fieldClass } from '../../shared/ui/field'
import { buttonClass } from '../../shared/ui/Button'
import { EmptyState, ErrorState } from '../../shared/ui/states'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type { BrowsableCategory } from '../features/discovery/discoveryApi'
import { ListingHeader } from '../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../layout/contentWidth'
import { MarketChrome } from '../layout/MarketChrome'
import { SearchIcon, TagIcon } from '../layout/icons'

/** Below this many the list fits a glance, and a filter box is clutter. */
const FILTER_MIN = 9

const TILE_GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/**
 * `/categories` — every global category with something in it, biggest first.
 *
 * The homepage's Popular row is capped at a dozen; this is where its "All"
 * link goes. Every tile is a link to that category's `/c/{slug}` page, so the
 * page is also the one place a crawler can reach the whole taxonomy from.
 * The filter box narrows the tiles on the client — the list arrives whole.
 */
export function AllCategoriesPage() {
  const [categories, setCategories] = useState<BrowsableCategory[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .browsableCategories()
      .then((items) => {
        if (!cancelled) setCategories(items)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useSeo({
    title: ['All categories'],
    description:
      'Browse every product category on UnieMax and shop it from independent sellers — cash on delivery or secure online payment.',
    canonical: '/categories',
  })

  const needle = query.trim().toLowerCase()
  const shown = (categories ?? []).filter((category) =>
    category.name.toLowerCase().includes(needle),
  )

  const retry = () => {
    setFailed(false)
    setCategories(null)
    setAttempt((n) => n + 1)
  }

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        <ListingHeader
          title="All categories"
          lead="Pick a category to see it from every shop that sells it."
        />

        {failed ? (
          <ErrorState
            message="Categories could not load. Check your connection and try again."
            onRetry={retry}
          />
        ) : categories === null ? (
          <ul className={`mt-6 ${TILE_GRID}`} aria-hidden>
            {Array.from({ length: 15 }, (_, i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-lg bg-surface" />
            ))}
          </ul>
        ) : categories.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title="No categories yet"
            description="Nothing is listed on the marketplace yet. Check back soon."
            action={
              <Link to="/" className={buttonClass({ size: 'md' })}>
                Back to UnieMax
              </Link>
            }
          />
        ) : (
          <>
            {categories.length >= FILTER_MIN && (
              <label className="relative mt-5 block max-w-md">
                <span className="sr-only">Find a category</span>
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a category"
                  className={fieldClass({ className: 'pl-10' })}
                />
              </label>
            )}

            {shown.length === 0 ? (
              <p className="mt-6 text-sm text-muted">
                No category matches “{query.trim()}”.
              </p>
            ) : (
              <ul className={`mt-6 ${TILE_GRID}`}>
                {shown.map((category) => (
                  <li key={category.slug}>
                    <Link
                      to={`/c/${category.slug}`}
                      className="group flex h-full items-center gap-3 rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-accent"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <TagIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-semibold leading-tight text-fg transition-colors group-hover:text-brand">
                          {category.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {category.productCount} product
                          {category.productCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </MarketChrome>
  )
}
