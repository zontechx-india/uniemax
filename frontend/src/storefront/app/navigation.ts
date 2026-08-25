import type { ComponentType } from 'react'
import { BagIcon, LifebuoyIcon, MapPinIcon, UserIcon } from '../layout/icons'

/**
 * Single source of truth for the account navigation (the top-bar avatar
 * dropdown). The old sidebar is gone — the account menu is the one place
 * these links live. Adding a page = one entry here + one route in
 * `app/router.tsx`.
 */
export interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

/**
 * Top-bar avatar dropdown (Flipkart-style "Your Account" menu).
 * Two rows are NOT listed here because they're dynamic actions rendered by
 * `AccountMenu` itself: the store row ("Create Store" / "My Store",
 * depending on whether the customer owns any) and Logout (needs the
 * confirm-dialog flow).
 */
export const ACCOUNT_MENU_ITEMS: NavItem[] = [
  { label: 'My Profile', to: '/profile', icon: UserIcon },
  { label: 'Orders', to: '/orders', icon: BagIcon },
  { label: 'Saved Addresses', to: '/addresses', icon: MapPinIcon },
  // Last, because it is where someone goes when one of the rows above has
  // gone wrong — the same reason Help sits at the bottom of store management.
  { label: 'Help & Support', to: '/support', icon: LifebuoyIcon },
]
