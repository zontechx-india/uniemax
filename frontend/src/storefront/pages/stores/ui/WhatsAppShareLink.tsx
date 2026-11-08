import { ChatIcon } from '../../../layout/icons'

/**
 * "Share on WhatsApp" — the seller's main way to reach buyers. A flat
 * WhatsApp-green button at the shared `lg` height (48px): the green mark is
 * recognised on sight, so it needs no moving light around it (the looping
 * gold edge was removed November 2026; the sunset "Share your store" button
 * is the one animated effect in My Shops). One component for the publish &
 * share panel, the dashboard's next step and the Share Kit page.
 */
export function WhatsAppShareLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp px-6 text-base font-semibold text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95"
    >
      <ChatIcon className="h-5 w-5" />
      Share on WhatsApp
    </a>
  )
}
