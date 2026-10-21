import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '../suppliers', label: 'Your suppliers', end: true },
  { to: '../suppliers/products', label: 'Products to add', end: true },
]

/** The seller's two supplier screens as one place: who supplies you, and what you can add. */
export function SuppliersTabs() {
  return (
    <nav aria-label="Suppliers" className="grid grid-cols-2 gap-1 rounded-md bg-surface-alt p-1 sm:max-w-sm">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex h-tap items-center justify-center rounded-sm text-sm font-medium transition-colors ${
              isActive ? 'bg-surface text-fg shadow-floating' : 'text-muted hover:text-fg'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
