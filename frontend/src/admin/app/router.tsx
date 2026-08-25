import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { Skeleton } from '../ui/primitives'

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
const SupportPage = lazy(() => import('../pages/SupportPage'))
const SupportTicketPage = lazy(() => import('../pages/SupportTicketPage'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'))
const ActivityPage = lazy(() => import('../pages/ActivityPage'))
const AdminsPage = lazy(() => import('../pages/AdminsPage'))

const PageFallback = () => <Skeleton rows={8} />

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
                <Route path="stores/:storeId" element={<StoreDetailPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:customerId" element={<CustomerDetailPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:orderId" element={<OrderDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="support/:ticketId" element={<SupportTicketPage />} />
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
