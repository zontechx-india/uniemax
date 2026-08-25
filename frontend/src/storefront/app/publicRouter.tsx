import {
  createBrowserRouter,
  Outlet,
  ScrollRestoration,
  useParams,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { PublicStoreLayout } from '../features/publicStore/PublicStoreLayout'
import { CartPage } from '../pages/cart/CartPage'
import { CartStorePage } from '../pages/cart/CartStorePage'
import { CheckoutPage } from '../pages/cart/CheckoutPage'
import { OrderSuccessPage } from '../pages/cart/OrderSuccessPage'

/**
 * Router for the **public** (no sign-in) shopping surface. Mounted by
 * `StorefrontApp` *before* the session gate, so none of these pages require an
 * account.
 *
 *   /store/:storeSlug                        homepage
 *   /store/:storeSlug/category/:categorySlug category page
 *   /store/:storeSlug/product/:productSlug   product detail (variant picker)
 *   /store/:storeSlug/shop[?q=]              browse all / search results
 *   /store/:storeSlug/support[/:ticketId]    Help & Support WITH THIS SHOP —
 *                                            the shop's contact details (open
 *                                            to everyone) plus tracked
 *                                            requests (need an account)
 *   /cart, /cart/:storeSlug                  cart (deliberately OUTSIDE the
 *                                            store layout — one cart spans
 *                                            every store the visitor shops)
 *
 * Store pages are lazy so the homepage bundle stays small.
 */
const StoreHomePage = lazy(() =>
  import('../pages/store/StoreHomePage').then((m) => ({
    default: m.StoreHomePage,
  })),
)
const StoreCategoryPage = lazy(() =>
  import('../pages/store/StoreCategoryPage').then((m) => ({
    default: m.StoreCategoryPage,
  })),
)
const StoreProductPage = lazy(() =>
  import('../pages/store/StoreProductPage').then((m) => ({
    default: m.StoreProductPage,
  })),
)
const StoreShopPage = lazy(() =>
  import('../pages/store/StoreShopPage').then((m) => ({
    default: m.StoreShopPage,
  })),
)
const StoreHelpPage = lazy(() =>
  import('../pages/store/StoreHelpPage').then((m) => ({
    default: m.StoreHelpPage,
  })),
)
const StoreHelpTicketPage = lazy(() =>
  import('../pages/store/StoreHelpTicketPage').then((m) => ({
    default: m.StoreHelpTicketPage,
  })),
)

function Loading() {
  return <p className="py-16 text-center text-sm text-muted">Loading…</p>
}

const lazyRoute = (element: React.ReactNode) => (
  <Suspense fallback={<Loading />}>{element}</Suspense>
)

/**
 * Pathless root shared by every public route. `ScrollRestoration` resets
 * scroll on forward navigation and restores it on back/forward — paired with
 * the listing cache in `useProductQuery` (which re-renders the list
 * synchronously), product page → back lands exactly where the visitor left.
 */
function PublicRoot() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

/**
 * Friendly fallback for unmatched paths / render errors inside this router
 * (instead of React Router's raw developer error screen). Plain <a> links —
 * after an error, a clean full-page load is the safest way out.
 */
function PublicError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center text-fg">
      <h1 className="font-body text-2xl font-semibold tracking-normal">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The page you're looking for doesn't exist or something went wrong
        loading it.
      </p>
      <div className="mt-6 flex gap-3">
        <a
          href="/"
          className="rounded-md bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
        >
          Back to UnieMax
        </a>
        <a
          href="/cart"
          className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface-alt hover:text-fg"
        >
          Your cart
        </a>
      </div>
    </div>
  )
}

export const publicRouter = createBrowserRouter([
  {
    element: <PublicRoot />,
    errorElement: <PublicError />,
    children: [
      {
        path: '/store/:storeSlug',
        element: <PublicStoreLayout />,
        children: [
          { index: true, element: lazyRoute(<StoreHomePage />) },
          {
            path: 'category/:categorySlug',
            element: lazyRoute(<StoreCategoryPage />),
          },
          {
            path: 'product/:productSlug',
            element: lazyRoute(<StoreProductPage />),
          },
          // Browse-all; `?q=` search results; `?section=` merchandising row.
          { path: 'shop', element: lazyRoute(<StoreShopPage />) },
          // Contacting THIS shop (not UnieMax — that is /support).
          { path: 'support', element: lazyRoute(<StoreHelpPage />) },
          {
            path: 'support/:ticketId',
            element: lazyRoute(<StoreHelpTicketPage />),
          },
        ],
      },
      { path: '/cart', element: <CartPage /> },
      { path: '/cart/:storeSlug', element: <CartStoreRoute /> },
      // Per-store order review — orders are placed per store, so the target
      // of every "Place Order" button carries exactly one store's items.
      { path: '/checkout/:storeSlug', element: <CheckoutRoute /> },
      // Confirmation a successful Place Order lands on (guest-friendly).
      { path: '/order/:storeSlug/:orderId', element: <OrderSuccessRoute /> },
    ],
  },
])

/** Adapts the route param to `CartStorePage`'s prop-based API. */
function CartStoreRoute() {
  const { storeSlug = '' } = useParams()
  return <CartStorePage storeSlug={storeSlug} />
}

function CheckoutRoute() {
  const { storeSlug = '' } = useParams()
  return <CheckoutPage storeSlug={storeSlug} />
}

function OrderSuccessRoute() {
  const { storeSlug = '', orderId = '' } = useParams()
  return <OrderSuccessPage storeSlug={storeSlug} orderId={orderId} />
}
