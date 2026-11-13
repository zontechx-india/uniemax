import { useState } from 'react'
import { MediaImg } from '../../../../shared/media/MediaImg'
import type { StoreProduct } from '../../../features/stores/storesApi'
import { BoxIcon, SearchIcon } from '../../../layout/icons'

/** How many matches the suggestion list shows before "See all". */
const SUGGESTION_COUNT = 5

/**
 * The seller's product search — the storefront's search (`StoreHeader`'s
 * `SearchBox`) moved into the Products page: the same pill field, and after
 * two letters the matching products appear under it (photo, name, price) so
 * a seller taps the product instead of scrolling for it. A tap opens that
 * product's editor. Enter, or "See all", closes the list and leaves the page's
 * own list filtered by the same words.
 *
 * Unlike the storefront it needs no request: the page already holds every
 * product, so `matches` is the list the page is about to show.
 */
export function ProductSearch({
  query,
  onQuery,
  matches,
  priceOf,
  onPick,
  supplyOnly = false,
}: {
  query: string
  onQuery: (q: string) => void
  /** The products that match `query` (and the chosen filter chip). */
  matches: StoreProduct[]
  /** "₹499", "₹89,900 – ₹1,09,999" or "No price yet". */
  priceOf: (product: StoreProduct) => string
  /** A suggestion was tapped: open this product. */
  onPick: (product: StoreProduct) => void
  /** A supplier account says Available / Paused, not Showing / Hidden. */
  supplyOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const q = query.trim()
  const shown = open && q.length >= 2

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        setOpen(false)
        // Hide the phone keyboard so the filtered list is in view.
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search your products…"
        aria-label="Search your products"
        aria-expanded={shown}
        aria-controls="seller-product-suggestions"
        autoComplete="off"
        enterKeyHint="search"
        // 16px text: anything smaller makes iOS zoom the page on focus.
        className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-field text-fg outline-none transition-colors placeholder:text-muted focus:border-accent"
      />

      {shown && (
        <div
          id="seller-product-suggestions"
          // Keep focus in the field while a row is tapped — iOS Safari does
          // not focus buttons, so a blur would close the list first.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-floating"
        >
          {matches.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              Nothing matches “{q}”. Try a shorter word.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {matches.slice(0, SUGGESTION_COUNT).map((product) => {
                const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onQuery('')
                        onPick(product)
                      }}
                      className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-alt"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt text-muted">
                        {cover ? (
                          <MediaImg sizes="44px" src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <BoxIcon className="h-5 w-5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">
                          {product.name}
                        </span>
                        <span className="block truncate text-hint text-muted">
                          {/* A real price in brand; "No price yet" stays grey. */}
                          <span className={product.price && Number(product.price) > 0 ? 'font-semibold text-brand' : ''}>
                            {priceOf(product)}
                          </span>
                          {' · '}
                          {product.isDraft
                            ? 'Not finished'
                            : product.isActive
                              ? supplyOnly ? 'Available' : 'Showing'
                              : supplyOnly ? 'Paused' : 'Hidden'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {matches.length > 0 && (
            <button
              type="submit"
              className="flex min-h-tap w-full items-center justify-center border-t border-line px-4 text-sm font-semibold text-brand transition-colors hover:bg-surface-alt"
            >
              See all {matches.length} result{matches.length === 1 ? '' : 's'} for “{q}”
            </button>
          )}
        </div>
      )}
    </form>
  )
}
