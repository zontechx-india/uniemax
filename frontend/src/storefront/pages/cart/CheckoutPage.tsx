import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGoBack } from '../../../shared/useGoBack'
import { usePageTitle } from '../../../shared/usePageTitle'
import { trackInitiateCheckout } from '../../../shared/analytics/metaPixel'
import { customerAuth } from '../../../shared/auth/authApi'
import { toApiError } from '../../../shared/auth/http'
import { useSession } from '../../../shared/auth/useSession'
import { ErrorNote } from '../../../shared/ui/form'
import { cart, groupByStore, lineTotal, useCart } from '../../features/cart/cart'
import type { CartItem } from '../../features/cart/cart'
import { useCartRevalidation } from '../../features/cart/useCartRevalidation'
import { useDeliveryCheck } from '../../features/cart/useDeliveryCheck'
import { storeVars } from '../../features/publicStore/storeTheme'
import { useStoreShell } from '../../features/publicStore/useStoreShells'
import {
  cartUrl,
  formatPrice,
  launchCashfreeCheckout,
  publicOrderApi,
  storeHomeUrl,
} from '../../features/stores/storesApi'
import {
  ArrowLeftIcon,
  BoxIcon,
  CartIcon,
  ChevronRightIcon,
  LockIcon,
} from '../../layout/icons'
import { RevalidationNote } from './CartPage'
import { CheckoutSteps } from './CheckoutSteps'
import type { CheckoutState } from './CheckoutSteps'
import { StoreLogo } from './StoreLogo'

/**
 * Per-store order page (/checkout/{storeSlug}) — target of a store group's
 * "Place Order" button. Orders are placed PER STORE, so this page carries
 * only that store's cart items as a read-only review, plus placeholder
 * sections for Delivery Details and Payment (both arrive with the orders
 * module — the page is the frame they will land in).
 *
 * Like the per-store cart page, it renders in the STORE'S OWN THEME
 * (`storeVars` on the page root once the shell loads), so a customer coming
 * from a dark storefront stays in that store's world through to ordering —
 * only the multi-store /cart overview stays in the app's neutral palette.
 *
 * SIGN-IN REQUIRED: browsing and the cart stay anonymous, but placing an
 * order needs an account (the API enforces it with a 401). The page probes
 * the cookie session on mount; guests get a sign-in prompt that returns
 * them here via `/login?next=` instead of the checkout steps.
 */
export function CheckoutPage({ storeSlug }: { storeSlug: string }) {
  const { state: session } = useSession(customerAuth)
  const items = useCart()
  // Refresh prices/stock before the customer reviews the order.
  const revalidation = useCartRevalidation(storeSlug)
  const shell = useStoreShell(storeSlug)
  const group = groupByStore(items).find((g) => g.storeSlug === storeSlug)
  usePageTitle('Place Order', group?.storeName ?? shell?.name)
  const navigate = useNavigate()
  const goBack = useGoBack(cartUrl(storeSlug))

  // Meta InitiateCheckout — once per visit to this store's checkout. The ref
  // guard matters because cart revalidation re-renders the page with refreshed
  // prices, and `group` is a fresh object on every render.
  const checkoutReported = useRef(false)
  useEffect(() => {
    if (checkoutReported.current || !group || group.items.length === 0) return
    checkoutReported.current = true
    trackInitiateCheckout(
      group.items.map((item) => ({
        id: item.productSlug,
        price: Number(item.price),
        quantity: item.qty,
      })),
    )
  }, [group])

  const [checkout, setCheckout] = useState<CheckoutState>({
    delivery: null,
    payment: null,
  })
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const onStepsChange = useCallback((state: CheckoutState) => {
    setCheckout(state)
    setPlaceError(null)
  }, [])

  const sellable = group?.items.filter((i) => i.stockQuantity > 0) ?? []
  const excluded = (group?.items.length ?? 0) - sellable.length

  // Delivery-area check against the CHOSEN address: every line must reach
  // its pincode (each product's own rule, else the store default). Pickup
  // orders and an unfinished delivery step have nothing to check.
  const deliveryPincode =
    checkout.delivery?.fulfilment === 'DELIVERY'
      ? checkout.delivery.values.pincode?.trim() || null
      : null
  const deliveryCheck = useDeliveryCheck(
    storeSlug,
    deliveryPincode,
    sellable.map((item) => item.productId),
  )
  const blockedLines = sellable.filter((item) =>
    deliveryCheck.undeliverable.has(item.productId),
  )

  const ready =
    checkout.delivery !== null &&
    checkout.payment !== null &&
    !deliveryCheck.checking &&
    blockedLines.length === 0

  const placeOrder = async () => {
    if (!ready || !checkout.delivery || !checkout.payment || sellable.length === 0) return
    setPlacing(true)
    setPlaceError(null)
    try {
      const order = await publicOrderApi.place(storeSlug, {
        fulfilment: checkout.delivery.fulfilment,
        paymentMethod: checkout.payment,
        customer: {
          name: checkout.delivery.values.name ?? null,
          phone: checkout.delivery.values.phone ?? null,
          email: checkout.delivery.values.email ?? null,
          address: checkout.delivery.values.address ?? null,
          pincode: checkout.delivery.values.pincode ?? null,
          state: checkout.delivery.values.state ?? null,
          country: checkout.delivery.values.country ?? null,
        },
        items: sellable.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.qty,
        })),
      })
      // The order owns these items now — clear them before leaving so a
      // back-navigation doesn't offer to buy them twice.
      cart.clearStore(storeSlug)
      if (order.payment?.paymentSessionId) {
        // Cashfree gateway order — hand over to the hosted checkout; it
        // redirects back to the order page (return_url) after payment.
        await launchCashfreeCheckout(order.payment)
      }
      navigate(`/order/${storeSlug}/${order.id}`, { replace: true })
    } catch (err) {
      const apiError = toApiError(err)
      if (apiError.statusCode === 401) {
        // Session expired mid-checkout — sign back in and return here.
        // Full page load: /login lives in the marketplace router.
        window.location.href = checkoutLoginUrl(storeSlug)
        return
      }
      setPlaceError(apiError.message)
      setPlacing(false)
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-bg text-fg"
      style={shell ? storeVars(shell.theme) : undefined}
    >
      <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          {/* Steps BACK (see useGoBack) — as a Link this pushed a second
              cart entry, leaving checkout ahead in the stack and trapping
              the visitor between the two pages. Direct opens fall back to
              this store's cart, keeping its theme. */}
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <span className="font-body text-lg font-semibold tracking-normal">
            Checkout
          </span>
          {/* Trust cue — a checkout without one reads as unfinished. */}
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-muted">
            <LockIcon className="h-4 w-4" />
            <span className="hidden sm:inline">100% Secure Checkout</span>
            <span className="sm:hidden">Secure</span>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        {session.status === 'loading' ? (
          <section className="rounded-xl border border-dashed border-line bg-surface px-5 py-16 text-center text-sm text-muted">
            Checking your session…
          </section>
        ) : session.status === 'guest' ? (
          <SignInToOrder storeSlug={storeSlug} />
        ) : !group || sellable.length === 0 ? (
          <NothingToOrder storeSlug={storeSlug} hasUnavailable={excluded > 0} />
        ) : (
          <>
            {/* Store identity — logo + name; the body face reads calmer than
                condensed display type on a transactional page. */}
            <div className="flex items-center gap-3">
              <StoreLogo
                shell={shell}
                name={group.storeName}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Ordering from
                </p>
                <h1 className="truncate font-body text-xl font-semibold tracking-normal sm:text-2xl">
                  {group.storeName}
                </h1>
              </div>
              <span className="shrink-0 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted">
                {group.itemCount} item{group.itemCount === 1 ? '' : 's'}
              </span>
            </div>
            <RevalidationNote {...revalidation} />

            <div className="mt-5 items-start gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                {/* Read-only item review — editing happens in the cart. */}
                <section className="rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                    <h2 className="font-body text-base font-semibold tracking-normal">
                      Your Items
                    </h2>
                    <Link
                      to={`/cart/${storeSlug}`}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Edit in cart
                    </Link>
                  </div>
                  <ul className="divide-y divide-line px-5">
                    {sellable.map((item) => (
                      <OrderLine
                        key={`${item.productId}:${item.variantId ?? ''}`}
                        item={item}
                        undeliverableTo={
                          deliveryCheck.undeliverable.has(item.productId)
                            ? deliveryPincode
                            : null
                        }
                      />
                    ))}
                  </ul>
                  {blockedLines.length > 0 && deliveryPincode && (
                    <p
                      role="alert"
                      className="border-t border-line px-5 py-3 text-xs font-semibold text-danger"
                    >
                      {blockedLines.length === 1
                        ? `1 item can’t be delivered to pincode ${deliveryPincode}.`
                        : `${blockedLines.length} items can’t be delivered to pincode ${deliveryPincode}.`}{' '}
                      Choose a different address, or remove{' '}
                      {blockedLines.length === 1 ? 'it' : 'them'} from your
                      cart to continue.
                    </p>
                  )}
                  {deliveryCheck.error && (
                    <p className="border-t border-line px-5 py-3 text-xs font-semibold text-warning">
                      {deliveryCheck.error} You can still try placing the
                      order.
                    </p>
                  )}
                  {excluded > 0 && (
                    <p className="border-t border-line px-5 py-3 text-xs font-semibold text-warning">
                      {excluded} unavailable item{excluded === 1 ? '' : 's'}{' '}
                      from your cart {excluded === 1 ? 'is' : 'are'} not part
                      of this order.
                    </p>
                  )}
                </section>

                {/* Delivery details → payment method. The steps need the
                    shell (checkout fields + payments + shipping config). */}
                {shell ? (
                  <CheckoutSteps shell={shell} onStateChange={onStepsChange} />
                ) : (
                  <section className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted">
                    Loading checkout…
                  </section>
                )}
              </div>

              {/* Order summary */}
              <div className="mt-6 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-20 lg:mt-0">
                <h2 className="font-body text-base font-semibold tracking-normal">
                  Order Summary
                </h2>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">
                      Subtotal ({group.itemCount} item
                      {group.itemCount === 1 ? '' : 's'})
                    </dt>
                    <dd className="font-semibold">
                      {formatPrice(group.subtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Shipping</dt>
                    <dd className="text-muted">Calculated at checkout</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm font-semibold text-muted">
                    Total
                  </span>
                  <span className="text-lg font-bold">
                    {formatPrice(group.subtotal)}
                  </span>
                </div>
                {placeError && (
                  <div className="mt-3">
                    <ErrorNote>{placeError}</ErrorNote>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!ready || placing}
                  onClick={() => void placeOrder()}
                  title={
                    ready
                      ? undefined
                      : blockedLines.length > 0
                        ? 'Some items can’t be delivered to this address'
                        : deliveryCheck.checking
                          ? 'Checking delivery to your address…'
                          : 'Complete the delivery and payment steps first'
                  }
                  className={`mt-4 h-11 w-full rounded-md text-sm font-bold transition ${
                    ready && !placing
                      ? 'metal-cta text-cta-contrast'
                      : 'cursor-not-allowed bg-surface-alt text-muted'
                  }`}
                >
                  {placing ? 'Placing your order…' : 'Place Order'}
                </button>
                <Link
                  to={storeHomeUrl(storeSlug)}
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

/** Login URL that lands the customer back on this checkout after sign-in. */
function checkoutLoginUrl(storeSlug: string): string {
  return `/login?next=${encodeURIComponent(`/checkout/${storeSlug}`)}`
}

/**
 * Guest gate — only signed-in customers can place orders. A plain <a> (not
 * a router Link): /login is served by the marketplace router, so crossing
 * over needs a full page load.
 */
function SignInToOrder({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-alt text-muted">
        <LockIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-body text-lg font-semibold tracking-normal">
        Sign in to place your order
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        Your cart is saved. Sign in (or create an account in seconds) and
        you&rsquo;ll come right back here to finish checking out.
      </p>
      <div className="mt-5 flex gap-3">
        {/* `replace`: this checkout is a dead end for a guest, so it should
            not sit in history for Back to land on again. */}
        <Link
          to={cartUrl(storeSlug)}
          replace
          className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-alt"
        >
          Back to cart
        </Link>
        <a
          href={checkoutLoginUrl(storeSlug)}
          className="metal-cta rounded-md px-5 py-2.5 text-sm font-semibold text-cta-contrast transition"
        >
          Sign in to continue
        </a>
      </div>
    </div>
  )
}

/**
 * One read-only review line: name · variant · qty × price → line total.
 * `undeliverableTo` (a pincode) flags a line the chosen address can't receive.
 */
function OrderLine({
  item,
  undeliverableTo = null,
}: {
  item: CartItem
  undeliverableTo?: string | null
}) {
  return (
    <li className="flex items-center gap-3 py-3.5">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
          <BoxIcon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {item.variantName && (
            <span className="mr-2 rounded-sm bg-surface-alt px-1.5 py-0.5 font-semibold">
              {item.variantName}
            </span>
          )}
          {item.qty} × {formatPrice(item.price)}
        </p>
        {undeliverableTo && (
          <p className="mt-1 text-xs font-semibold text-danger">
            Not deliverable to pincode {undeliverableTo}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-bold">
        {formatPrice(lineTotal(item))}
      </span>
    </li>
  )
}

function NothingToOrder({
  storeSlug,
  hasUnavailable,
}: {
  storeSlug: string
  hasUnavailable: boolean
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-alt text-muted">
        <CartIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-body text-lg font-semibold tracking-normal">
        Nothing to order from this store
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        {hasUnavailable
          ? 'The items you had from this store are currently unavailable.'
          : 'Your cart has no items from this store.'}
      </p>
      <div className="mt-5 flex gap-3">
        {/* `replace` for the same reason as the guest gate: there is nothing
            to order here, so this entry shouldn't be a Back target. */}
        <Link
          to={cartUrl(storeSlug)}
          replace
          className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-alt"
        >
          Back to cart
        </Link>
        <Link
          to={storeHomeUrl(storeSlug)}
          className="metal-cta rounded-md px-5 py-2.5 text-sm font-semibold text-cta-contrast transition"
        >
          Browse the store
        </Link>
      </div>
    </div>
  )
}
