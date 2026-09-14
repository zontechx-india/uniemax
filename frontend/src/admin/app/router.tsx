import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { Skeleton } from '../ui/primitives'
import { useAdminSession } from './adminSession'
import {
  ADMIN_STORE_SCOPE,
  StoreManageScopeProvider,
} from '../../storefront/features/stores/storeManageScope'

/**
 * Console routes.
 *
 * Every page is a lazy chunk: an admin who only ever opens Orders never
 * downloads the dashboard's charts. The shell itself is eager, so navigation
 * inside the console never flashes a blank screen — only the page area shows
 * the fallback.
 *
 * The router's basename is `/admin` (set in `AdminApp`), which is where nginx
 * serves this build. Paths here are written WITHOUT that prefix.
 */

const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const StoresPage = lazy(() => import('../pages/StoresPage'))
const StoreDetailPage = lazy(() => import('../pages/StoreDetailPage'))
const CustomersPage = lazy(() => import('../pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('../pages/CustomerDetailPage'))
const OrdersPage = lazy(() => import('../pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('../pages/OrderDetailPage'))
const PaymentsPage = lazy(() => import('../pages/PaymentsPage'))
const ProductsPage = lazy(() => import('../pages/ProductsPage'))
const CategoriesPage = lazy(() => import('../pages/CategoriesPage'))
const CategoryMappingPage = lazy(() => import('../pages/CategoryMappingPage'))
const SupportPage = lazy(() => import('../pages/SupportPage'))
const SupportTicketPage = lazy(() => import('../pages/SupportTicketPage'))
const ThemeTemplatesPage = lazy(() => import('../pages/ThemeTemplatesPage'))
const BannersPage = lazy(() => import('../pages/BannersPage'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'))
const ActivityPage = lazy(() => import('../pages/ActivityPage'))
const AdminsPage = lazy(() => import('../pages/AdminsPage'))

/**
 * Managing a seller's shop.
 *
 * These are not admin rebuilds of the seller's screens — they ARE the seller's
 * screens, imported from `storefront/pages/stores` and pointed at the admin
 * mount of the same backend plugin (`configureStoresApi` in `AdminApp`). An
 * admin on a support call therefore sees exactly what the seller is looking
 * at, and a change to a catalog form reaches both at once.
 *
 * One lazy chunk for the whole subtree: an admin who never opens a store
 * never downloads any of it, and once they do, moving between sections costs
 * nothing. `StoreManageScopeProvider` supplies the admin scope — which is what
 * redirects "back" to the console's store list and hides the sections this
 * mount does not serve.
 */
const StoreManageLayout = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreManageLayout'))
    .StoreManageLayout,
}))
const StoreDashboardPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreDashboardPage'))
    .StoreDashboardPage,
}))
const StoreOrdersPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreOrdersPage'))
    .StoreOrdersPage,
}))
const StoreOrderDetailPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreOrderDetailPage'))
    .StoreOrderDetailPage,
}))
const StoreDetailsPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreDetailsPage'))
    .StoreDetailsPage,
}))
const StoreAppearancePage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreAppearancePage'))
    .StoreAppearancePage,
}))
const StoreThemePreviewPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreThemePreviewPage'))
    .StoreThemePreviewPage,
}))
const StoreHomepagePage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreHomepagePage'))
    .StoreHomepagePage,
}))
const StoreBannersPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreBannersPage'))
    .StoreBannersPage,
}))
const StoreFooterPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreFooterPage'))
    .StoreFooterPage,
}))
const StorePaymentsPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StorePaymentsPage'))
    .StorePaymentsPage,
}))
const StoreShippingPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreShippingPage'))
    .StoreShippingPage,
}))
const StoreCheckoutPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreCheckoutPage'))
    .StoreCheckoutPage,
}))
const StoreCategoriesPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreCategoriesPage'))
    .StoreCategoriesPage,
}))
const StoreProductsPage = lazy(async () => ({
  default: (await import('../../storefront/pages/stores/StoreProductsPage'))
    .StoreProductsPage,
}))

const PageFallback = () => <Skeleton rows={8} />

/**
 * Wraps the store-management subtree: SUPER_ADMIN only, with the admin scope
 * supplied to the shared seller pages.
 *
 * The role check is a redirect rather than a hidden link, because the link is
 * not the only way in — a pasted URL or a stale bookmark would otherwise
 * render the whole dashboard shell around an API that answers 403 to every
 * call, which reads as "broken" rather than "not yours". The API is still the
 * thing that enforces it; this only decides what the console offers.
 */
function StoreManageGate({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useAdminSession()
  if (!isSuperAdmin) return <Navigate to="/stores" replace />
  return (
    <StoreManageScopeProvider scope={ADMIN_STORE_SCOPE}>
      {children}
    </StoreManageScopeProvider>
  )
}

export function AdminRouter() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route
          path="/*"
          element={
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="stores" element={<StoresPage />} />
                {/* The seller's own management screens, rendered for an admin.
                    Declared BEFORE "stores/:storeId" so the literal "manage"
                    segment is never read as a store id. The full-width theme
                    preview is a sibling of the layout, not a child, for the
                    same reason it is in the storefront router: inside the
                    layout it would share its row with the 260px section nav. */}
                <Route
                  path="stores/:storeSlug/manage/appearance/preview"
                  element={
                    <StoreManageGate>
                      <StoreThemePreviewPage />
                    </StoreManageGate>
                  }
                />
                <Route
                  path="stores/:storeSlug/manage"
                  element={
                    <StoreManageGate>
                      <StoreManageLayout />
                    </StoreManageGate>
                  }
                >
                  <Route index element={<StoreDashboardPage />} />
                  <Route path="orders" element={<StoreOrdersPage />} />
                  <Route path="orders/:orderId" element={<StoreOrderDetailPage />} />
                  <Route path="details" element={<StoreDetailsPage />} />
                  <Route path="appearance" element={<StoreAppearancePage />} />
                  <Route path="homepage" element={<StoreHomepagePage />} />
                  <Route path="banners" element={<StoreBannersPage />} />
                  <Route path="footer" element={<StoreFooterPage />} />
                  <Route path="payments" element={<StorePaymentsPage />} />
                  <Route path="shipping" element={<StoreShippingPage />} />
                  <Route path="checkout" element={<StoreCheckoutPage />} />
                  <Route path="categories" element={<StoreCategoriesPage />} />
                  <Route path="products" element={<StoreProductsPage />} />
                </Route>
                <Route path="stores/:storeId" element={<StoreDetailPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:customerId" element={<CustomerDetailPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:orderId" element={<OrderDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="category-mapping" element={<CategoryMappingPage />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="support/:ticketId" element={<SupportTicketPage />} />
                <Route path="theme-templates" element={<ThemeTemplatesPage />} />
                <Route path="banners" element={<BannersPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="admins" element={<AdminsPage />} />
                {/* Unknown console paths go home rather than 404 — there is
                    no useful "not found" story inside a fixed nav. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}
