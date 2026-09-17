import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Store, StoreDashboard } from './storesApi'

/**
 * Outlet context passed by `StoreManageLayout` to its section pages —
 * the loaded store plus a callback to push saved updates back so the
 * layout header reflects them instantly.
 *
 * The **dashboard** lives here rather than on the Dashboard page because two
 * consumers need it: that page, and the Orders badge in the section nav. The
 * layout stays mounted across section navigation, so this is one request per
 * management session instead of one per visit to the Dashboard.
 */
export interface ManagedStoreContext {
  store: Store
  onStoreChange: (store: Store) => void
  /** Order counters + latest orders. `null` while loading or on failure. */
  dashboard: StoreDashboard | null
  dashboardError: string | null
  /**
   * Re-fetch the dashboard. Coalesces concurrent calls, so callers never
   * need to guard. Call it after anything that changes order state, so the
   * nav badge and the dashboard tiles stay truthful.
   */
  refreshDashboard: () => void
}

const Ctx = createContext<ManagedStoreContext | null>(null)

/**
 * Supplies the same context OUTSIDE the manage layout's outlet.
 *
 * The Store Builder is a full-width route of its own (it takes the whole
 * window — a preview sharing its row with a 264px section nav is not a
 * preview), so it has no outlet to inherit from. Rather than forking the
 * Banners and Footer screens to take props, it provides the identical context
 * around them: one implementation of each editor, used in both places.
 */
export function ManagedStoreProvider({
  value,
  children,
}: {
  value: ManagedStoreContext
  children: ReactNode
}) {
  return createElement(Ctx.Provider, { value }, children)
}

/**
 * The store being managed. Prefers an explicit provider, falling back to the
 * outlet context every section page has had since this file existed.
 */
export function useManagedStore(): ManagedStoreContext {
  const provided = useContext(Ctx)
  // Outside an outlet this is simply null, so reading it unconditionally is
  // safe and keeps the hook order stable.
  const outlet = useOutletContext<ManagedStoreContext | null>()
  const value = provided ?? outlet
  if (!value) {
    throw new Error(
      'useManagedStore must be used inside StoreManageLayout or ManagedStoreProvider',
    )
  }
  return value
}
