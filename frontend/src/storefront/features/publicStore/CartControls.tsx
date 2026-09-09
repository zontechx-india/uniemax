import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cart, useCartQty } from '../cart/cart'
import { cartUrl } from '../stores/storesApi'
import { CartIcon, CheckIcon, MinusIcon, PlusIcon } from '../../layout/icons'
import { Button } from '../../../shared/ui/Button'
import { stockLevel } from './catalog'
import type { Skin } from './storeTheme'

/** How long the "Added to cart" toast stays up. */
const TOAST_MS = 4000

/** What identifies (and snapshots) the line a purchase control writes. */
export interface PurchaseTarget {
  storeSlug: string
  storeName: string
  productId: string
  /** Product URL slug — snapshotted so the cart can link back + revalidate. */
  productSlug: string
  variantId: string | null
  name: string
  variantName: string | null
  /** Cover-image URL — snapshotted so cart lines can show a thumbnail. */
  imageUrl: string | null
  /** Decimal string as served by the API (variant price when applicable). */
  price: string
  stock: number
}

/**
 * Purchase block for the product page: a stock-capped **quantity selector**
 * next to **Add to Cart**, with **Buy Now** beneath it (add, then straight to
 * this store's checkout — orders are placed per store).
 *
 * The quantity is local until the customer commits it, which is what makes a
 * "3 × Add to Cart" possible; the live cart line is only *reported* ("N in
 * cart"), never mirrored into the selector — a stepper that silently rewrote
 * the cart on every tap made the button meaningless.
 *
 * Adding pops the short **"Added to cart — View cart"** toast, closing the
 * feedback loop.
 */
export function PurchaseActions({
  target,
  skin,
  /** Compact single row for the sticky bar (no quantity selector). */
  compact = false,
}: {
  target: PurchaseTarget
  skin: Skin
  compact?: boolean
}) {
  const navigate = useNavigate()
  const inCart = useCartQty(target.storeSlug, target.productId, target.variantId)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // A different option (or product) starts over at one.
  useEffect(() => setQty(1), [target.productId, target.variantId])

  const max = Math.max(1, target.stock)

  const addToCart = () => {
    cart.add(
      {
        productId: target.productId,
        productSlug: target.productSlug,
        variantId: target.variantId,
        storeSlug: target.storeSlug,
        storeName: target.storeName,
        name: target.name,
        variantName: target.variantName,
        imageUrl: target.imageUrl,
        price: target.price,
        stockQuantity: target.stock,
      },
      qty,
    )
    setAdded(true)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setAdded(false), TOAST_MS)
  }

  if (target.stock <= 0) {
    return (
      <div
        className={`flex h-11 w-full items-center justify-center rounded-md bg-surface-alt px-3 text-sm font-semibold text-muted`}
      >
        Out of stock
      </div>
    )
  }

  const buyNow = () => {
    addToCart()
    navigate(`/checkout/${target.storeSlug}`)
  }

  if (compact) {
    return (
      <>
        {/* Add sits beside Buy Now, so it takes the Ring: same gradient
            family, no competing weight. Buy Now is the committing action. */}
        <Button variant="ring" onClick={addToCart} className="flex-1">
          <CartIcon className="h-4 w-4" />
          Add
        </Button>
        <Button variant="sheen" onClick={buyNow} className="flex-1">
          Buy Now
        </Button>
        {added && <AddedToast name={target.name} storeSlug={target.storeSlug} />}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <QuantityStepper
          qty={qty}
          max={max}
          onChange={setQty}
          skin={skin}
        />
        <Button variant="ring" onClick={addToCart} className="flex-1">
          <CartIcon className="h-4 w-4" />
          Add to Cart
        </Button>
      </div>

      {/* The one committing action on the product page. */}
      <Button variant="sheen" onClick={buyNow} full>
        Buy Now
      </Button>

      {inCart > 0 && (
        <p className={`text-xs ${skin.muted}`}>
          {inCart} already in your{' '}
          <Link to={cartUrl(target.storeSlug)} className="font-semibold text-brand hover:underline">
            cart
          </Link>
        </p>
      )}

      {added && <AddedToast name={target.name} storeSlug={target.storeSlug} />}
    </div>
  )
}

/** −/N/+ selector, clamped to [1, max]. Also typeable for large quantities. */
export function QuantityStepper({
  qty,
  max,
  onChange,
  skin,
}: {
  qty: number
  max: number
  onChange: (qty: number) => void
  skin: Skin
}) {
  const clamp = (n: number) => Math.max(1, Math.min(n, max))
  return (
    <span
      className={`inline-flex h-11 shrink-0 items-center overflow-hidden rounded-md border ${skin.border} ${skin.chip}`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={qty <= 1}
        onClick={() => onChange(clamp(qty - 1))}
        className={`flex h-full w-10 items-center justify-center transition hover:opacity-70 disabled:opacity-40 ${skin.text}`}
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Quantity"
        value={qty}
        onChange={(e) => {
          const parsed = Number(e.target.value.replace(/\D/g, ''))
          if (parsed > 0) onChange(clamp(parsed))
        }}
        className={`h-full w-10 border-0 bg-transparent text-center text-sm font-bold outline-none ${skin.text}`}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={qty >= max}
        onClick={() => onChange(clamp(qty + 1))}
        className={`flex h-full w-10 items-center justify-center transition hover:opacity-70 disabled:opacity-40 ${skin.text}`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/**
 * "Added to cart" confirmation — fixed bottom-center flyout with the path to
 * the cart. App-styled (not store-themed): like the draft banner, it is
 * chrome talking to the visitor, not part of the store's design.
 */
function AddedToast({ name, storeSlug }: { name: string; storeSlug: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-floating"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckIcon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
        Added to cart
        <span className="block truncate text-xs font-normal text-muted">
          {name}
        </span>
      </p>
      <Link
        // ?from= keeps the cart in this store's theme (see cartUrl).
        to={cartUrl(storeSlug)}
        className="shrink-0 rounded-md border border-line px-3 py-2 text-xs font-bold text-brand transition hover:bg-surface-alt"
      >
        View cart
      </Link>
    </div>
  )
}

/**
 * Low Stock / Out of Stock pill driven by total stock. Plenty in stock says
 * nothing — availability is only worth a label when it is news.
 */
export function StockBadge({ stock }: { stock: number }) {
  const level = stockLevel(stock)
  if (level === 'out') {
    return (
      <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
        Out of Stock
      </span>
    )
  }
  if (level === 'low') {
    return (
      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        Low Stock
      </span>
    )
  }
  return null
}

/**
 * "Sale" — shown only where a variant's MRP is above its selling price, so the
 * word always means a real discount. Callers decide that; this is the pill.
 */
export function SaleTag() {
  return (
    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-contrast">
      Sale
    </span>
  )
}
