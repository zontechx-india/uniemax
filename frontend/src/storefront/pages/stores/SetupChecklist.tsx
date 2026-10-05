import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '../../../shared/ui/Button'
import type { StepState } from '../../features/stores/storeProfile'
import { publicStoreUrl } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import { CheckIcon, EyeIcon, PaletteIcon } from '../../layout/icons'
import { BlockerLinks, useGateBlockers } from './GateBlockers'
import { launchSteps, payoutSteps, stepAction, stepMissing } from './setupSteps'
import { usePublishActions } from './usePublishActions'
import { ProgressRing } from './ui/ProgressRing'

/**
 * The seller's path to a live store, on the Dashboard — the resumable half of
 * onboarding (the Create Store wizard asks only what fits at signup).
 *
 * Two cards, because they answer two different questions:
 *
 *  - **Get your shop live** (until published): only the steps that block
 *    publishing, then an optional "make it look yours" pointer to the Store
 *    Builder, then Preview + Publish right here. It used to be one "4 of 12"
 *    list mixing these with payout KYC, which read as twelve chores before a
 *    shop could open — when a cash-on-delivery shop needs none of the
 *    payout ones.
 *  - **Take online payments** (once live, while unfinished): address, tax
 *    and bank account — clearly optional, since Cash on Delivery works.
 *
 * Drawn as a vertical STEPPER — numbered circles joined by a line, done steps
 * ticked and quiet, the one to do now highlighted with a single "Do it"
 * button — because a seller who follows pictures better than paragraphs can
 * read their progress from the shape alone.
 *
 * Both render from the SAME server-computed `readiness` the publish and
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
  if (!store.isPublished) {
    return <LaunchCard store={store} steps={launchSteps(store)} onStoreChange={onStoreChange} />
  }
  const payoutPending = payoutSteps(store).filter((step) => !step.complete)
  return payoutPending.length > 0 ? <OnlinePaymentsCard steps={payoutPending} /> : null
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
  const actions = usePublishActions(store, onStoreChange)
  const canPublish = store.readiness.gates.PUBLISH.allowed

  const done = steps.filter((step) => step.complete).length
  // +1: publishing is the last step, and it is never "done" on this card.
  const total = steps.length + 1
  // The first unfinished step is the one to do NOW — the only highlighted row.
  const currentKey = steps.find((step) => !step.complete)?.key ?? null

  return (
    <section className="glass-card overflow-hidden rounded-glass">
      <header className="flex items-center gap-3.5 border-b border-line p-4 sm:p-5">
        <ProgressRing done={done} total={total} size={52} label />
        <div className="min-w-0">
          <h3 className="font-heading text-[18px] font-bold text-fg">Get your shop live</h3>
          <p className="mt-0.5 text-hint text-muted">
            {done} of {total} steps done.{' '}
            {canPublish ? 'Only publishing is left.' : 'Do the steps below in order.'}
          </p>
        </div>
      </header>

      <ol className="px-4 py-2 sm:px-5">
        {steps.map((step, i) => (
          <StepRow key={step.key} number={i + 1} step={step} current={step.key === currentKey} />
        ))}

        {/* Advisory: every store already has a working default look, so
            this never blocks and is never "incomplete". */}
        <Row
          marker={<PaletteIcon className="h-4 w-4" />}
          title="Make it look yours"
          optional
          detail="Pick colours and what your home page shows. Your shop already has a clean look, so you can skip this."
          action={
            <Link
              to={`${storePath(store.slug)}/builder`}
              className={buttonClass({ variant: 'secondary', size: 'md' })}
            >
              Open Design
            </Link>
          }
        />

        <Row
          marker={total}
          title="Check and publish"
          current={currentKey === null}
          last
          detail={
            canPublish ? (
              'Look at your shop as customers will see it, then publish it to start taking orders.'
            ) : (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                First add: <BlockerLinks blockers={blockers} />
              </span>
            )
          }
          action={
            <span className="flex flex-wrap gap-2">
              <a
                href={publicStoreUrl(store.slug)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: 'secondary', size: 'md' })}
              >
                <EyeIcon className="h-4 w-4" />
                Preview
              </a>
              {canPublish && (
                <button
                  type="button"
                  onClick={actions.publish}
                  disabled={actions.busy}
                  className={buttonClass({ size: 'md' })}
                >
                  {actions.busy ? 'Publishing…' : 'Publish my shop'}
                </button>
              )}
            </span>
          }
        />
      </ol>
      {actions.error && (
        <p role="alert" className="border-t border-line px-4 py-2.5 text-hint font-medium text-danger sm:px-5">
          {actions.error}
        </p>
      )}
    </section>
  )
}

function OnlinePaymentsCard({ steps }: { steps: StepState[] }) {
  return (
    <section className="glass-card overflow-hidden rounded-glass">
      <header className="border-b border-line p-4 sm:p-5">
        <h3 className="font-heading text-[18px] font-bold text-fg">
          Take online payments{' '}
          <span className="text-hint font-semibold text-muted">(optional)</span>
        </h3>
        <p className="mt-1 text-hint text-muted">
          Cash on Delivery already works. To take UPI and card payments, add
          these so we know who to pay.
        </p>
      </header>
      <ol className="px-4 py-2 sm:px-5">
        {steps.map((step, i) => (
          <StepRow
            key={step.key}
            number={i + 1}
            step={step}
            current={i === 0}
            last={i === steps.length - 1}
          />
        ))}
      </ol>
    </section>
  )
}

/**
 * One readiness step. Unfinished, its detail line names exactly what is
 * missing (rather than a generic blurb and an n/m counter to expand), and
 * its button says what it opens.
 */
function StepRow({
  step,
  number,
  current = false,
  last = false,
}: {
  step: StepState
  number: number
  current?: boolean
  last?: boolean
}) {
  const { hiddenSections } = useStoreManageScope()
  const action = stepAction(step)
  return (
    <Row
      marker={number}
      complete={step.complete}
      current={current}
      last={last}
      title={step.title}
      detail={step.complete ? step.blurb : `Still needed: ${stepMissing(step).join(' · ')}`}
      action={
        // An admin still SEES the outstanding step — "this shop has no PAN" is
        // what support needs to explain the block — but gets no button when
        // the section is not routed for them.
        step.complete || hiddenSections.includes(step.href) ? null : (
          <Link
            to={action.to}
            className={buttonClass({ variant: current ? 'primary' : 'secondary', size: 'md' })}
          >
            {action.label}
          </Link>
        )
      }
    />
  )
}

/**
 * A stepper row: a 36px circle on a vertical line (the line runs to the next
 * row unless `last`), the title, one plain sentence, and the action. The
 * CURRENT row is tinted so the eye lands on it first.
 */
function Row({
  marker,
  complete = false,
  current = false,
  optional = false,
  last = false,
  title,
  detail,
  action,
}: {
  marker: ReactNode
  complete?: boolean
  current?: boolean
  optional?: boolean
  last?: boolean
  title: string
  detail: ReactNode
  action: ReactNode
}) {
  return (
    <li className="relative flex gap-3.5 py-3">
      {/* The connector, behind the circles. */}
      {!last && (
        <span
          aria-hidden
          className={`absolute top-[3.1rem] bottom-[-0.65rem] left-[17px] w-0.5 rounded-full ${
            complete ? 'bg-success/50' : 'bg-fg/10'
          }`}
        />
      )}
      <span
        aria-hidden
        className={`relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
          complete
            ? 'bg-success text-brand-contrast'
            : current
              ? 'bg-brand-gradient text-brand-contrast shadow-[0_6px_16px_-6px_var(--cta-glow)]'
              : optional
                ? 'bg-brand-soft text-brand'
                : 'glass-inset text-muted'
        }`}
      >
        {complete ? <CheckIcon className="h-4 w-4" /> : marker}
      </span>

      <div
        className={`min-w-0 flex-1 rounded-xl ${
          current ? '-my-1 bg-brand-soft/70 px-3 py-2.5' : ''
        }`}
      >
        <p className={`text-[15px] font-semibold ${complete ? 'text-muted' : 'text-fg'}`}>
          {title}
          {optional && <span className="ml-1.5 text-hint font-medium text-muted">(optional)</span>}
          {complete && <span className="sr-only"> — done</span>}
        </p>
        <div className="mt-0.5 text-hint text-muted">{detail}</div>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </li>
  )
}
