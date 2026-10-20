import type { RouteObject } from 'react-router-dom'

/**
 * PUBLIC facade of the dropship package — what the host apps import.
 *
 * Route arrays the storefront and admin routers spread into place, and the
 * role hook the store nav reads. The pages import from `shared/` and these
 * host files: `marketSession`, `authDialogStore`, `useManagedStore`,
 * `storesApi` (types), `AddressFields` / `storeProfile`, `layout/icons` and
 * the seller UI kit (`pages/stores/ui`). That list is the whole dependency on
 * the host. Design and status: docs/dropshipping/.
 */

export {
  isEnabled as isDropshipEnabled,
  refreshDropshipRole,
  useDropshipRole,
} from './role'
export type { DropshipRole } from './role'
export { SupplierHome } from './pages/supplier/SupplierHome'

/** /supplier-invite/:token — public, outside any layout. */
export const dropshipPublicRoutes: RouteObject[] = [
  {
    path: '/supplier-invite/:token',
    lazy: async () => ({ Component: (await import('./pages/JoinPage')).JoinPage }),
  },
]

/** /mystores/:storeSlug/** — the seller's and the supplier's sections inside store management. */
export const dropshipStoreRoutes: RouteObject[] = [
  {
    path: 'suppliers',
    lazy: async () => ({
      Component: (await import('./pages/seller/SuppliersPage')).SuppliersPage,
    }),
  },
  {
    path: 'supply',
    lazy: async () => ({
      Component: (await import('./pages/supplier/SupplyPage')).SupplyPage,
    }),
  },
  {
    path: 'sellers',
    lazy: async () => ({
      Component: (await import('./pages/supplier/SellersPage')).SellersPage,
    }),
  },
  {
    path: 'supplier-settings',
    lazy: async () => ({
      Component: (await import('./pages/supplier/SupplierSettingsPage')).SupplierSettingsPage,
    }),
  },
]

/** The store-section `to` values above — hidden where the package has no mount (admin view). */
export const DROPSHIP_SECTIONS = ['suppliers', 'supply', 'sellers', 'supplier-settings'] as const
