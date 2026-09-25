import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrivatePageTitle } from '../../../shared/seo'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { trackPurchase } from '../../../shared/analytics/metaPixel'
import { refreshSession, toApiError } from '../../../shared/auth/http'
import { storeVars } from '../../features/publicStore/storeTheme'
import { useStoreShell } from '../../features/publicStore/useStoreShells'
import {
  formatPrice,
  launchCashfreeCheckout,
  publicOrderApi,
  storeHomeUrl,
  storeSupportUrl,
} from '../../features/stores/storesApi'
import type { PlacedOrder } from '../../features/stores/storesApi'
import {
  formatStepTime,
  orderProgress,
  orderStatusCopy,
  phoneDigits,
} from '../../features/stores/orderStatus'
import {
  BoxIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  LifebuoyIcon,
  MapPinIcon,
  PhoneCallIcon,
} from '../../layout/icons'

/** How long after placing the page still greets the buyer with "Order placed!". */
const FRESH_MS = 30 * 60 * 1000

/**
 * Order confirmation (/order/{storeSlug}/{orderId}) — where a successful
 * Place Order lands. Fetches the order by its id and keeps the store's theme,
 * so the celebration still feels like the shop the customer just bought from.
 * The backend returns the contact + delivery details only to the customer who
 * placed the order (`redacted: false`); anyone else opening the link sees the
 * order with those fields hidden.
 *
 * It is also where a buyer comes BACK to check on an order (the "View details"
 * link on /orders), so after the first half hour — or as soon as the seller
 * moves it on — the headline follows the order's real status in plain words
 * ("Your order is on the way"), with a step-by-step progress list, the
 * cancellation reason if any, and ways to reach the seller.
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
  // One silent session refresh when the details come back redacted: the
  // lookup authenticates optionally, so an owner whose 15-minute access token
  // lapsed gets no 401 to trigger the HTTP client's usual refresh-and-retry.
  const triedRefresh = useRef(false)
  const fresh =
    !!order &&
    order.status === 'PENDING' &&
    Date.now() - new Date(order.placedAt).getTime() < FRESH_MS
  usePrivatePageTitle(
    order && !fresh ? 'Your Order' : 'Order Placed',
    order?.storeName ?? shell?.name,
  )

  useEffect(() => {
    setOrder(undefined)
    setPollTick(0)
    triedRefresh.current = false
  }, [storeSlug, orderId])

  useEffect(() => {
    let cancelled = false
    publicOrderApi
      .get(storeSlug, orderId)
      .then(async (found) => {
        if (found.redacted && !triedRefresh.current) {
          triedRefresh.current = true
          try {
            await refreshSession('customer')
            found = await publicOrderApi.get(storeSlug, orderId)
          } catch {
            // Not signed in (or not the buyer) — the redacted view is right.
          }
        }
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

  const status = order ? orderStatusCopy(order) : orderStatusCopy({ status: 'PENDING', fulfilment: 'DELIVERY', storeName: '' })
  const cancelled = order?.status === 'CANCELLED'
  const sellerPhone = phoneDigits(shell?.footer?.support.phone)
  const sellerWhatsApp = phoneDigits(
    shell?.footer?.support.whatsapp ?? shell?.footer?.social.whatsapp,
    true,
  )

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
              className={buttonClass({ className: 'mt-5' })}
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
                  paymentState === 'failed' || cancelled
                    ? 'bg-danger/10 text-danger'
                    : paymentState === 'pending' || status.tone === 'wait'
                      ? 'bg-surface-alt text-muted'
                      : 'bg-success/10 text-success'
                }`}
              >
                {cancelled ? (
                  <CloseIcon className="h-8 w-8" />
                ) : (
                  <CheckIcon className="h-8 w-8" />
                )}
              </span>
              <h1 className="mt-4 font-body text-2xl font-semibold tracking-normal">
                {cancelled
                  ? status.headline
                  : paymentState === 'pending'
                    ? 'Completing your payment…'
                    : paymentState === 'failed'
                      ? 'Payment not completed'
                      : fresh
                        ? 'Order placed!'
                        : status.headline}
              </h1>
              <p className="mt-1 max-w-full text-sm text-muted [overflow-wrap:anywhere]">
                {cancelled
                  ? status.next
                  : paymentState === 'pending'
                    ? 'We are confirming your payment — this page refreshes automatically.'
                    : paymentState === 'failed'
                      ? 'Your payment did not go through. Your order is saved — you can try again below.'
                      : fresh
                        ? `Thanks${order.customerName ? `, ${order.customerName}` : ''} — ${order.storeName} has received your order. We'll show every update here.`
                        : status.next}
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
                  : order.status === 'DELIVERED'
                    ? 'Paid on delivery'
                    : cancelled
                      ? 'Cash on delivery — nothing to pay'
                      : 'Pay on delivery'}
              </p>
              {!cancelled && (paymentState === 'pending' || paymentState === 'failed') && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <Button loading={retrying} onClick={() => void retryPayment()}>
                    {retrying
                      ? 'Opening payment…'
                      : paymentState === 'failed'
                        ? 'Retry payment'
                        : 'Pay now'}
                  </Button>
                  {retryError && (
                    <p className="text-xs font-semibold text-danger">
                      {retryError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Where the order is now — plain-words steps with times */}
            <section
              aria-label="Order progress"
              className="mt-8 rounded-xl border border-line bg-surface p-5"
            >
              <h2 className="font-body text-base font-semibold tracking-normal">
                Order progress
              </h2>
              {cancelled ? (
                <div className="mt-3 rounded-lg bg-danger/10 px-4 py-3 text-sm">
                  <p className="font-semibold text-danger">
                    Cancelled
                    {order.cancelledAt && ` · ${formatStepTime(order.cancelledAt)}`}
                  </p>
                  {order.cancelledByCustomer ? (
                    <p className="mt-1 text-fg">You cancelled this order.</p>
                  ) : (
                    order.cancelReason && (
                      <p className="mt-1 text-fg">
                        Reason from the seller: {order.cancelReason}
                      </p>
                    )
                  )}
                  {order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID' && (
                    <p className="mt-1 text-muted">
                      You paid online — contact the seller below about your refund.
                    </p>
                  )}
                </div>
              ) : (
                <ol className="mt-3 space-y-3">
                  {orderProgress(order).map((step) => (
                    <li key={step.key} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          step.done
                            ? 'border-success bg-success text-white'
                            : 'border-line bg-surface'
                        }`}
                      >
                        {step.done && <CheckIcon className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 text-sm">
                        <p
                          className={
                            step.current
                              ? 'font-semibold text-fg'
                              : step.done
                                ? 'text-fg'
                                : 'text-muted'
                          }
                        >
                          {step.label}
                          <span className="sr-only">
                            {step.done ? ' — done' : ' — not yet'}
                          </span>
                        </p>
                        {step.at && (
                          <p className="text-xs text-muted">{formatStepTime(step.at)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* What was ordered */}
            <section className="mt-4 rounded-xl border border-line bg-surface">
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
                  <p className="whitespace-pre-line [overflow-wrap:anywhere]">
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
                {order.redacted && (
                  <p className="mt-2 text-xs">
                    Sign in with the account that placed this order to see
                    the delivery details.
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

            {/* Reaching the seller — a first-time buyer's first question */}
            <section className="mt-4 rounded-xl border border-line bg-surface p-5">
              <h2 className="font-body text-base font-semibold tracking-normal">
                Questions about this order?
              </h2>
              <p className="mt-1 text-sm text-muted">
                Contact {order.storeName} directly. Mention order{' '}
                <span className="font-semibold text-fg">{order.orderNumber}</span>.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {sellerPhone && (
                  <a
                    href={`tel:+${sellerPhone.length === 10 ? `91${sellerPhone}` : sellerPhone}`}
                    className={buttonClass({ variant: 'ring', className: 'sm:flex-1' })}
                  >
                    <PhoneCallIcon className="h-4 w-4" />
                    Call seller
                  </a>
                )}
                {sellerWhatsApp && (
                  <a
                    href={`https://wa.me/${sellerWhatsApp}?text=${encodeURIComponent(
                      `Hi ${order.storeName}, I have a question about my order ${order.orderNumber}.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass({ variant: 'ring', className: 'sm:flex-1' })}
                  >
                    <ChatIcon className="h-4 w-4" />
                    WhatsApp seller
                  </a>
                )}
                <Link
                  to={storeSupportUrl(order.storeSlug)}
                  className={buttonClass({ variant: 'ring', className: 'sm:flex-1' })}
                >
                  <LifebuoyIcon className="h-4 w-4" />
                  Send a message
                </Link>
              </div>
            </section>

            {!order.redacted &&
              order.status === 'PENDING' &&
              order.paymentStatus !== 'PAID' &&
              order.paymentStatus !== 'REFUNDED' && (
                <CancelOrderRow order={order} onCancelled={setOrder} />
              )}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Link
                to={storeHomeUrl(order.storeSlug)}
                className={buttonClass({ size: 'lg' })}
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

/**
 * "Changed your mind?" — the buyer may cancel until the seller confirms, and
 * only while nothing is paid (a paid order needs a real refund, which goes
 * through the store). Quiet on purpose: it is an escape hatch, not a CTA.
 */
function CancelOrderRow({
  order,
  onCancelled,
}: {
  order: PlacedOrder
  onCancelled: (order: PlacedOrder) => void
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = async () => {
    setBusy(true)
    setError(null)
    try {
      onCancelled(await publicOrderApi.cancel(order.storeSlug, order.id))
      setAsking(false)
    } catch (err) {
      setError(toApiError(err).message)
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          Changed your mind? You can cancel until {order.storeName} confirms
          your order.
        </p>
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="font-semibold text-danger hover:underline"
        >
          Cancel order
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <ConfirmDialog
        open={asking}
        title="Cancel this order?"
        description={`${order.orderNumber} from ${order.storeName} will be cancelled and the seller told not to send it.`}
        confirmLabel="Yes, cancel order"
        cancelLabel="Keep my order"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setAsking(false)}
      />
    </section>
  )
}
