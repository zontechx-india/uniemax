import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom'
import { AppLayout } from '../layout/AppLayout'
import { RequireCustomer } from './RequireCustomer'
import { LoginRoute } from '../pages/LoginRoute'

/**
 * `/stores/**` → `/mystores/**`, forwarding the rest of the path, the query
 * and the hash untouched.
 *
 * Store management moved off `/stores` because it read as the public
 * storefront (`/store/{slug}`). This keeps every link already in the wild
 * working — notification rows in the database, a seller's bookmark, a link
 * someone pasted into a support thread — and `replace` keeps the dead prefix
 * out of the seller's back button.
 */
function LegacyStoresRedirect() {
  const rest = useParams()['*'] ?? ''
  const { search, hash } = useLocation()
  return <Navigate to={`/mystores${rest ? `/${rest}` : ''}${search}${hash}`} replace />
}

/**
 * Marketplace router — everything that is not the per-store shopping surface
 * (`/store`, `/cart`, `/checkout` live in `publicRouter.tsx`).
 *
 * Three tiers:
 *   1. PUBLIC pages — the marketplace homepage `/`, `/login`, and the footer
 *      info pages. They render for guests; session-aware bits adapt via
 *      `useMarketSession()`.
 *   2. The ACCOUNT subtree — wrapped in `<RequireCustomer>` (guests are
 *      redirected to /login?next=…), then in the existing `AppLayout` shell.
 *   3. Fallback — unknown paths go home.
 *
 * Every page is a `lazy` route, so each one is a separate chunk.
 */
export const router = createBrowserRouter([
  // ---- Public marketplace pages -------------------------------------------
  {
    path: '/',
    lazy: async () => ({
      Component: (await import('../pages/HomePage')).HomePage,
    }),
  },
  { path: '/login', element: <LoginRoute /> },
  // Footer links — real routes with a lightweight public placeholder, so a
  // shared link lands on "coming soon" rather than a 404/redirect.
  // `support` is NOT among them: it is a real page in the account subtree
  // below, since a ticket needs to know who is writing.
  ...['about', 'privacy', 'terms', 'contact'].map((page) => ({
    path: `/${page}`,
    lazy: async () => ({
      Component: (await import('../pages/InfoComingSoonPage')).InfoComingSoonPage,
    }),
  })),

  // ---- Account subtree (signed-in customers only) --------------------------
  {
    element: <RequireCustomer />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: 'orders',
            lazy: async () => ({
              Component: (await import('../pages/OrdersPage')).OrdersPage,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('../pages/ProfilePage')).ProfilePage,
            }),
          },
          {
            path: 'addresses',
            lazy: async () => ({
              Component: (await import('../pages/AddressesPage')).AddressesPage,
            }),
          },
          // Help & Support for the ACCOUNT (a shopper writing to UnieMax).
          // Tickets about a store the customer owns live under that store —
          // see the `stores/:storeSlug/support` routes below.
          {
            path: 'support',
            lazy: async () => ({
              Component: (await import('../pages/SupportPage')).SupportPage,
            }),
          },
          {
            path: 'support/:ticketId',
            lazy: async () => ({
              Component: (await import('../pages/SupportTicketPage')).SupportTicketPage,
            }),
          },
          // Store creation & management (a customer can own multiple stores).
          //
          // `/mystores`, not `/stores`: the public storefront lives at
          // `/store/{slug}`, and one plural letter between "the shop you are
          // buying from" and "the shops you own" was not enough — support
          // threads and internal links kept landing on the wrong one.
          //
          // The old prefix REDIRECTS rather than 404s (below): notification
          // rows already written to the database carry `/stores/{slug}/...`
          // deep links, and those have to keep resolving for as long as the
          // rows live.
          {
            path: 'stores/*',
            Component: LegacyStoresRedirect,
          },
          {
            path: 'mystores',
            lazy: async () => ({
              Component: (await import('../pages/stores/StoresPage')).StoresPage,
            }),
          },
          {
            path: 'mystores/new',
            lazy: async () => ({
              Component: (await import('../pages/stores/CreateStorePage')).CreateStorePage,
            }),
          },
          // Full-width theme preview. A SIBLING of the manage layout, not a
          // child: inside that layout the preview shares its row with the
          // 260px section nav, which on a 1024px laptop leaves it narrower
          // than a 768px tablet gets. React Router ranks by specificity, so
          // this four-segment path wins over the layout's 'appearance' child.
          {
            path: 'mystores/:storeSlug/appearance/preview',
            lazy: async () => ({
              Component: (await import('../pages/stores/StoreThemePreviewPage'))
                .StoreThemePreviewPage,
            }),
          },
          {
            path: 'mystores/:storeSlug',
            lazy: async () => ({
              Component: (await import('../pages/stores/StoreManageLayout')).StoreManageLayout,
            }),
            children: [
              // Dashboard is the manage landing; Store Details lives at
              // /mystores/{slug}/details.
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreDashboardPage')).StoreDashboardPage,
                }),
              },
              {
                path: 'orders',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreOrdersPage')).StoreOrdersPage,
                }),
              },
              {
                path: 'orders/:orderId',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreOrderDetailPage')).StoreOrderDetailPage,
                }),
              },
              {
                path: 'details',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreDetailsPage')).StoreDetailsPage,
                }),
              },
              {
                // Business identity, addresses and tax IDs — the permanent
                // home of what the Create Store wizard collects.
                path: 'business',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreBusinessPage')).StoreBusinessPage,
                }),
              },
              {
                path: 'appearance',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreAppearancePage')).StoreAppearancePage,
                }),
              },
              {
                path: 'homepage',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreHomepagePage')).StoreHomepagePage,
                }),
              },
              {
                path: 'footer',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreFooterPage')).StoreFooterPage,
                }),
              },
              {
                path: 'bank-accounts',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreBankPage')).StoreBankPage,
                }),
              },
              {
                path: 'payments',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StorePaymentsPage')).StorePaymentsPage,
                }),
              },
              {
                path: 'shipping',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreShippingPage')).StoreShippingPage,
                }),
              },
              {
                path: 'checkout',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreCheckoutPage')).StoreCheckoutPage,
                }),
              },
              {
                path: 'categories',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreCategoriesPage')).StoreCategoriesPage,
                }),
              },
              {
                path: 'products',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreProductsPage')).StoreProductsPage,
                }),
              },
              // The shop's own inbox — buyers who wrote in from the
              // storefront's Help & Support. Answered by the seller; UnieMax
              // never sees these.
              {
                path: 'customer-support',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreCustomerSupportPage'))
                    .StoreCustomerSupportPage,
                }),
              },
              {
                path: 'customer-support/:ticketId',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreCustomerSupportTicketPage'))
                    .StoreCustomerSupportTicketPage,
                }),
              },
              // Contact the UnieMax team: the contact details plus this
              // store's tickets, and one ticket's thread.
              {
                path: 'support',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreSupportPage')).StoreSupportPage,
                }),
              },
              {
                path: 'support/:ticketId',
                lazy: async () => ({
                  Component: (await import('../pages/stores/StoreSupportTicketPage'))
                    .StoreSupportTicketPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },

  // ---- Fallback -------------------------------------------------------------
  { path: '*', element: <Navigate to="/" replace /> },
])
