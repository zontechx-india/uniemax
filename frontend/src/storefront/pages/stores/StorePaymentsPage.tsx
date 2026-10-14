import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { buttonClass } from '../../../shared/ui/Button'
import { groupBySection } from '../../features/stores/gateBlockers'
import type { BlockerGroup } from '../../features/stores/gateBlockers'
import { storesApi } from '../../features/stores/storesApi'
import type { StorePayments } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { BankIcon, CardIcon } from '../../layout/icons'
import { useGateBlockers } from './GateBlockers'
import { sectionItem } from './StoreSectionNav'
import { BigSwitch } from './ui/BigSwitch'
import { PageHeader } from './ui/PageHeader'
import { showToast } from './ui/Toast'

/**
 * Payments section of Store Management — how customers PAY (how they
 * receive orders is the Shipping section). Because these switches change
 * the live checkout immediately, a toggle only *requests* the change — a
 * ConfirmDialog spells out the effect and nothing is written until it is
 * accepted, so the switches always reflect saved state. A toast confirms
 * the save.
 *
 * Turning ONLINE payment on is a real gate, not a nudge: UnieMax starts
 * collecting money and paying it out, so a PAN and a primary payout account
 * have to exist first. The condition is read from `store.readiness` — the
 * same evaluation the endpoint enforces — so the switch is disabled for
 * exactly the reasons a save would be rejected, and the card says what to add.
 * It lists the steps in order, each with a button to the screen that does it:
 * the bank account can only be saved once the address and tax answers are in,
 * so those come first (the server reports them as the account's
 * prerequisites), and a step already done gets no button to a finished page.
 */

const METHODS: {
  key: keyof StorePayments
  title: string
  icon: ComponentType<{ className?: string }>
  description: string
  /** Dialog copy when switching ON / OFF. */
  confirmOn: string
  confirmOff: string
}[] = [
  {
    key: 'acceptCod',
    title: 'Cash on delivery',
    icon: BankIcon,
    description: 'Customers pay you in cash when the order arrives.',
    confirmOn: 'Customers will be able to pay in cash when the order arrives.',
    confirmOff: 'Customers will no longer see Cash on delivery at your checkout.',
  },
  {
    key: 'acceptOnlinePayment',
    title: 'Online payment (UPI, cards)',
    icon: CardIcon,
    description:
      'Customers pay online through UnieMax. The money is sent to your main bank account.',
    confirmOn:
      'Customers will be able to pay online through UnieMax, and the money will be sent to your main bank account.',
    confirmOff:
      'Customers will no longer be able to pay online — only your other payment options stay at checkout.',
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
  const onlineSteps = groupBySection(useGateBlockers(store, 'ONLINE_PAYMENT'))
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
      showToast(pending.next ? 'Turned on' : 'Turned off')
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
    <div className="space-y-4">
      <PageHeader
        icon={CardIcon}
        title="Payments"
        description="Choose how customers can pay you. Changes show at your checkout straight away."
      />

      {allOff && (
        <InfoNote>
          Every payment option is off — customers cannot order from your shop
          until you turn at least one on.
        </InfoNote>
      )}

      <ul className="space-y-3">
        {METHODS.map(({ key, title, description, icon: Icon }) => {
          const locked = key === 'acceptOnlinePayment' && onlineBlocked
          return (
            <li key={key} className="glass-card rounded-glass p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-fg">{title}</p>
                  <p className="mt-0.5 text-hint text-muted">{description}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-hint text-muted">
                  {locked ? 'Add the details below to turn this on.' : 'At your checkout:'}
                </span>
                <BigSwitch
                  checked={payments[key]}
                  disabled={busy || pending !== null || locked}
                  label={title}
                  onChange={(next) => setPending({ key, next })}
                />
              </div>

              {/* The switch is disabled; this says why, and where to fix it. */}
              {locked && <SetupSteps steps={onlineSteps} />}
            </li>
          )
        })}
      </ul>

      {error && <ErrorNote>{error}</ErrorNote>}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending && pendingMethod
            ? `Turn ${pending.next ? 'on' : 'off'} ${pendingMethod.title}?`
            : ''
        }
        description={
          pending && pendingMethod
            ? pending.next
              ? pendingMethod.confirmOn
              : pendingMethod.confirmOff
            : ''
        }
        confirmLabel={pending?.next ? 'Turn on' : 'Turn off'}
        tone={pending?.next ? 'neutral' : 'danger'}
        busy={busy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/**
 * What to do before the switch unlocks: one numbered row per screen, in the
 * order the server needs them, each naming what is missing there and opening
 * that screen at the right card. A section this mode cannot open (an admin
 * and Business details) is named without a button.
 */
function SetupSteps({ steps }: { steps: BlockerGroup[] }) {
  return (
    <div className="mt-3 rounded-xl bg-pending-soft p-3 sm:p-4">
      <p className="text-sm font-semibold text-fg">To turn this on, first add:</p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => {
          const section = step.section ? sectionItem(step.section) : undefined
          return (
            <li
              key={step.section ?? index}
              className="flex items-start gap-2.5 sm:items-center"
            >
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-fg ring-1 ring-line"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="min-w-0 text-sm text-fg">{step.labels.join(', ')}</p>
                {step.to && section && (
                  <Link
                    to={step.to}
                    className={buttonClass({
                      variant: 'secondary',
                      size: 'md',
                      // Equal widths on desktop, so the right-aligned
                      // buttons line up down the list.
                      className: 'shrink-0 self-start sm:min-w-44 sm:self-auto',
                    })}
                  >
                    <section.icon className="h-4 w-4" />
                    {section.label}
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
