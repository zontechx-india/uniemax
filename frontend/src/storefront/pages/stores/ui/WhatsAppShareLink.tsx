import { StarBorder } from '../../../../shared/components/StarBorder'
import { ChatIcon } from '../../../layout/icons'

/**
 * "Share on WhatsApp" — the seller's main way to reach buyers, so a gold light
 * laps its green edge continuously (`StarBorder`). One component for the
 * publish & share panel, the dashboard's next step and the Share Kit page.
 */
export function WhatsAppShareLink({ href }: { href: string }) {
  return (
    <StarBorder
      as="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      thickness={2}
      speed="4s"
      color="var(--whatsapp-glow)"
      className="block h-field w-full rounded-md bg-whatsapp transition hover:opacity-90"
      contentClassName="flex h-full items-center justify-center gap-2 border-0 bg-whatsapp p-0 text-base font-bold text-whatsapp-contrast"
    >
      <ChatIcon className="h-5 w-5" />
      Share on WhatsApp
    </StarBorder>
  )
}
