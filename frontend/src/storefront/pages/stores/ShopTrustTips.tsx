import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import { buttonClass } from '../../../shared/ui/Button'
import { WhatsAppIcon } from '../../../shared/ui/socialIcons'
import type { Store } from '../../features/stores/storesApi'
import { ChatIcon, StoreIcon } from '../../layout/icons'
import { ActionRow } from './ui/ActionRow'

interface Tip {
  key: string
  icon: ComponentType<{ className?: string }>
  title: string
  why: string
  to: string
}

/**
 * The few things that make a customer who has never heard of this shop
 * willing to order — each one shows on the shop page only when the seller
 * filled it in, so the dashboard asks for the missing ones in plain words.
 * Renders nothing once all are done.
 */
export function ShopTrustTips({ store }: { store: Store }) {
  const { support, social, info } = store.footer
  const tips: Tip[] = []
  if (!support.whatsapp && !social.whatsapp && !support.phone) {
    tips.push({
      key: 'contact',
      icon: WhatsAppIcon,
      title: 'Add your WhatsApp number',
      why: 'Customers see “WhatsApp” and “Call” buttons and can ask you before buying.',
      to: 'footer',
    })
  }
  if (!info.about) {
    tips.push({
      key: 'about',
      icon: ChatIcon,
      title: 'Write one line about your shop',
      why: 'It shows under your shop name, e.g. “Pure silk sarees from Kanchipuram since 1998”.',
      to: 'footer',
    })
  }
  if (!store.logoUrl) {
    tips.push({
      key: 'logo',
      icon: StoreIcon,
      title: 'Add your shop logo',
      why: 'A logo makes your shop look real and easy to remember.',
      to: 'details',
    })
  }
  if (tips.length === 0) return null

  return (
    <section aria-labelledby="trust-heading">
      <h3 id="trust-heading" className="mb-1 text-base font-bold text-fg">
        Help customers trust your shop
      </h3>
      <p className="mb-2.5 text-hint text-muted">
        New customers order more from shops that show these.
      </p>
      <ul className="glass-card divide-y divide-line overflow-hidden rounded-glass">
        {tips.map(({ key, icon: Icon, title, why, to }) => (
          <li key={key}>
            <ActionRow
              leading={
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </span>
              }
              title={title}
              below={<span className="text-hint text-muted">{why}</span>}
              primary={
                <Link to={to} className={buttonClass({ variant: 'secondary', size: 'md' })}>
                  Add
                </Link>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
