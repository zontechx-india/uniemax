import type { PublicStore } from '../stores/storesApi'
import { PhoneCallIcon } from '../../layout/icons'
import { WhatsAppIcon } from '../../../shared/ui/socialIcons'
import { telLink, waLink } from './contactLinks'
import type { Skin } from './storeTheme'

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
 * WhatsApp + Call buttons for a shop, 48px, side by side. Renders nothing
 * when the seller gave no number. `message` pre-types the customer's first
 * WhatsApp line (e.g. which product they are asking about).
 */
export function ContactActions({
  store,
  skin,
  message,
  className = '',
}: {
  store: PublicStore
  skin: Skin
  message?: string
  className?: string
}) {
  const { whatsapp, phone } = shopContact(store)
  if (!whatsapp && !phone) return null
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {whatsapp && (
        <a
          href={waLink(whatsapp, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-whatsapp px-5 text-[15px] font-bold text-whatsapp-contrast transition hover:brightness-95 sm:flex-none"
        >
          <WhatsAppIcon className="h-5 w-5" />
          WhatsApp
        </a>
      )}
      {phone && (
        <a
          href={telLink(phone)}
          className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md border px-5 text-[15px] font-bold transition-colors hover:border-brand sm:flex-none ${skin.border} ${skin.text} ${skin.surface}`}
        >
          <PhoneCallIcon className="h-5 w-5 text-brand" />
          Call
        </a>
      )}
    </div>
  )
}
