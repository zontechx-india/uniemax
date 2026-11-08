import type { PublicStore } from '../stores/storesApi'
import { PhoneCallIcon } from '../../layout/icons'
import { WhatsAppIcon } from '../../../shared/ui/socialIcons'
import { telLink, waLink } from './contactLinks'
import type { Skin } from './storeTheme'
import { buttonClass } from '../../../shared/ui/Button'

/**
 * How a customer can reach this shop directly — only numbers the seller
 * entered themselves (Footer → Customer support, or their WhatsApp social
 * link). Many customers buying from a small shop want to ask first ("is the
 * blue one in stock?"), and a WhatsApp chat is how they already talk to shops.
 */
export function shopContact(store: PublicStore) {
  const { support, social } = store.footer
  return {
    whatsapp: support.whatsapp || social.whatsapp || null,
    phone: support.phone || null,
    hours: support.hours || null,
  }
}

/**
 * WhatsApp + Call buttons for a shop, 48px (44px when `quiet`), side by side. Renders nothing
 * when the seller gave no number. `message` pre-types the customer's first
 * WhatsApp line (e.g. which product they are asking about).
 */
export function ContactActions({
  store,
  skin,
  message,
  quiet = false,
  className = '',
}: {
  store: PublicStore
  skin: Skin
  message?: string
  /** Supporting role — both as `secondary` 44px buttons (the WhatsApp mark
   *  keeps its green). Used under Buy Now, where a second filled button
   *  would compete with the one main action. */
  quiet?: boolean
  className?: string
}) {
  const { whatsapp, phone } = shopContact(store)
  if (!whatsapp && !phone) return null
  // Call (and WhatsApp when quiet) is the shared secondary button. The loud
  // WhatsApp keeps its own green fill — a mark customers recognise — at the
  // shared `lg` height, padding and weight.
  const size = quiet ? 'md' : 'lg'
  const layout = 'flex-1 sm:flex-none'
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {whatsapp && (
        <a
          href={waLink(whatsapp, message)}
          target="_blank"
          rel="noopener noreferrer"
          className={
            quiet
              ? buttonClass({ variant: 'secondary', size, className: layout })
              : `inline-flex h-field items-center justify-center gap-2 rounded-md bg-whatsapp px-6 text-base font-semibold text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95 ${layout}`
          }
        >
          <WhatsAppIcon className={`h-5 w-5 ${quiet ? 'text-whatsapp' : ''}`} />
          WhatsApp
        </a>
      )}
      {phone && (
        <a
          href={telLink(phone)}
          className={buttonClass({ variant: 'secondary', size, className: layout })}
        >
          <PhoneCallIcon className={`h-5 w-5 ${skin.muted}`} />
          Call
        </a>
      )}
    </div>
  )
}
