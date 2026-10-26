import { Link } from 'react-router-dom'
import { buttonClass } from '../../../../shared/ui/Button'

/**
 * On a supplier account's own Products page: these are its products, but sellers
 * only see the ones it has offered. A supplier account has no shop, so nothing
 * here is on the marketplace (D-28).
 */
export function SupplyOnlyNote() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">These are your own products. Sellers only see the ones you offer.</p>
        <p className="mt-1 text-sm text-muted">
          The last step of adding a product asks your price for sellers and offers it. Customers never see this list:
          a supplier account has no shop.
        </p>
      </div>
      <Link to="../supply" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        Change many prices at once
      </Link>
    </section>
  )
}
