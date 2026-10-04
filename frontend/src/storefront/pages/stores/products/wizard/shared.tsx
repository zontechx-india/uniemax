import type { ReactNode } from 'react'
import type { StoreCategory } from '../../../../features/stores/storesApi'
import { Button, buttonClass } from '../../../../../shared/ui/Button'

/**
 * The product wizard's steps, in order. Every step saves as it goes (the
 * product is a draft on the server from the end of step 1), so leaving at any
 * point loses nothing and "finish later" is always honest.
 */
export const STEPS = [
  { key: 'basics', label: 'What is it?' },
  { key: 'photos', label: 'Photos' },
  { key: 'pricing', label: 'Price & choices' },
  { key: 'details', label: 'Tell customers more' },
  { key: 'delivery', label: 'Delivery & payment' },
  { key: 'review', label: 'Review & publish' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

// 48px tall (px, so the 90% root cannot shrink it); phones also get the
// 16px input floor from index.css, so focusing never zooms the page.
export const inputClass =
  'h-field w-full rounded-md border border-line bg-input px-3.5 text-[15px] text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

/** One line under a field, in plain words — why it matters, with an example. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-hint text-muted">{children}</p>
}

/** A labelled field with its hint, so every step reads the same way. */
export function Field({
  label,
  optional = false,
  hint,
  children,
}: {
  label: string
  optional?: boolean
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-fg">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-muted">(optional)</span>
        )}
      </span>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </label>
  )
}

/** Title + one-sentence lead above a step's content. */
export function StepShell({
  title,
  lead,
  children,
}: {
  title: string
  lead: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="font-heading text-[22px] leading-tight font-bold text-fg">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{lead}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </div>
  )
}

export function StepButtons({
  onBack,
  onNext,
  nextLabel = 'Continue',
  busy = false,
  canNext = true,
  skip,
  skipLabel,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  busy?: boolean
  canNext?: boolean
  /** "Skip for now" — for optional steps. */
  skip?: () => void
  /** Wording for `skip` where "skip" would be unclear (e.g. "Save as draft"). */
  skipLabel?: string
}) {
  // A sticky frosted bar on phones — Continue is always under the thumb,
  // however long the step — and an ordinary row from `sm` up. "Skip" is a
  // real 44px button, not a text link a thumb has to hunt for.
  return (
    <div className="sticky bottom-3 z-10 -mx-2 flex flex-col gap-2 rounded-glass p-2 max-sm:glass-strong sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:rounded-none sm:border-t sm:border-line sm:p-0 sm:pt-4">
      <div className="flex items-center gap-2 sm:contents">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className={buttonClass({ variant: 'ring', size: 'lg', className: 'px-5' })}
          >
            Back
          </button>
        )}
        <Button
          type="button"
          size="lg"
          onClick={onNext}
          loading={busy}
          disabled={!canNext}
          className="min-w-0 flex-1 text-[15px] sm:flex-none sm:px-8"
        >
          {busy ? 'Saving…' : nextLabel}
        </Button>
      </div>
      {skip && (
        <button
          type="button"
          onClick={skip}
          disabled={busy}
          className="min-h-tap rounded-md px-3 text-[15px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
        >
          {skipLabel ?? 'Skip for now'}
        </button>
      )}
    </div>
  )
}

/** Shelf choices in tree order, each labelled with its full path. */
export function categoryOptions(
  categories: StoreCategory[],
): { id: string; label: string }[] {
  const walk = (
    parentId: string | null,
    path: string[],
  ): { id: string; label: string }[] =>
    categories
      .filter((c) => c.parentId === parentId)
      .flatMap((c) => {
        const here = [...path, c.name]
        return [{ id: c.id, label: here.join(' › ') }, ...walk(c.id, here)]
      })
  return walk(null, [])
}
