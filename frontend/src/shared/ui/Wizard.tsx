import type { ReactNode } from 'react'
import { Button, buttonClass } from './Button'

/**
 * A generic, presentational multi-step form shell.
 *
 * Knows nothing about stores, profiles or onboarding — it renders a numbered
 * progress header, a titled panel and a footer of actions. The caller owns
 * the step list, the current index and every field, so the same component
 * serves any future flow (a payout setup, a bulk import) without a fork.
 *
 * Responsive by construction, because a seller is as likely to sign up on a
 * phone as a laptop:
 *   - **< sm** — a compact "Step 2 of 4" line over a single progress bar.
 *     Four labelled circles would either wrap or truncate to nothing useful.
 *   - **sm+** — the full rail: numbered circles, titles, connectors, with
 *     completed steps ticked and clickable to jump back.
 *
 * The panel is frosted glass, and on a phone the action row is a sticky
 * glass bar so Continue never scrolls out from under the thumb — the seller
 * area's design rules (docs/MYSTORES_UX_PLAN.md §3).
 */

export interface WizardStep {
  /** Stable identity — also the React key. */
  key: string
  /** Shown on the rail (sm+) and as the panel heading. */
  title: string
  /** One line under the panel heading. */
  blurb?: string
  /** Renders a "Skip for now" action in the footer. */
  optional?: boolean
}

export function Wizard({
  steps,
  current,
  onStepSelect,
  children,
}: {
  steps: WizardStep[]
  /** Index into `steps` of the step being shown. */
  current: number
  /**
   * Jump to an earlier step. Only completed steps are clickable — moving
   * forward has to go through validation, so it stays with the footer button.
   */
  onStepSelect?: (index: number) => void
  children: ReactNode
}) {
  const step = steps[current]

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* --- Mobile: one segment per step, then "Step 2 of 3" --------- */}
      <div className="sm:hidden">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Step ${current + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= current ? 'bg-brand-gradient' : 'bg-fg/10'
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-brand">
          Step {current + 1} of {steps.length}
        </p>
      </div>

      {/* --- sm+: the full rail --------------------------------------- */}
      <ol className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const clickable = done && onStepSelect !== undefined
          return (
            <li
              key={s.key}
              className={`flex items-center ${i === steps.length - 1 ? '' : 'flex-1'}`}
            >
              <button
                type="button"
                onClick={clickable ? () => onStepSelect(i) : undefined}
                disabled={!clickable}
                aria-current={active ? 'step' : undefined}
                className={`flex min-h-tap min-w-0 items-center gap-2 rounded-xl px-1.5 text-left transition ${
                  clickable ? 'cursor-pointer hover:bg-fg/5' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    done
                      ? 'bg-success text-brand-contrast'
                      : active
                        ? 'bg-brand-gradient text-brand-contrast shadow-[0_6px_16px_-6px_var(--cta-glow)]'
                        : 'glass-inset text-muted'
                  }`}
                >
                  {done ? <TickIcon /> : i + 1}
                </span>
                <span
                  className={`truncate text-sm font-semibold ${
                    active ? 'text-fg' : 'text-muted'
                  }`}
                >
                  {s.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-2 h-0.5 flex-1 rounded-full transition-colors ${
                    done ? 'bg-success' : 'bg-fg/10'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* --- The panel ------------------------------------------------- */}
      <div className="glass mt-3 rounded-glass p-5 sm:mt-6 sm:p-7">
        {step && (
          <header className="mb-6">
            <h1 className="font-heading text-2xl leading-tight font-bold text-fg">
              {step.title}
            </h1>
            {step.blurb && (
              <p className="mt-1.5 text-base leading-relaxed text-muted">{step.blurb}</p>
            )}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}

/**
 * The wizard's action row.
 *
 * On a phone it is a sticky frosted bar at the bottom of the screen — Back
 * compact on the left, the primary filling the rest — so the next step is
 * always under the thumb, however long the step is. On sm+ it returns to the
 * conventional Back-left / Continue-right, in flow.
 */
export function WizardActions({
  onBack,
  onSkip,
  submitLabel = 'Continue',
  busy = false,
  disabled = false,
}: {
  onBack?: () => void
  onSkip?: () => void
  submitLabel?: string
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <div className="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-10 -mx-2 mt-8 flex items-center gap-2 rounded-glass p-2 max-sm:glass-strong sm:static sm:mx-0 sm:justify-between sm:p-0">
      <div className="flex shrink-0 items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className={buttonClass({ variant: 'secondary', size: 'lg', className: 'px-5' })}
          >
            Back
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="min-h-tap rounded-md px-3 text-base font-semibold text-muted transition hover:bg-fg/5 hover:text-fg disabled:cursor-not-allowed"
          >
            Skip for now
          </button>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        loading={busy}
        disabled={disabled}
        className="min-w-0 flex-1 px-6 text-base sm:flex-none sm:px-8"
      >
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}

function TickIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}
