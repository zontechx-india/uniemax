import type { IconName } from '../layout/icons'

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
 *   Documents  — read-only reference pages (nothing to act on)
 */

export interface NavItem {
  to: string
  label: string
  /** Sidebar glyph (layout/icons.tsx). */
  icon: IconName
  /** `end` = match this path exactly (otherwise "/" highlights everywhere). */
  end?: boolean
  /** Only a SUPER_ADMIN sees the item — the API enforces it regardless. */
  superAdminOnly?: boolean
  /** Shown only when the supplier package is switched on (DROPSHIP_ENABLED). */
  dropship?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    title: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders', icon: 'orders' },
      { to: '/payments', label: 'Payments', icon: 'card' },
      { to: '/products', label: 'Products', icon: 'tag' },
      { to: '/categories', label: 'Categories', icon: 'layers' },
      { to: '/category-mapping', label: 'Category mapping', icon: 'shuffle' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/seller-payouts', label: 'Seller payouts', icon: 'wallet' },
      { to: '/finance/sellers', label: 'Seller balances', icon: 'scale' },
      { to: '/finance/fees', label: 'Fee settings', icon: 'percent' },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { to: '/stores', label: 'Stores & sellers', icon: 'store' },
      { to: '/customers', label: 'Customers', icon: 'users' },
      { to: '/affiliates', label: 'Affiliates', icon: 'link' },
      { to: '/suppliers', label: 'Suppliers', icon: 'truck', dropship: true },
      { to: '/needs-action', label: 'Needs action', icon: 'alert', dropship: true },
      { to: '/payouts', label: 'Payouts', icon: 'banknote', dropship: true },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/support', label: 'Support', icon: 'help' },
      // Customer conversations and template campaigns on the business number.
      { to: '/whatsapp', label: 'WhatsApp', icon: 'chat' },
      // The marketplace homepage carousel — the platform's own storefront
      // content, so it sits with the other platform-wide settings.
      { to: '/banners', label: 'Homepage banners', icon: 'image' },
      // Order and on/off for the marketplace homepage's sections.
      { to: '/home-sections', label: 'Homepage sections', icon: 'layout' },
      { to: '/theme-templates', label: 'Store themes', icon: 'palette' },
      { to: '/notifications', label: 'Notifications', icon: 'bell' },
      { to: '/activity', label: 'Activity log', icon: 'activity' },
      { to: '/admins', label: 'Admin users', icon: 'shield', superAdminOnly: true },
    ],
  },
  {
    title: 'Documents',
    items: [
      // Every WhatsApp template: its text, who gets it, and each {{n}}'s value.
      { to: '/docs/whatsapp-templates', label: 'WhatsApp templates', icon: 'file' },
    ],
  },
]

/** Browser tab title per path prefix — longest match wins. */
const TITLES: [string, string][] = [
  ['/orders', 'Orders'],
  ['/payments', 'Payments'],
  ['/seller-payouts', 'Seller payouts'],
  ['/finance/sellers', 'Seller balances'],
  ['/finance/fees', 'Fee settings'],
  ['/products', 'Products'],
  ['/categories', 'Categories'],
  ['/category-mapping', 'Category mapping'],
  ['/stores', 'Stores'],
  ['/customers', 'Customers'],
  ['/suppliers', 'Suppliers'],
  ['/needs-action', 'Needs action'],
  ['/payouts', 'Payouts'],
  ['/support', 'Support'],
  ['/whatsapp', 'WhatsApp'],
  ['/theme-templates', 'Store themes'],
  ['/banners', 'Homepage banners'],
  ['/home-sections', 'Homepage sections'],
  ['/notifications', 'Notifications'],
  ['/activity', 'Activity log'],
  ['/admins', 'Admin users'],
  ['/docs/whatsapp-templates', 'WhatsApp templates'],
]

export function titleForPath(pathname: string): string {
  const match = TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return `${match?.[1] ?? 'Dashboard'} · UnieMax Admin`
}
