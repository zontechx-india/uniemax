import { useState } from 'react'
import { usePageTitle } from '../../shared/usePageTitle'
import type { Customer } from '../../shared/auth/authApi'
import { VerifyPhoneForm } from '../../shared/auth/VerifyPhoneForm'
import { SuccessNote, PhoneIcon } from '../../shared/ui/form'
import { useCustomerSession } from '../app/sessionContext'
import { useMarketSession } from '../app/marketSession'
import { Avatar } from '../layout/Avatar'
import { CheckIcon, MailIcon, PhoneCallIcon } from '../layout/icons'

/**
 * My Profile (/profile) — the customer's own account details plus the
 * mobile-number linking flow (CONTEXT.md "Account Linking"): a number is
 * added HERE, verified by an SMS OTP, and then works as an OTP sign-in
 * method on the login page. A number can belong to exactly one account —
 * the backend answers 409 when it's already linked elsewhere — so once
 * linked the section becomes read-only (identifiers only change via the
 * verified linking flow, never a plain edit).
 */
export function ProfilePage() {
  usePageTitle('My Profile')

  const { customer } = useCustomerSession()
  // Linking changes the customer record; push the fresh copy into the
  // session state so the whole authed tree (menu, this page) updates.
  const { signedIn } = useMarketSession()
  const [linked, setLinked] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-body text-2xl font-semibold tracking-normal text-fg">
        My Profile
      </h1>
      <p className="mt-1 text-sm text-muted">
        Your account details and how you sign in.
      </p>

      {/* ---- Identity ---------------------------------------------------- */}
      <div className="mt-5 flex items-center gap-4 rounded-lg border border-line bg-surface p-5">
        <Avatar customer={customer} className="h-16 w-16" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-fg">
            {customer.name ?? 'Your account'}
          </p>
          <p className="text-sm text-muted">
            Member since{' '}
            {new Date(customer.createdAt).toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* ---- Sign-in identifiers ----------------------------------------- */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Sign-in details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Each email and mobile number belongs to exactly one account. They are
          changed only through a verified linking flow — never edited directly.
        </p>

        {linked && (
          <div className="mt-3">
            <SuccessNote>
              Mobile number linked — you can now sign in with it using an OTP.
            </SuccessNote>
          </div>
        )}

        <div className="mt-4 divide-y divide-line">
          {/* Email */}
          <IdentifierRow
            icon={<MailIcon className="h-4 w-4" />}
            label="Email"
            value={customer.email}
            verified={Boolean(customer.emailVerifiedAt)}
            hint={
              customer.email
                ? 'Used to sign in with your password.'
                : 'No email on this account.'
            }
          />

          {/* Mobile number */}
          {customer.phone ? (
            <IdentifierRow
              icon={<PhoneCallIcon className="h-4 w-4" />}
              label="Mobile number"
              value={customer.phone}
              verified={Boolean(customer.phoneVerifiedAt)}
              hint="You can sign in with this number using a one-time code."
            />
          ) : (
            <LinkPhoneSection
              onLinked={(updated) => {
                setLinked(true)
                signedIn(updated)
              }}
            />
          )}

          {/* Alternate phone (contact only, not a sign-in method) */}
          {customer.altPhone && (
            <IdentifierRow
              icon={<PhoneCallIcon className="h-4 w-4" />}
              label="Alternate phone"
              value={customer.altPhone}
              hint="Contact number only — not used for sign-in."
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* One identifier row (email / phone)                                  */
/* ------------------------------------------------------------------ */

function IdentifierRow({
  icon,
  label,
  value,
  verified,
  hint,
  trailing,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  verified?: boolean
  hint?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-fg">
            {value ?? '—'}
          </p>
          {verified && <VerifiedChip />}
        </div>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {trailing}
    </div>
  )
}

function VerifiedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
      <CheckIcon className="h-3 w-3" />
      Verified
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Link a mobile number (SMS OTP)                                      */
/* ------------------------------------------------------------------ */

/**
 * The row chrome around the shared `VerifyPhoneForm`, which owns the actual
 * two-step link flow. Collapsed to a prompt until the seller opts in, so an
 * account that already has a number never shows a form at all.
 */
function LinkPhoneSection({ onLinked }: { onLinked: (customer: Customer) => void }) {
  const [step, setStep] = useState<'idle' | 'form'>('idle')

  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
        <PhoneCallIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">Mobile number</p>

        {step === 'idle' && (
          <>
            <p className="mt-0.5 text-sm text-muted">
              No mobile number linked yet.
            </p>
            <p className="mt-1 text-xs text-muted">
              Link your number to also sign in with an SMS one-time code. A
              number can be linked to only one UnieMax account.
            </p>
            <button
              type="button"
              onClick={() => setStep('form')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-alt px-3 py-1.5 text-sm font-medium text-fg transition hover:border-brand hover:text-brand"
            >
              <PhoneIcon />
              Link mobile number
            </button>
          </>
        )}

        {step === 'form' && (
          <div className="mt-2">
            <VerifyPhoneForm
              onVerified={onLinked}
              onCancel={() => setStep('idle')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
