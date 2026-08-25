import { Link } from 'react-router-dom'
import { usePageTitle } from '../../../shared/usePageTitle'
import {
  usePublicStore,
  StorePageShell,
} from '../../features/publicStore/PublicStoreLayout'
import { TicketThread } from '../../features/support/TicketThread'
import { ArrowLeftIcon } from '../../layout/icons'

/**
 * `/store/{storeSlug}/support/{ticketId}` — one of the shopper's requests to
 * this shop. The thread is the shared one (`features/support/TicketThread`),
 * which labels each message by role: "You" or the shop's name.
 *
 * A signed-out visitor gets the thread's own 401 message rather than a
 * redirect — landing here without a session means an old link or another
 * browser, and a bounce to sign-in would lose which ticket they wanted.
 */
export function StoreHelpTicketPage() {
  const { store } = usePublicStore()
  usePageTitle('Support request', store.name)

  return (
    <StorePageShell className="max-w-3xl">
      <TicketThread
        back={
          <Link
            to={`/store/${store.slug}/support`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Help &amp; Support
          </Link>
        }
      />
    </StorePageShell>
  )
}
