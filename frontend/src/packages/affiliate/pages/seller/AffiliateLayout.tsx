import { Outlet, useOutletContext } from 'react-router-dom'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { TabNav } from '../../ui'

export interface SellerAffiliateContext {
  storeId: string
  storeSlug: string
}

export const useSellerAffiliate = () => useOutletContext<SellerAffiliateContext>()

/**
 * The Affiliate Marketing section of store management. This is the one file
 * that reads the host's store context; the tabs only ever see a store id.
 */
export function AffiliateLayout() {
  const { store } = useManagedStore()

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Affiliate Marketing
      </h2>
      <p className="mt-1 text-sm text-muted">
        Invite partners to promote your products. They share links, you pay a commission only
        on orders that come through them.
      </p>

      <TabNav
        tabs={[
          { label: 'Programme', to: '.', end: true },
          { label: 'Products', to: 'products' },
          { label: 'Partners', to: 'partners' },
          { label: 'Commissions', to: 'commissions' },
        ]}
      />

      <div className="mt-5">
        <Outlet
          context={{ storeId: store.id, storeSlug: store.slug } satisfies SellerAffiliateContext}
        />
      </div>
    </div>
  )
}
