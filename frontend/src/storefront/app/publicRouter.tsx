import {
  createBrowserRouter,
  Outlet,
  ScrollRestoration,
  useParams,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { PublicStoreLayout } from '../features/publicStore/PublicStoreLayout'
import { RouteError } from '../../shared/ui/RouteError'

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

// Cart → checkout → confirmation are lazy too: most visitors browse and never
// reach them, and CheckoutPage + CheckoutSteps alone are ~1,700 lines.
const CartPage = lazy(() =>
  import('../pages/cart/CartPage').then((m) => ({ default: m.CartPage })),
)
const CartStorePage = lazy(() =>
  import('../pages/cart/CartStorePage').then((m) => ({ default: m.CartStorePage })),
)
const CheckoutPage = lazy(() =>
  import('../pages/cart/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
)
const OrderSuccessPage = lazy(() =>
  import('../pages/cart/OrderSuccessPage').then((m) => ({
    default: m.OrderSuccessPage,
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

export const publicRouter = createBrowserRouter([
  {
    element: <PublicRoot />,
    errorElement: <RouteError />,
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
      { path: '/cart', element: lazyRoute(<CartPage />) },
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
  return lazyRoute(<CartStorePage storeSlug={storeSlug} />)
}

function CheckoutRoute() {
  const { storeSlug = '' } = useParams()
  return lazyRoute(<CheckoutPage storeSlug={storeSlug} />)
}

function OrderSuccessRoute() {
  const { storeSlug = '', orderId = '' } = useParams()
  return lazyRoute(<OrderSuccessPage storeSlug={storeSlug} orderId={orderId} />)
}
