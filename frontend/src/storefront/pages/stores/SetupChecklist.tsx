import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { isLaunchStep } from '../../features/stores/storeProfile'
import type { StepState } from '../../features/stores/storeProfile'
import { publicStoreUrl, storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import { CheckIcon, EyeIcon, PaletteIcon } from '../../layout/icons'
import { BlockerLinks, useGateBlockers } from './GateBlockers'

/**
 * The seller's path to a live store, on the Dashboard — the resumable half of
 * onboarding (the Create Store wizard asks only what fits at signup).
 *
 * Two cards, because they answer two different questions:
 *
 *  - **Get your store live** (until published): only the steps that block
 *    publishing, then an optional "make it yours" pointer to the Store
 *    Builder, then Preview + Publish right here. It used to be one "4 of 12"
 *    list mixing these with payout KYC, which read as twelve chores before a
 *    shop could open — when a cash-on-delivery shop needs none of the
 *    payout ones.
 *  - **Accept online payments** (once live, while unfinished): address, tax
 *    and bank account — clearly optional, since COD already works.
 *
 * Both render from the SAME server-computed `readiness` that the publish and
 * payment endpoints enforce, so this can never promise a seller they are done
 * while the server disagrees.
 */
export function SetupChecklist({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const applicable = store.readiness.steps.filter((step) => step.totalCount > 0)
  const launch = applicable.filter(isLaunchStep)
  const payout = applicable.filter((step) => !isLaunchStep(step))

  if (!store.isPublished) {
    return <LaunchCard store={store} steps={launch} onStoreChange={onStoreChange} />
  }
  const payoutPending = payout.filter((step) => !step.complete)
  return payoutPending.length > 0 ? <OnlinePaymentsCard steps={payoutPending} /> : null
}

/** What the jump-to-fix button says, per step — "Add" alone said nothing. */
const STEP_ACTION: Partial<Record<StepState['key'], string>> = {
  store: 'Edit details',
  business: 'Add details',
  catalog: 'Add a product',
  address: 'Add address',
  tax: 'Add tax details',
  payout: 'Add bank account',
}

function LaunchCard({
  store,
  steps,
  onStoreChange,
}: {
  store: Store
  steps: StepState[]
  onStoreChange: (store: Store) => void
}) {
  const { storePath } = useStoreManageScope()
  const blockers = useGateBlockers(store, 'PUBLISH')
  const canPublish = store.readiness.gates.PUBLISH.allowed
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = steps.filter((step) => step.complete).length
  // +1: publishing is the last step, and it is never "done" on this card.
  const total = steps.length + 1
  const percent = Math.round((done / total) * 100)

  const publish = async () => {
    setError(null)
    setBusy(true)
    try {
      onStoreChange(await storesApi.setPublished(store.id, true))
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-body text-base font-semibold text-fg">
            Get your store live
          </h3>
          <span className="text-xs font-medium text-muted">
            Step {Math.min(done + 1, total)} of {total}
          </span>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Store launch progress"
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      <ol className="divide-y divide-line">
        {steps.map((step, i) => (
          <StepRow key={step.key} number={i + 1} step={step} />
        ))}

        {/* Advisory: every store already has a working default look, so
            this never blocks and is never "incomplete". */}
        <Row
          number={steps.length + 1}
          icon={<PaletteIcon className="h-3.5 w-3.5" />}
          title="Make it look yours"
          detail="Optional — pick a theme, colours and homepage sections. Your store already has a clean default look."
          action={
            <Link
              to={`${storePath(store.slug)}/builder`}
              className={buttonClass({ variant: 'ring', size: 'sm' })}
            >
              Open Store Builder
            </Link>
          }
        />

        <Row
          number={total}
          title="Preview and publish"
          detail={
            canPublish ? (
              'Check your store as customers will see it, then publish to start taking orders.'
            ) : (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                Still needed: <BlockerLinks blockers={blockers} />
              </span>
            )
          }
          action={
            <span className="flex gap-2">
              <a
                href={publicStoreUrl(store.slug)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: 'ring', size: 'sm' })}
              >
                <EyeIcon className="h-3.5 w-3.5" />
                Preview
              </a>
              <Button
                size="sm"
                variant="sheen"
                loading={busy}
                disabled={!canPublish}
                onClick={() => void publish()}
              >
                Publish store
              </Button>
            </span>
          }
        />
      </ol>
      {error && (
        <p className="border-t border-line bg-danger-soft px-4 py-2 text-xs font-medium text-danger sm:px-5">
          {error}
        </p>
      )}
    </section>
  )
}

function OnlinePaymentsCard({ steps }: { steps: StepState[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="border-b border-line p-4 sm:p-5">
        <h3 className="font-body text-base font-semibold text-fg">
          Accept online payments{' '}
          <span className="text-xs font-medium text-muted">— optional</span>
        </h3>
        <p className="mt-1 text-xs text-muted">
          Cash on Delivery already works. To take UPI and card payments, add
          these so we know who to pay out.
        </p>
      </header>
      <ul className="divide-y divide-line">
        {steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>
    </section>
  )
}

/**
 * One readiness step. Unfinished, its detail line names exactly what is
 * missing (rather than a generic blurb and an n/m counter to expand), and
 * its button says what it opens.
 */
function StepRow({ step, number }: { step: StepState; number?: number }) {
  const { hiddenSections } = useStoreManageScope()
  const missing = step.requirements.filter((req) => !req.met).map((req) => req.label)
  // Products can't be added until a category exists — send the seller
  // straight to the step that unblocks them instead of a gate page.
  const needsCategory =
    step.key === 'catalog' &&
    step.requirements.some((req) => req.key === 'catalog.category' && !req.met)
  const action = needsCategory
    ? { to: 'categories', label: 'Choose a category' }
    : { to: step.href, label: STEP_ACTION[step.key] ?? 'Open' }
  return (
    <Row
      number={number}
      complete={step.complete}
      title={step.title}
      detail={step.complete ? step.blurb : `Still needed: ${missing.join(' · ')}`}
      action={
        // An admin still SEES the outstanding step — "this shop has no PAN" is
        // what support needs to explain the block — but gets no button when
        // the section is not routed for them.
        step.complete || hiddenSections.includes(step.href) ? null : (
          <Link to={action.to} className={buttonClass({ variant: 'ring', size: 'sm' })}>
            {action.label}
          </Link>
        )
      }
    />
  )
}

function Row({
  number,
  icon,
  complete = false,
  title,
  detail,
  action,
}: {
  number?: number
  icon?: ReactNode
  complete?: boolean
  title: string
  detail: ReactNode
  action: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            complete
              ? 'bg-success/15 text-success'
              : 'border border-line bg-surface-alt text-muted'
          }`}
          aria-hidden
        >
          {complete ? <CheckIcon className="h-3.5 w-3.5" /> : (icon ?? number)}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${complete ? 'text-muted' : 'text-fg'}`}>
            {title}
            {complete && <span className="sr-only"> — done</span>}
          </p>
          <div className="mt-0.5 text-xs text-muted">{detail}</div>
        </div>
      </div>
      {action && <div className="shrink-0 pl-10 sm:pl-0">{action}</div>}
    </li>
  )
}
