import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Readiness, StepState } from '../../features/stores/storeProfile'
import { CheckIcon, ChevronRightIcon } from '../../layout/icons'

/**
 * "Finish setting up your store" — the resumable half of onboarding.
 *
 * The wizard covers what can be asked at signup; this covers everything else
 * (a first product, a payout account) plus whatever the seller skipped. Both
 * render from the SAME server-computed `readiness`, which is also what the
 * publish and payment endpoints enforce, so the list can never promise a
 * seller they are done while the server disagrees.
 *
 * It disappears once every applicable requirement is met — a checklist that
 * lingers at 100% is noise, and the gates it guarded are already open.
 */
export function SetupChecklist({ readiness }: { readiness: Readiness }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  // Steps with nothing applicable (pickup address for a delivery-only store)
  // are not "incomplete" — they do not apply, and showing them would be a bug.
  const pending = readiness.steps.filter(
    (step) => !step.complete && step.totalCount > 0,
  )
  if (readiness.complete || pending.length === 0) return null

  const percent = readiness.totalCount
    ? Math.round((readiness.metCount / readiness.totalCount) * 100)
    : 0

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-body text-base font-semibold text-fg">
            Finish setting up your store
          </h3>
          <span className="text-xs font-medium text-muted">
            {readiness.metCount} of {readiness.totalCount} done
          </span>
        </div>

        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Store setup progress"
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="mt-2.5 text-xs text-muted">
          {readiness.gates.PUBLISH.allowed
            ? 'Your store is ready to publish.'
            : `${readiness.gates.PUBLISH.blockers.length} of these are needed before you can publish.`}
        </p>
      </header>

      <ul className="divide-y divide-line">
        {pending.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            open={expanded === step.key}
            onToggle={() =>
              setExpanded((current) => (current === step.key ? null : step.key))
            }
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * One step. Collapsed it is a title plus an n/m counter; expanded it lists the
 * individual requirements with their state, so "Business & contact 2/4" can
 * be resolved into "you still need a phone and an email" without leaving the
 * page. The link out is separate from the expander — tapping the row should
 * explain, not navigate away mid-thought.
 */
function StepRow({
  step,
  open,
  onToggle,
}: {
  step: StepState
  open: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <div className="flex items-center gap-2 px-4 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 py-3.5 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-alt text-[11px] font-semibold text-muted">
            {step.metCount}/{step.totalCount}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">
              {step.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {step.blurb}
            </span>
          </span>
          <ChevronRightIcon
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${
              open ? 'rotate-90' : ''
            }`}
          />
        </button>

        <Link
          to={step.href}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface-alt"
        >
          Add
        </Link>
      </div>

      {open && (
        <ul className="space-y-1.5 px-4 pb-4 pl-[3.4rem] sm:px-5 sm:pl-[4.1rem]">
          {step.requirements.map((req) => (
            <li
              key={req.key}
              className={`flex items-center gap-2 text-xs ${
                req.met ? 'text-muted' : 'text-fg'
              }`}
            >
              {req.met ? (
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
              )}
              <span className={req.met ? 'line-through' : ''}>{req.label}</span>
              {!req.met && req.gates.includes('PUBLISH') && (
                <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  to publish
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
