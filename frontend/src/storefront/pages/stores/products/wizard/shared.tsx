import type { ReactNode } from 'react'
import type { StoreCategory } from '../../../../features/stores/storesApi'

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

export const inputClass =
  'h-11 w-full rounded-md border border-line bg-input px-3.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

/** One line under a field, in plain words — why it matters, with an example. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
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
      <span className="mb-1.5 block text-sm font-medium text-fg">
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
      <h3 className="font-heading text-lg font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm text-muted">{lead}</p>
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
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  busy?: boolean
  canNext?: boolean
  /** "Skip for now" — for optional steps. */
  skip?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={busy || !canNext}
        className="inline-flex h-11 items-center rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
      >
        {busy ? 'Saving…' : nextLabel}
      </button>
      {skip && (
        <button
          type="button"
          onClick={skip}
          disabled={busy}
          className="text-sm font-semibold text-muted transition hover:text-fg"
        >
          Skip for now
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
