import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { storesApi } from '../../features/stores/storesApi'
import type { StorePayments } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ActiveSwitch } from './ActiveSwitch'

/**
 * Payments section of Store Management — how customers PAY (how they
 * receive orders is the Shipping section). Because these switches change
 * the live checkout immediately, a toggle only *requests* the change — a
 * ConfirmDialog spells out the effect and nothing is written until it is
 * accepted, so the switches always reflect saved state.
 *
 * Turning ONLINE payment on is a real gate, not a nudge: UnieMax starts
 * collecting money and paying it out, so a PAN and a primary payout account
 * have to exist first. The condition is read from `store.readiness` — the
 * same evaluation the endpoint enforces — rather than from a bank-account
 * lookup this page used to run for itself, so the switch is disabled for
 * exactly the reasons a save would be rejected.
 */

const METHODS: {
  key: keyof StorePayments
  title: string
  description: string
  /** Dialog copy when switching ON / OFF. */
  confirmOn: string
  confirmOff: string
}[] = [
  {
    key: 'acceptOnlinePayment',
    title: 'Accept Online Payment',
    description:
      'Customers pay through UnieMax (UPI, cards…). Your earnings are paid out to your primary bank account.',
    confirmOn:
      'Customers will be able to pay online through UnieMax, and your earnings will be paid out to your primary bank account.',
    confirmOff:
      'Customers will no longer be able to pay online — only your other enabled methods remain available at checkout.',
  },
  {
    key: 'acceptCod',
    title: 'Accept Cash on Delivery',
    description: 'Customers pay in cash when the order is delivered.',
    confirmOn: 'Customers will be able to pay in cash when the order arrives.',
    confirmOff:
      'Customers will no longer see Cash on Delivery at your checkout.',
  },
]

export function StorePaymentsPage() {
  const { store, onStoreChange } = useManagedStore()
  const payments = store.payments

  const [pending, setPending] = useState<{
    key: keyof StorePayments
    next: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onlineGate = store.readiness.gates.ONLINE_PAYMENT
  // Only switching ON is gated. A seller who already has online payment on
  // must always be able to turn it off, whatever their profile looks like.
  const onlineBlocked = !payments.acceptOnlinePayment && !onlineGate.allowed

  const confirmPending = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      onStoreChange(
        await storesApi.updatePayments(store.id, {
          [pending.key]: pending.next,
        }),
      )
      setPending(null)
    } catch (err) {
      setError(toApiError(err).message)
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const pendingMethod = METHODS.find((m) => m.key === pending?.key)
  const allOff = METHODS.every(({ key }) => !payments[key])

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Payments
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose how customers can pay you. Changes apply to your checkout
        immediately, so each change asks for confirmation. Delivery and
        pickup options live in the Shipping section.
      </p>

      <div className="mt-5 max-w-2xl space-y-3">
        <ul className="space-y-2">
          {METHODS.map(({ key, title, description }) => {
            const locked = key === 'acceptOnlinePayment' && onlineBlocked
            return (
              <li
                key={key}
                className={`flex items-center gap-4 rounded-lg border border-line p-4 ${
                  locked ? 'opacity-75' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{title}</p>
                  <p className="mt-0.5 text-sm text-muted">{description}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted">
                  {payments[key] ? 'Yes' : 'No'}
                </span>
                <ActiveSwitch
                  checked={payments[key]}
                  disabled={busy || pending !== null || locked}
                  label={title}
                  onChange={(next) => setPending({ key, next })}
                />
              </li>
            )
          })}
        </ul>

        {/* The switch above is disabled; this says why, and links to each
            place the missing piece is added. */}
        {onlineBlocked && (
          <InfoNote>
            To accept online payments, first add:{' '}
            {onlineGate.blockers.join(', ')}. You'll find these under{' '}
            <Link
              to="../business"
              className="font-semibold text-brand hover:underline"
            >
              Business Details
            </Link>{' '}
            and{' '}
            <Link
              to="../bank-accounts"
              className="font-semibold text-brand hover:underline"
            >
              Bank Accounts
            </Link>
            .
          </InfoNote>
        )}

        {allOff && (
          <InfoNote>
            Every payment method is switched off — customers won't be able to
            place orders from your store until at least one is on.
          </InfoNote>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending && pendingMethod
            ? `Turn ${pending.next ? 'on' : 'off'} ${pendingMethod.title.replace('Accept ', '')}?`
            : ''
        }
        description={
          pending && pendingMethod
            ? pending.next
              ? pendingMethod.confirmOn
              : pendingMethod.confirmOff
            : ''
        }
        confirmLabel={pending?.next ? 'Turn On' : 'Turn Off'}
        tone={pending?.next ? 'neutral' : 'danger'}
        busy={busy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
