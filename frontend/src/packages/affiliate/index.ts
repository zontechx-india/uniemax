import type { RouteObject } from 'react-router-dom'

/**
 * PUBLIC facade of the affiliate package — what the host apps import.
 *
 * Route arrays the storefront and admin routers spread into place, plus the
 * attribution helpers checkout needs. The pages import from `shared/` and from
 * four host files (`marketSession`, `authDialogStore`, `useManagedStore`,
 * `ActiveSwitch`) — that list is the whole dependency on the host.
 */

/** /a/:token and /affiliate/invite/:token — public, outside any layout. */
export const affiliatePublicRoutes: RouteObject[] = [
  {
    path: '/a/:token',
    lazy: async () => ({ Component: (await import('./pages/ClickPage')).ClickPage }),
  },
  {
    path: '/affiliate/invite/:token',
    lazy: async () => ({ Component: (await import('./pages/InvitePage')).InvitePage }),
  },
]

/** /affiliate/** — the partner portal, inside the signed-in account shell. */
export const affiliatePartnerRoutes: RouteObject = {
  path: 'affiliate',
  lazy: async () => ({
    Component: (await import('./pages/partner/PartnerLayout')).PartnerLayout,
  }),
  children: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/partner/OverviewPage')).OverviewPage,
      }),
    },
    {
      path: 'stores',
      lazy: async () => ({
        Component: (await import('./pages/partner/StoresPage')).StoresPage,
      }),
    },
    {
      path: 'links',
      lazy: async () => ({
        Component: (await import('./pages/partner/LinksPage')).LinksPage,
      }),
    },
    {
      path: 'commissions',
      lazy: async () => ({
        Component: (await import('./pages/partner/CommissionsPage')).CommissionsPage,
      }),
    },
  ],
}

/** /mystores/:storeSlug/affiliate/** — the seller's section inside store management. */
export const affiliateSellerRoutes: RouteObject = {
  path: 'affiliate',
  lazy: async () => ({
    Component: (await import('./pages/seller/AffiliateLayout')).AffiliateLayout,
  }),
  children: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/seller/ProgramTab')).ProgramTab,
      }),
    },
    {
      path: 'products',
      lazy: async () => ({
        Component: (await import('./pages/seller/ProductsTab')).ProductsTab,
      }),
    },
    {
      path: 'partners',
      lazy: async () => ({
        Component: (await import('./pages/seller/PartnersTab')).PartnersTab,
      }),
    },
    {
      path: 'commissions',
      lazy: async () => ({
        Component: (await import('./pages/seller/CommissionsTab')).CommissionsTab,
      }),
    },
  ],
}

export { clearAttribution, getAttribution } from './attribution'
