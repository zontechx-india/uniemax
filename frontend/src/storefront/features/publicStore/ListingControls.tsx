import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { storeHomeUrl, type PublicSort } from '../stores/storesApi'
import { PRODUCT_GRID } from './ProductCard'
import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  SlidersIcon,
} from '../../layout/icons'
import type { Skin } from './storeTheme'

/** Sort options offered on every listing. */
export const SORT_OPTIONS: { key: PublicSort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'popular', label: 'Popular' },
  { key: 'bestselling', label: 'Best Selling' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'alphabetical', label: 'Alphabetical' },
]

/**
 * Result count · sort · filter. Sticky on mobile so the controls stay reachable
 * while scrolling a long grid.
 */
export function SortFilterBar({
  total,
  sort,
  onSort,
  activeFilterCount,
  onOpenFilters,
  skin,
}: {
  total: number
  sort: PublicSort
  onSort: (sort: PublicSort) => void
  activeFilterCount: number
  onOpenFilters: () => void
  skin: Skin
}) {
  return (
    <div
      className={`sticky top-[4.25rem] z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-y bg-bg px-4 py-2.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-xl lg:border lg:bg-surface ${skin.border}`}
    >
      <span className={`text-xs font-semibold ${skin.muted}`}>
        {total} {total === 1 ? 'product' : 'products'}
      </span>

      <div className="flex items-center gap-2">
        <div className="relative">
          <label className="sr-only" htmlFor="sort-select">
            Sort by
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => onSort(e.target.value as PublicSort)}
            className={`h-9 appearance-none rounded-md border pl-3 pr-8 text-xs font-semibold outline-none transition-colors focus:border-brand ${skin.border} ${skin.chip} ${skin.text}`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${skin.muted}`}
          />
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors hover:border-brand ${skin.border} ${skin.chip} ${skin.text}`}
        >
          <SlidersIcon className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span
              className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${skin.cta}`}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Section heading — brand dash, title, and an optional right-aligned action
 * ("View all →"). Shared by the homepage rows and the product page.
 */
export function SectionHeading({
  title,
  action,
  skin,
}: {
  title: string
  action?: { label: string; to: string }
  skin: Skin
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <span className="block h-0.5 w-8 rounded-full bg-brand" />
        {/* Heading scale from the prototype: 2xl → 3xl, semibold
            (700 is reserved for the hero). */}
        <h2
          className={`mt-2 font-heading text-2xl font-semibold sm:text-3xl ${skin.text}`}
        >
          {title}
        </h2>
      </div>
      {action && (
        <Link
          to={action.to}
          className="shrink-0 whitespace-nowrap text-sm font-semibold text-brand hover:underline"
        >
          {action.label} →
        </Link>
      )}
    </div>
  )
}

/** One breadcrumb hop. `to` omitted renders the current (non-link) crumb. */
export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({
  storeSlug,
  storeName,
  trail,
  skin,
}: {
  storeSlug: string
  storeName: string
  trail: Crumb[]
  skin: Skin
}) {
  const all: Crumb[] = [
    { label: storeName, to: storeHomeUrl(storeSlug) },
    ...trail,
  ]
  return (
    // Readability: the trail used to be 10px-ish and cramped — it is the only
    // "where am I" cue on a deep catalog, so it gets body-size type and air.
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {all.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRightIcon className={`h-4 w-4 ${skin.muted}`} />
            )}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className={`font-semibold hover:text-brand ${skin.muted}`}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-semibold text-brand">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * Load More button that also auto-loads as it nears the viewport, so the grid
 * behaves as infinite scroll without losing the explicit control.
 */
export function LoadMore({
  hasMore,
  loading,
  remaining,
  onLoadMore,
  skin,
}: {
  hasMore: boolean
  loading: boolean
  remaining: number
  onLoadMore: () => void
  skin: Skin
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || loading) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, onLoadMore])

  if (!hasMore) return null

  return (
    <div ref={ref} className="flex justify-center pt-8">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className={`h-10 rounded-md border px-5 text-sm font-semibold transition hover:border-brand disabled:opacity-50 ${skin.border} ${skin.chip} ${skin.text}`}
      >
        {loading ? 'Loading…' : `Load More (${remaining})`}
      </button>
    </div>
  )
}

/** Placeholder cards while the first page loads — same shape as ProductCard. */
export function GridSkeleton({ skin }: { skin: Skin }) {
  return (
    <ul className={PRODUCT_GRID}>
      {Array.from({ length: 12 }).map((_, i) => (
        <li
          key={i}
          className={`overflow-hidden rounded-lg border ${skin.border} ${skin.surface}`}
        >
          <div className="p-2 pb-0">
            <div className={`aspect-square animate-pulse rounded-md ${skin.well}`} />
          </div>
          <div className="space-y-2 p-3">
            <div className="h-2 w-1/3 animate-pulse rounded-full bg-surface-alt" />
            <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-surface-alt" />
            <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-surface-alt" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function NoResults({
  onClear,
  showClear,
  skin,
}: {
  onClear: () => void
  showClear: boolean
  skin: Skin
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border px-6 py-14 text-center ${skin.border} ${skin.surface}`}
    >
      <SearchIcon className={`h-8 w-8 ${skin.muted}`} />
      <h2 className={`mt-3 text-base font-bold ${skin.text}`}>
        No products found
      </h2>
      <p className={`mt-1 max-w-sm text-sm ${skin.muted}`}>
        Nothing matches your current search and filters. Try clearing them to
        see everything.
      </p>
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          className={`mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-bold transition ${skin.cta}`}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

export function EmptyCatalog({
  storeName,
  skin,
}: {
  storeName: string
  skin: Skin
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border px-6 py-16 text-center ${skin.border} ${skin.surface}`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-md ${skin.cta}`}
      >
        <BoxIcon className="h-7 w-7" />
      </div>
      <h2
        className={`mt-4 font-heading text-lg font-bold tracking-tight ${skin.text}`}
      >
        Products coming soon
      </h2>
      <p className={`mt-1.5 max-w-sm text-sm ${skin.muted}`}>
        {storeName} is setting up its catalog. Check back shortly to browse and
        shop.
      </p>
    </div>
  )
}
