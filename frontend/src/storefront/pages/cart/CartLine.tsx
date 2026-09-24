import { Link } from 'react-router-dom'
import { cart, lineTotal } from '../../features/cart/cart'
import type { CartItem } from '../../features/cart/cart'
import { formatPrice, storeProductUrl } from '../../features/stores/storesApi'
import { BoxIcon, MinusIcon, PlusIcon, TrashIcon } from '../../layout/icons'

/**
 * One cart line — shared by the grouped cart page (/cart) and the
 * per-store cart page (/cart/{storeSlug}). App-chrome styling (the cart
 * spans multiple stores, so no single store theme applies), flat like the
 * storefront: surfaces + borders, no shadows.
 *
 * A line whose product/variant is gone or out of stock (cart revalidation
 * sets its stock to 0) stays visible with a warning instead of vanishing —
 * the customer decides whether to remove it.
 */
export function CartLine({ item }: { item: CartItem }) {
  const out = item.stockQuantity <= 0
  const productUrl = storeProductUrl(item.storeSlug, item.productSlug)

  const thumb = item.imageUrl ? (
    <img
      src={item.imageUrl}
      alt={item.name}
      loading="lazy"
      decoding="async"
      className={`h-14 w-14 shrink-0 rounded-md border border-line object-cover ${
        out ? 'opacity-50 grayscale' : ''
      }`}
    />
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
      <BoxIcon className="h-6 w-6" />
    </div>
  )

  return (
    <li className="flex items-center gap-3 py-4 sm:gap-4">
      <Link to={productUrl} className="shrink-0" tabIndex={-1} aria-hidden="true">
        {thumb}
      </Link>

      <div className="min-w-0 flex-1">
        <h4 className={`truncate text-sm font-semibold ${out ? 'text-muted line-through' : 'text-fg'}`}>
          <Link to={productUrl} className="hover:text-brand hover:underline">
            {item.name}
          </Link>
        </h4>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
          {item.variantName && (
            <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              {item.variantName}
            </span>
          )}
          {out ? (
            <span className="font-semibold text-danger">
              Currently unavailable
            </span>
          ) : (
            <>{formatPrice(item.price)} each</>
          )}
        </p>
      </div>

      {/* Quantity stepper (clamped to the revalidated stock) */}
      {!out && (
        <span className="inline-flex h-11 shrink-0 items-center overflow-hidden rounded-md border border-line">
          <button
            type="button"
            aria-label="Decrease quantity"
            // At 1 the minus would silently delete the line — removing is
            // the bin button's job, so a slip of the thumb never does it.
            disabled={item.qty <= 1}
            onClick={() =>
              cart.setQty(item.storeSlug, item.productId, item.variantId, item.qty - 1)
            }
            className="flex h-full w-10 items-center justify-center text-muted transition hover:bg-surface-alt disabled:opacity-40"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-8 text-center text-sm font-bold text-fg">
            {item.qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={item.qty >= item.stockQuantity}
            onClick={() =>
              cart.setQty(item.storeSlug, item.productId, item.variantId, item.qty + 1)
            }
            className="flex h-full w-10 items-center justify-center text-muted transition hover:bg-surface-alt disabled:bg-line disabled:text-muted"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      )}

      <span
        className={`hidden w-20 shrink-0 text-right text-sm font-bold sm:block ${
          out ? 'text-muted line-through' : 'text-fg'
        }`}
      >
        {formatPrice(lineTotal(item))}
      </span>

      <button
        type="button"
        aria-label={`Remove ${item.name} from cart`}
        onClick={() => cart.remove(item.storeSlug, item.productId, item.variantId)}
        className="shrink-0 rounded-md p-3 text-muted transition hover:bg-danger/10 hover:text-danger"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  )
}
