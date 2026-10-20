import { Link } from 'react-router-dom'
import { buttonClass } from '../../../../shared/ui/Button'
import { BagIcon, BoxIcon, RupeeIcon } from '../../../../storefront/layout/icons'
import { PageHeader } from '../../../../storefront/pages/stores/ui'

/**
 * The dashboard of a supply-only store (D-28): it has no storefront to
 * publish, so instead of the launch checklist it shows the supplier's own
 * next steps.
 */
export function SupplierHome({ storeName }: { storeName: string }) {
  const steps = [
    {
      icon: BoxIcon,
      title: 'Add the products you supply',
      detail: 'Photos, options and how many you have in stock.',
      to: 'products',
      action: 'Products',
    },
    {
      icon: RupeeIcon,
      title: 'Offer them to your sellers',
      detail: 'Switch each product on and set the price you charge sellers.',
      to: 'supply',
      action: 'Products for sellers',
    },
    {
      icon: BagIcon,
      title: 'See your sellers and their terms',
      detail: 'Cash on delivery, returned parcels, and every change made.',
      to: 'sellers',
      action: 'Sellers',
    },
  ]
  return (
    <div className="space-y-5">
      <PageHeader
        title={storeName}
        description="Your supplier account. Sellers sell your products; you ship their orders."
      />
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.to}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <step.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                {i + 1}. {step.title}
              </p>
              <p className="text-xs text-muted">{step.detail}</p>
            </div>
            <Link to={step.to} className={buttonClass({ variant: i === 0 ? 'primary' : 'secondary', size: 'sm' })}>
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
