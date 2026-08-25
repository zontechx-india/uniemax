/**
 * Console navigation — the single source of truth for the sidebar, the
 * mobile drawer and the document title. Adding a page is one entry here plus
 * one route in `router.tsx`.
 *
 * Grouped by what an admin is doing, because a flat list of eleven items
 * makes a once-a-month setting look as urgent as the daily queue:
 *   Overview   — the numbers, checked first
 *   Commerce   — the day's work (orders, payments, catalog)
 *   Accounts   — who is on the platform
 *   Platform   — announcements, security, configuration
 */

export interface NavItem {
  to: string
  label: string
  /** `end` = match this path exactly (otherwise "/" highlights everywhere). */
  end?: boolean
  /** Only a SUPER_ADMIN sees the item — the API enforces it regardless. */
  superAdminOnly?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', end: true }],
  },
  {
    title: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders' },
      { to: '/payments', label: 'Payments' },
      { to: '/products', label: 'Products' },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { to: '/stores', label: 'Stores & sellers' },
      { to: '/customers', label: 'Customers' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/support', label: 'Support' },
      { to: '/notifications', label: 'Notifications' },
      { to: '/activity', label: 'Activity log' },
      { to: '/admins', label: 'Admin users', superAdminOnly: true },
    ],
  },
]

/** Browser tab title per path prefix — longest match wins. */
const TITLES: [string, string][] = [
  ['/orders', 'Orders'],
  ['/payments', 'Payments'],
  ['/products', 'Products'],
  ['/stores', 'Stores'],
  ['/customers', 'Customers'],
  ['/support', 'Support'],
  ['/notifications', 'Notifications'],
  ['/activity', 'Activity log'],
  ['/admins', 'Admin users'],
]

export function titleForPath(pathname: string): string {
  const match = TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return `${match?.[1] ?? 'Dashboard'} · UnieMax Admin`
}
