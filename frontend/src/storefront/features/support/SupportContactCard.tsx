import { useEffect, useState } from 'react'
import {
  FALLBACK_SUPPORT_CONTACT,
  mailtoHref,
  supportApi,
  telHref,
} from './supportApi'
import type { SupportContact } from './supportApi'
import { ClockIcon, MailIcon, PhoneCallIcon } from '../../layout/icons'

/**
 * How to reach UnieMax without opening a ticket — email, phone, hours.
 *
 * The values come from `GET /public/support-contact`, but the card renders
 * from a **local fallback copy first** and never blocks on that request: a
 * support page showing no way to contact support is the one failure this
 * screen must not have, so the API is an upgrade rather than a precondition.
 * A failed fetch is therefore silently ignored — the card on screen is
 * already correct.
 *
 * Shared by both entry points (a store's Help & Support and the account
 * menu's), which is why the mailto subject is a prop: it is the only thing
 * that differs.
 */
export function SupportContactCard({ mailSubject }: { mailSubject: string }) {
  const [contact, setContact] = useState<SupportContact>(FALLBACK_SUPPORT_CONTACT)

  useEffect(() => {
    let cancelled = false
    supportApi
      .contact()
      .then((data) => {
        if (!cancelled) setContact(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={mailtoHref(contact.email, mailSubject)}
          className="flex items-start gap-3 rounded-lg border border-line p-4 transition hover:border-brand/50 hover:bg-surface-alt"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
            <MailIcon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">Email us</span>
            <span className="mt-0.5 block break-all text-sm text-muted">
              {contact.email}
            </span>
          </span>
        </a>

        <a
          href={telHref(contact.phone)}
          className="flex items-start gap-3 rounded-lg border border-line p-4 transition hover:border-brand/50 hover:bg-surface-alt"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
            <PhoneCallIcon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">Call us</span>
            <span className="mt-0.5 block text-sm text-muted">{contact.phone}</span>
          </span>
        </a>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <ClockIcon className="h-3.5 w-3.5" />
        {contact.hours}
      </p>
    </>
  )
}
