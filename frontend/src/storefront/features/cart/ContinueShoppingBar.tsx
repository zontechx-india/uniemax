import { useMemo } from 'react'
import { MediaImg } from '../../../shared/media/MediaImg'
import { buttonClass } from '../../../shared/ui/Button'
import { CONTENT_COLUMN } from '../../layout/contentWidth'
import { ArrowRightIcon, BoxIcon } from '../../layout/icons'
import { formatPrice } from '../stores/storesApi'
import { groupByStore, useCart, type CartItem } from './cart'

/** Overlapping product photos in the stack; the rest become a "+N" disc. */
const MAX_PHOTOS = 3
/** Store chips shown from `lg`; more baskets are one tap away in the cart. */
const MAX_STORE_CHIPS = 3

interface CartSummary {
  itemCount: number
  storeCount: number
  total: number
  photos: string[]
  stores: { slug: string; name: string; subtotal: number }[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * One pass over the cart: counts and totals come from `groupByStore` (active,
 * in-stock lines only — the same figures the cart page shows), plus the first
 * few distinct product photos for the stack.
 */
function summarise(items: CartItem[]): CartSummary | null {
  const groups = groupByStore(items).filter((group) => group.itemCount > 0)
  if (groups.length === 0) return null

  const photos = new Set<string>()
  for (const group of groups) {
    for (const item of group.items) {
      if (photos.size === MAX_PHOTOS) break
      if (item.imageUrl && item.stockQuantity > 0) photos.add(item.imageUrl)
    }
  }

  return {
    itemCount: groups.reduce((sum, group) => sum + group.itemCount, 0),
    storeCount: groups.length,
    total: groups.reduce((sum, group) => sum + group.subtotal, 0),
    photos: [...photos],
    stores: groups.slice(0, MAX_STORE_CHIPS).map((group) => ({
      slug: group.storeSlug,
      name: group.storeName,
      subtotal: group.subtotal,
    })),
  }
}

/** The disc shape every member of the photo stack shares. */
const DISC =
  'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-well ring-2 ring-surface'

/**
 * Homepage "Continue shopping": one slim bar for a shopper with items left in
 * their cart — a stack of product photos, "N items waiting", the store count
 * and total, and a View cart button. From `lg` a chip per store (up to three)
 * links straight to that store's basket.
 *
 * Reads the local cart only, so it costs no request and renders nothing for
 * an empty cart. The summary is memoised on the cart snapshot, which only
 * changes when the cart does.
 */
export function ContinueShoppingBar() {
  const items = useCart()
  const summary = useMemo(() => summarise(items), [items])
  if (!summary) return null

  const extra = summary.itemCount - summary.photos.length

  return (
    <section aria-labelledby="continue-shopping" className="border-b border-line bg-surface">
      <div className={`${CONTENT_COLUMN} flex items-center gap-3 py-3 lg:gap-5`}>
        <div aria-hidden className="flex -space-x-3.5">
          {summary.photos.length === 0 ? (
            <span className={DISC}>
              <BoxIcon className="h-4 w-4 text-muted" />
            </span>
          ) : (
            summary.photos.map((src) => (
              <span key={src} className={DISC}>
                <MediaImg src={src} sizes="40px" alt="" className="h-full w-full object-cover" />
              </span>
            ))
          )}
          {extra > 0 && summary.photos.length > 0 && (
            <span className={`${DISC} bg-fg text-xs font-semibold text-surface`}>+{extra}</span>
          )}
        </div>

        <div className="min-w-0 flex-1 lg:flex-none">
          <h2 id="continue-shopping" className="truncate text-sm font-semibold text-fg">
            {plural(summary.itemCount, 'item')} waiting
          </h2>
          <p className="whitespace-nowrap text-xs text-muted">
            {plural(summary.storeCount, 'store')} ·{' '}
            <span className="font-figure font-semibold text-fg">{formatPrice(summary.total)}</span>
          </p>
        </div>

        <ul className="hidden min-w-0 flex-1 items-center gap-2 border-l border-line pl-5 lg:flex">
          {summary.stores.map((store) => (
            <li key={store.slug} className="min-w-0">
              {/* Plain <a>: /cart lives in the public router (full page load). */}
              <a
                href={`/cart/${store.slug}`}
                className="flex h-9 items-center gap-2 rounded-pill border border-line px-3.5 text-xs transition-colors hover:border-fg/30"
              >
                <span className="max-w-40 truncate font-semibold text-fg">{store.name}</span>
                <span className="font-figure text-muted">{formatPrice(store.subtotal)}</span>
              </a>
            </li>
          ))}
        </ul>

        <a href="/cart" className={buttonClass({ size: 'md', className: 'gap-1.5' })}>
          View cart <ArrowRightIcon className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}
