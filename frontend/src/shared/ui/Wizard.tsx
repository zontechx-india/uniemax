import type { ReactNode } from 'react'

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
  const progress = ((current + 1) / steps.length) * 100

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* --- Mobile: counter + bar ------------------------------------ */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            Step {current + 1} of {steps.length}
          </span>
          <span className="text-xs text-muted">{step?.title}</span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Step ${current + 1} of ${steps.length}`}
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
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
                className={`flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition ${
                  clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                    done
                      ? 'bg-success text-white'
                      : active
                        ? 'bg-brand-gradient text-brand-contrast shadow-floating'
                        : 'border border-line bg-surface text-muted'
                  }`}
                >
                  {done ? <TickIcon /> : i + 1}
                </span>
                <span
                  className={`hidden truncate text-xs font-medium md:block ${
                    active ? 'text-fg' : 'text-muted'
                  }`}
                >
                  {s.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-2 h-px flex-1 transition-colors ${
                    done ? 'bg-success' : 'bg-line'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* --- The panel ------------------------------------------------- */}
      <div className="mt-4 rounded-lg bg-surface p-5 shadow-floating sm:mt-6 sm:p-7">
        {step && (
          <header className="mb-5">
            <h1 className="font-body text-lg font-bold tracking-tight text-fg sm:text-xl">
              {step.title}
            </h1>
            {step.blurb && (
              <p className="mt-1 text-sm text-muted">{step.blurb}</p>
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
 * Order differs by breakpoint on purpose. On a phone the primary action is
 * full-width and FIRST in the DOM but rendered last visually via
 * `flex-col-reverse`, so it sits under the thumb while Back stays reachable
 * above it. On sm+ the pair returns to the conventional Back-left /
 * Continue-right.
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
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="h-11 rounded-md border border-line px-5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            Back
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="h-11 rounded-md px-3 text-sm font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:cursor-not-allowed"
          >
            Skip for now
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || disabled}
        className="h-11 w-full rounded-md bg-brand-gradient px-8 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted sm:w-auto"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
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
