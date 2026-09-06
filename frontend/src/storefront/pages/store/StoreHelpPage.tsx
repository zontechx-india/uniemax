import { useEffect, useState } from 'react'
import { usePageTitle } from '../../../shared/usePageTitle'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote } from '../../../shared/ui/form'
import { useMarketSession } from '../../app/marketSession'
import { openAuthDialog, storeAuthRequest } from '../../features/auth/authDialogStore'
import { usePublicStore, StorePageShell } from '../../features/publicStore/PublicStoreLayout'
import { NewTicketForm } from '../../features/support/NewTicketForm'
import { TicketList } from '../../features/support/TicketList'
import { STORE_CATEGORIES, storeSupportApi } from '../../features/support/supportApi'
import type { SupportTicket } from '../../features/support/supportApi'
import { SOCIAL_META } from '../../../shared/ui/socialIcons'
import {
  ClockIcon,
  LifebuoyIcon,
  MailIcon,
  PhoneCallIcon,
  PlusIcon,
} from '../../layout/icons'

/**
 * `/store/{storeSlug}/support` — Help & Support **for this shop**.
 *
 * The thread here goes to the **seller**, not to UnieMax: order questions,
 * returns, "is this in stock". Platform-level problems — a shop that never
 * replies, a refund that never arrived — belong in the account menu's Help &
 * Support, which is why this page links there rather than trying to be both.
 *
 * Two layers, in the order they help:
 *   1. The shop's **own contact details** (from the owner's Footer settings),
 *      shown to everyone including signed-out visitors — a phone number needs
 *      no account.
 *   2. A **tracked message**, which does need one: a thread has to belong to
 *      somebody. Guests get a Sign in button that opens the auth dialog in
 *      the store's palette, right here — rather than a form that would fail
 *      on submit, or a trip to `/login` and back.
 *
 * Guests are recognised by *attempting the list*: a 401 means signed out. The
 * shell's session state would answer the same question, but the tickets have
 * to be fetched either way — so this stays one request rather than a request
 * plus a branch. The load is re-run when the session status changes, which is
 * how an in-dialog sign-in turns the guest panel into the request list.
 */

const telLink = (number: string) => `tel:${number.replace(/[^\d+]/g, '')}`
const waLink = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`

export function StoreHelpPage() {
  const { store, skin } = usePublicStore()
  usePageTitle('Help & Support', store.name)

  const support = store.footer.support
  const { state: session } = useMarketSession()
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [guest, setGuest] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  // Keyed on the session status too: signing in through the dialog flips it
  // to `authed` without a reload, and that is what loads the list.
  useEffect(() => {
    // One request per RESOLVED status — not a 401 during the probe and
    // another once it lands.
    if (session.status === 'loading') return
    let cancelled = false
    setTickets(null)
    setGuest(false)
    setLoadError(null)
    storeSupportApi
      .list(store.slug, { pageSize: 50 })
      .then(({ items }) => {
        if (!cancelled) setTickets(items)
      })
      .catch((err) => {
        if (cancelled) return
        const error = toApiError(err)
        // 401 is the expected answer for a signed-out visitor, not a failure.
        if (error.statusCode === 401) setGuest(true)
        else setLoadError(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [store.slug, session.status])

  const hasContact =
    support.phone || support.whatsapp || support.email || support.hours

  return (
    <StorePageShell className="max-w-3xl">
      <h1 className={`font-heading text-2xl font-bold ${skin.text}`}>
        Help &amp; Support
      </h1>
      <p className={`mt-1 text-sm ${skin.muted}`}>
        Questions about an order, a return or a product? Message{' '}
        {store.name} directly and follow the reply here.
      </p>

      {/* ---- The shop's own contact details --------------------------- */}
      {hasContact && (
        <div className={`mt-6 rounded-lg border p-4 ${skin.border} ${skin.surface}`}>
          <h2 className={`text-sm font-semibold ${skin.text}`}>
            Contact {store.name}
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {support.phone && (
              <ContactRow icon={<PhoneCallIcon className="h-4 w-4" />} skin={skin}>
                <a href={telLink(support.phone)} className="hover:text-brand">
                  {support.phone}
                </a>
              </ContactRow>
            )}
            {support.whatsapp && (
              <ContactRow
                icon={<SOCIAL_META.whatsapp.Icon className="h-4 w-4" />}
                skin={skin}
              >
                <a
                  href={waLink(support.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand"
                >
                  WhatsApp: {support.whatsapp}
                </a>
              </ContactRow>
            )}
            {support.email && (
              <ContactRow icon={<MailIcon className="h-4 w-4" />} skin={skin}>
                <a
                  href={`mailto:${support.email}`}
                  className="break-all hover:text-brand"
                >
                  {support.email}
                </a>
              </ContactRow>
            )}
            {support.hours && (
              <ContactRow icon={<ClockIcon className="h-4 w-4" />} skin={skin}>
                {support.hours}
              </ContactRow>
            )}
          </ul>
        </div>
      )}

      {/* ---- Tracked requests ------------------------------------------ */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-heading text-base font-semibold ${skin.text}`}>
          Your requests
        </h2>
        {!guest && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition hover:opacity-90 ${skin.cta}`}
          >
            <PlusIcon className="h-4 w-4" />
            New request
          </button>
        )}
      </div>

      {guest ? (
        <div
          className={`mt-4 rounded-lg border border-dashed px-4 py-10 text-center ${skin.border}`}
        >
          <LifebuoyIcon className={`mx-auto h-7 w-7 ${skin.muted}`} />
          <p className={`mt-2 text-sm font-medium ${skin.text}`}>
            Sign in to message this store
          </p>
          <p className={`mx-auto mt-1 max-w-sm text-sm ${skin.muted}`}>
            A request is a tracked conversation, so it has to belong to an
            account. The contact details above need no sign-in.
          </p>
          <button
            type="button"
            onClick={() => openAuthDialog(storeAuthRequest(store))}
            className={`mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold transition hover:opacity-90 ${skin.cta}`}
          >
            Sign in
          </button>
        </div>
      ) : (
        <>
          {composing && (
            <NewTicketForm
              categories={STORE_CATEGORIES}
              intro={
                <>
                  This goes to <span className={`font-medium ${skin.text}`}>{store.name}</span>,
                  who can see your orders with them. Include the order number
                  if there is one.
                </>
              }
              subjectPlaceholder="e.g. Wrong size delivered"
              defaultEmail=""
              defaultPhone=""
              onCancel={() => setComposing(false)}
              onCreated={(ticket) => {
                setTickets((rows) => [ticket, ...(rows ?? [])])
                setComposing(false)
              }}
              submitTo={(input) => storeSupportApi.create(store.slug, input)}
            />
          )}

          {!(composing && (tickets?.length ?? 0) === 0) && (
            <div className="mt-4">
              {loadError ? (
                <ErrorNote>{loadError}</ErrorNote>
              ) : (
                <TicketList
                  tickets={tickets}
                  error={null}
                  emptyHint={`Message ${store.name} about an order, a return or a product and the conversation lives here.`}
                />
              )}
            </div>
          )}
        </>
      )}

      <p className={`mt-8 text-xs ${skin.muted}`}>
        Need UnieMax rather than this store — a shop that isn't replying, or a
        problem with the platform itself?{' '}
        {/* Plain <a> for the same cross-router reason as the sign-in link. */}
        <a href="/support" className="font-semibold underline underline-offset-2">
          Contact UnieMax support
        </a>
        .
      </p>
    </StorePageShell>
  )
}

function ContactRow({
  icon,
  skin,
  children,
}: {
  icon: React.ReactNode
  skin: { muted: string; text: string }
  children: React.ReactNode
}) {
  return (
    <li className={`flex items-start gap-2.5 ${skin.text}`}>
      <span className={`mt-0.5 shrink-0 ${skin.muted}`}>{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

