import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * WHICH APP is rendering the store-management pages.
 *
 * The pages under `pages/stores/` were written for the seller managing their
 * own shop. The admin console now renders the very same components against
 * the same backend plugin (mounted twice — see `stores.routes.ts`), so that
 * support sees exactly the screen the seller is describing on the phone,
 * rather than a second, subtly different admin rebuild of it.
 *
 * Almost nothing has to differ between the two, and this holds the little
 * that does: where "back" goes, how a store's URL is spelled, and which
 * sections the mode is not allowed to open. Everything else — every form,
 * every validation, every save — is shared code.
 *
 * The default is the OWNER scope, so the storefront gets today's behaviour
 * without providing anything; only the admin console wraps its routes.
 */
export type StoreManageMode = 'owner' | 'admin'

export interface StoreManageScope {
  mode: StoreManageMode
  /** The list this store was opened from — the "back" target. */
  indexPath: string
  /** Route base for one store's management pages, without a trailing slash. */
  storePath: (slug: string) => string
  /**
   * Section `to` values this mode must not render.
   *
   * Presentation only — the real enforcement is that the admin mount never
   * registers these routes at all (a hidden nav row is a courtesy to the
   * admin, not a security control).
   */
  hiddenSections: readonly string[]
}

export const OWNER_STORE_SCOPE: StoreManageScope = {
  mode: 'owner',
  indexPath: '/mystores',
  storePath: (slug) => `/mystores/${slug}`,
  hiddenSections: [],
}

/**
 * Hidden for admins, and matching what the backend refuses to route:
 *
 *  - `bank-accounts` — where the store's money lands. No support task needs
 *    to change it, and it is the highest-value target on the platform.
 *  - `business` — the seller's legal identity: trading name, the accountable
 *    person, the registered address and the tax IDs (PAN, GSTIN). This is
 *    what the platform holds the seller TO, and it is the seller's own
 *    declaration to make. Support fixing a product listing is a favour;
 *    support altering who a business legally is, is a different act, and one
 *    the seller must not be able to disown afterwards. Its contact fields are
 *    bound to verified account identifiers for the same reason.
 *  - `customer-support` / `support` — both inboxes attribute messages to the
 *    seller, so an admin writing there would be speaking in the seller's
 *    name. The platform side of those threads lives at /admin/support.
 *
 * Admins still SEE this information — read-only, on the console's own store
 * detail page. Hidden here means "not editable in the seller's name".
 */
export const ADMIN_STORE_SCOPE: StoreManageScope = {
  mode: 'admin',
  indexPath: '/stores',
  storePath: (slug) => `/stores/${slug}/manage`,
  hiddenSections: ['bank-accounts', 'business', 'customer-support', 'support'],
}

const StoreManageScopeContext =
  createContext<StoreManageScope>(OWNER_STORE_SCOPE)

export function useStoreManageScope(): StoreManageScope {
  return useContext(StoreManageScopeContext)
}

export function StoreManageScopeProvider({
  scope,
  children,
}: {
  scope: StoreManageScope
  children: ReactNode
}) {
  return (
    <StoreManageScopeContext.Provider value={scope}>
      {children}
    </StoreManageScopeContext.Provider>
  )
}
