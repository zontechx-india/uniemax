import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../../../shared/usePageTitle'
import { trackPurchase } from '../../../shared/analytics/metaPixel'
import { toApiError } from '../../../shared/auth/http'
import { storeVars } from '../../features/publicStore/storeTheme'
import { useStoreShell } from '../../features/publicStore/useStoreShells'
import {
  formatPrice,
  launchCashfreeCheckout,
  publicOrderApi,
  storeHomeUrl,
} from '../../features/stores/storesApi'
import type { PlacedOrder } from '../../features/stores/storesApi'
import {
  BoxIcon,
  CheckIcon,
  ChevronRightIcon,
  MapPinIcon,
  PhoneCallIcon,
} from '../../layout/icons'

/**
 * Order confirmation (/order/{storeSlug}/{orderId}) — where a successful
 * Place Order lands. Fetches the order by its unguessable id (guest-friendly,
 * no account needed) and keeps the store's theme, so the celebration still
 * feels like the shop the customer just bought from.
 */
export function OrderSuccessPage({
  storeSlug,
  orderId,
}: {
  storeSlug: string
  orderId: string
}) {
  const shell = useStoreShell(storeSlug)
  const [order, setOrder] = useState<PlacedOrder | null | undefined>(undefined)
  const [pollTick, setPollTick] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  usePageTitle('Order Placed', order?.storeName ?? shell?.name)

  useEffect(() => {
    setOrder(undefined)
    setPollTick(0)
  }, [storeSlug, orderId])

  useEffect(() => {
    let cancelled = false
    publicOrderApi
      .get(storeSlug, orderId)
      .then((found) => {
        if (!cancelled) setOrder(found)
      })
      .catch(() => {
        // Keep an already-loaded order on a failed poll refresh.
        if (!cancelled) setOrder((prev) => prev ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [storeSlug, orderId, pollTick])

  // ONLINE + gateway payment still pending: the backend reconciles against
  // Cashfree on every read, so a few refetches settle the state even when
  // the webhook can't reach us. Stops after ~30s; "Pay now" remains.
  const awaitingPayment =
    !!order &&
    order.paymentMethod === 'ONLINE' &&
    order.paymentStatus === 'PENDING' &&
    order.paymentRef !== 'DEV-SIMULATED'
  useEffect(() => {
    if (!awaitingPayment || pollTick >= 8) return
    const timer = setTimeout(() => setPollTick((n) => n + 1), 4000)
    return () => clearTimeout(timer)
  }, [awaitingPayment, pollTick])

  /** Pay now / retry — fetches a usable Cashfree session and launches it. */
  const retryPayment = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      const result = await publicOrderApi.paySession(storeSlug, orderId)
      if (result.paymentStatus === 'PENDING') {
        await launchCashfreeCheckout(result.payment)
      }
      setPollTick((n) => n + 1) // already paid (or back from checkout) — refresh
    } catch (err) {
      setRetryError(toApiError(err).message)
    } finally {
      setRetrying(false)
    }
  }

  const paymentState: 'paid' | 'pending' | 'failed' | 'cod' = !order
    ? 'cod'
    : order.paymentMethod !== 'ONLINE'
      ? 'cod'
      : order.paymentStatus === 'FAILED'
        ? 'failed'
        : order.paymentStatus === 'PENDING'
          ? 'pending'
          : 'paid'

  /**
   * Meta Purchase — the sale itself.
   *
   * Held back while an online payment is still pending or has failed, so a
   * drop-off at the gateway is never reported as revenue. `trackPurchase`
   * de-duplicates by order id, which matters twice over here: this page polls
   * while a payment settles, and its URL is deliberately shareable and
   * bookmarkable.
   */
  useEffect(() => {
    if (!order) return
    if (paymentState !== 'paid' && paymentState !== 'cod') return
    trackPurchase(
      order.id,
      Number(order.total),
      // A line whose product has since been deleted carries no slug, so it has
      // no content id to report — the order total still accounts for it.
      order.items.flatMap((item) =>
        item.productSlug
          ? [
              {
                id: item.productSlug,
                price: Number(item.unitPrice),
                quantity: item.quantity,
              },
            ]
          : [],
      ),
    )
  }, [order, paymentState])

  return (
    <div
      className="flex min-h-screen flex-col bg-bg text-fg"
      style={shell ? storeVars(shell.theme) : undefined}
    >
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10 sm:px-6">
        {order === undefined && (
          <p className="py-24 text-center text-sm text-muted">
            Loading your order…
          </p>
        )}

        {order === null && (
          <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-16 text-center">
            <h1 className="font-body text-lg font-semibold tracking-normal">
              Order not found
            </h1>
            <p className="mt-1.5 max-w-sm text-sm text-muted">
              This order link doesn't exist. Double-check the link, or head
              back to the store.
            </p>
            <Link
              to={storeHomeUrl(storeSlug)}
              className="metal-cta mt-5 rounded-md px-5 py-2.5 text-sm font-semibold text-cta-contrast transition"
            >
              Back to the store
            </Link>
          </div>
        )}

        {order && (
          <>
            {/* The confirmation moment — tone follows the payment state */}
            <div className="flex flex-col items-center text-center">
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                  paymentState === 'failed'
                    ? 'bg-danger/10 text-danger'
                    : paymentState === 'pending'
                      ? 'bg-surface-alt text-muted'
                      : 'bg-success/10 text-success'
                }`}
              >
                <CheckIcon className="h-8 w-8" />
              </span>
              <h1 className="mt-4 font-body text-2xl font-semibold tracking-normal">
                {paymentState === 'pending'
                  ? 'Completing your payment…'
                  : paymentState === 'failed'
                    ? 'Payment not completed'
                    : 'Order placed!'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {paymentState === 'pending'
                  ? 'We are confirming your payment — this page refreshes automatically.'
                  : paymentState === 'failed'
                    ? 'Your payment did not go through. Your order is saved — you can try again below.'
                    : `Thanks${order.customerName ? `, ${order.customerName}` : ''} — ${order.storeName} has received your order.`}
              </p>
              <p className="mt-3 rounded-pill border border-line bg-surface px-4 py-1.5 text-sm font-bold tracking-wide">
                {order.orderNumber}
              </p>
              <p className="mt-2 text-xs font-semibold text-muted">
                {order.paymentMethod === 'ONLINE'
                  ? order.paymentStatus === 'PAID'
                    ? `Paid online${order.paymentRef === 'DEV-SIMULATED' ? ' (simulated — development build)' : ''}`
                    : order.paymentStatus === 'FAILED'
                      ? 'Online payment failed'
                      : 'Online payment pending'
                  : 'Pay on delivery'}
              </p>
              {(paymentState === 'pending' || paymentState === 'failed') && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    disabled={retrying}
                    onClick={() => void retryPayment()}
                    className="metal-cta rounded-md px-6 py-2.5 text-sm font-bold text-cta-contrast transition disabled:opacity-60"
                  >
                    {retrying
                      ? 'Opening payment…'
                      : paymentState === 'failed'
                        ? 'Retry payment'
                        : 'Pay now'}
                  </button>
                  {retryError && (
                    <p className="text-xs font-semibold text-danger">
                      {retryError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* What was ordered */}
            <section className="mt-8 rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3.5 font-body text-base font-semibold tracking-normal">
                Your Items
              </h2>
              <ul className="divide-y divide-line px-5">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3.5">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
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
                      <p className="truncate text-sm font-semibold">
                        {item.productName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {item.variantName && (
                          <span className="mr-2 rounded-sm bg-surface-alt px-1.5 py-0.5 font-semibold">
                            {item.variantName}
                          </span>
                        )}
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold">
                      {formatPrice(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1.5 border-t border-line px-5 py-3.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="font-semibold">{formatPrice(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">
                    Shipping
                    {order.shippingMethod && (
                      <span className="ml-1.5 text-xs">· {order.shippingMethod}</span>
                    )}
                  </dt>
                  <dd className="font-semibold">
                    {Number(order.shippingCharge) === 0
                      ? 'Free'
                      : formatPrice(order.shippingCharge)}
                  </dd>
                </div>
                {Number(order.tax) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Tax</dt>
                    <dd className="font-semibold">{formatPrice(order.tax)}</dd>
                  </div>
                )}
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Discount</dt>
                    <dd className="font-semibold text-success">
                      − {formatPrice(order.discount)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <dt className="text-sm font-semibold text-muted">Total</dt>
                  <dd className="text-lg font-bold">{formatPrice(order.total)}</dd>
                </div>
              </dl>
            </section>

            {/* Where it's going */}
            <section className="mt-4 rounded-xl border border-line bg-surface p-5">
              <h2 className="flex items-center gap-2 font-body text-base font-semibold tracking-normal">
                <MapPinIcon className="h-4.5 w-4.5 text-muted" />
                {order.fulfilment === 'PICKUP' ? 'Store Pickup' : 'Delivery'}
              </h2>
              <div className="mt-2 text-sm text-muted">
                {order.fulfilment === 'PICKUP' ? (
                  <p>
                    Collect your order from {order.storeName} — the seller
                    will confirm when it's ready.
                  </p>
                ) : (
                  <p className="whitespace-pre-line">
                    {[
                      order.customerName,
                      order.addressLine,
                      [order.state, order.pincode].filter(Boolean).join(' '),
                      order.country,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  </p>
                )}
                {order.customerPhone && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs">
                    <PhoneCallIcon className="h-3.5 w-3.5" />
                    {order.customerPhone}
                  </p>
                )}
              </div>
            </section>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Link
                to={storeHomeUrl(order.storeSlug)}
                className="metal-cta flex h-11 items-center justify-center gap-1 rounded-md px-6 text-sm font-bold text-cta-contrast transition"
              >
                Continue shopping
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
              {/* Plain <a>: "/" lives in the MARKETPLACE router — crossing
                  routers requires a full page load, a Link would 404. */}
              <a
                href="/"
                className="flex h-11 items-center justify-center rounded-md border border-line px-6 text-sm font-semibold text-muted transition hover:bg-surface-alt hover:text-fg"
              >
                Back to UnieMax
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
