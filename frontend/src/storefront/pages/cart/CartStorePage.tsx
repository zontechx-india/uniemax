import { Link } from 'react-router-dom'
import { cart, groupByStore, useCart } from '../../features/cart/cart'
import { useCartRevalidation } from '../../features/cart/useCartRevalidation'
import { storeVars } from '../../features/publicStore/storeTheme'
import { useStoreShell } from '../../features/publicStore/useStoreShells'
import { cartUrl, formatPrice, storeHomeUrl } from '../../features/stores/storesApi'
import { useGoBack } from '../../../shared/useGoBack'
import { usePageTitle } from '../../../shared/usePageTitle'
import { buttonClass } from '../../../shared/ui/Button'
import {
  ArrowLeftIcon,
  CartIcon,
  ChevronRightIcon,
  StoreIcon,
  TrashIcon,
} from '../../layout/icons'
import { CartLine } from './CartLine'
import { RevalidationNote } from './CartPage'
import { StoreLogo } from './StoreLogo'

/**
 * Per-store cart page (/cart/{storeSlug}) — the target of a store group's
 * "View more" on /cart. Shows every cart item from that one store with the
 * same line controls, plus the store subtotal and the per-store
 * "Place Order" path.
 *
 * Because this page belongs to ONE store, it renders in that store's theme
 * (`storeVars` once the shell loads) — a customer arriving from a dark
 * storefront stays in the store's world. Its links back to the combined
 * /cart carry `?from={storeSlug}` so the theme continues there too.
 */
export function CartStorePage({ storeSlug }: { storeSlug: string }) {
  const items = useCart()
  const revalidation = useCartRevalidation(storeSlug)
  const shell = useStoreShell(storeSlug)
  const group = groupByStore(items).find((g) => g.storeSlug === storeSlug)
  usePageTitle('Cart', group?.storeName)
  const goBack = useGoBack(cartUrl(storeSlug))

  return (
    <div
      className="flex min-h-screen flex-col bg-bg text-fg"
      style={shell ? storeVars(shell.theme) : undefined}
    >
      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          {/* Steps BACK (see useGoBack). As a Link this pushed a second
              /cart entry with this page still ahead of it, so Back bounced
              between the two. Direct opens fall back to the combined cart,
              keeping this store's theme. */}
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 font-heading text-lg font-semibold">
            <CartIcon className="h-5 w-5" />
            Cart
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        {!group ? (
          <NothingFromStore storeSlug={storeSlug} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <StoreLogo
                shell={shell}
                name={group.storeName}
                className="h-11 w-11"
              />
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-heading text-2xl font-semibold sm:text-3xl">
                  {group.storeName}
                </h1>
                <p className="text-sm text-muted">
                  {group.itemCount} item{group.itemCount === 1 ? '' : 's'} in
                  your cart
                </p>
              </div>
              <button
                type="button"
                onClick={() => cart.clearStore(group.storeSlug)}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
                Clear all
              </button>
            </div>
            <RevalidationNote {...revalidation} />

            <div className="mt-5 items-start gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-xl border border-line bg-surface">
                <ul className="divide-y divide-line px-5">
                  {group.items.map((item) => (
                    <CartLine
                      key={`${item.storeSlug}:${item.productId}:${item.variantId ?? ''}`}
                      item={item}
                    />
                  ))}
                </ul>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-20 lg:mt-0">
                <h2 className="font-heading text-lg font-semibold">
                  Order Summary
                </h2>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm font-semibold text-muted">
                    Subtotal
                  </span>
                  <span className="text-lg font-bold">
                    {formatPrice(group.subtotal)}
                  </span>
                </div>
                {group.itemCount > 0 ? (
                  <Link
                    to={`/checkout/${group.storeSlug}`}
                    className={buttonClass({ full: true, className: 'mt-4' })}
                  >
                    Place Order
                  </Link>
                ) : (
                  <span className="mt-4 flex h-11 cursor-not-allowed items-center justify-center rounded-md bg-surface-alt text-sm font-bold text-muted">
                    Place Order
                  </span>
                )}
                <p className="mt-2 text-xs text-muted">
                  Orders are placed per store.
                </p>
                <Link
                  to={storeHomeUrl(group.storeSlug)}
                  className="mt-3 flex h-10 items-center justify-center gap-1 rounded-md border border-line text-sm font-semibold text-muted transition hover:bg-surface-alt hover:text-fg"
                >
                  Continue shopping
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function NothingFromStore({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-alt text-muted">
        <StoreIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-heading text-lg font-semibold">
        Nothing from this store
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        Your cart has no items from this store (they may have been removed).
      </p>
      {/* `replace`: nothing from this store is left, so this page shouldn't
          remain in history as a Back target. */}
      <Link
        to={cartUrl(storeSlug)}
        replace
        className={buttonClass({ className: 'mt-5' })}
      >
        Back to cart
      </Link>
    </div>
  )
}
