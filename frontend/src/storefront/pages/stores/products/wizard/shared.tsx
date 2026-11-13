import { useEffect, useRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { cleanAmount } from '../../../../features/stores/productOptions'
import type { StoreCategory } from '../../../../features/stores/storesApi'
import { Button } from '../../../../../shared/ui/Button'
import { ErrorNote } from '../../../../../shared/ui/form'

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

/**
 * A supplier account's names for the same steps: it has no shop, so it never
 * publishes — it offers the product to its sellers — and only its delivery
 * area reaches them (shipping charge and COD are each seller's).
 */
const SUPPLIER_LABELS: Partial<Record<StepKey, string>> = {
  delivery: 'Delivery area',
  review: 'Review & offer',
}

export const stepLabel = (key: StepKey, supplyOnly: boolean): string =>
  (supplyOnly ? SUPPLIER_LABELS[key] : undefined) ?? STEPS.find((s) => s.key === key)!.label

/**
 * The seller's step-1 answer to "more than one colour or size?", carried to
 * the photo and price steps so they can speak to it. Null = not answered
 * (skipped, or an existing product) — step 3 asks again.
 */
export type VersionPlan = 'one' | 'many' | null

/*
 * The wizard follows the console theme (ADMIN_UI_THEME.md): the frame
 * carries `ws-dense`, so every size below lands on the dense scale (14px
 * body, 13px labels, 12px hints, 40px fields and buttons). Each step is a
 * stack of `Section`s — a flat card with a header bar — that run edge to edge
 * on a phone, so no space goes to card gutters and rounded corners.
 */

// 40px in the wizard (`--spacing-field` under ws-dense); phones keep the
// 16px input floor from index.css, so focusing never zooms the page.
export const inputClass =
  'h-field w-full rounded-md border border-line bg-input px-3 text-base text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60'

/** A rupee amount: the ₹ sits inside the field, so the label need not say it. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <span className="relative block">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted">
        ₹
      </span>
      <input
        value={value}
        onChange={(e) => onChange(cleanAmount(e.target.value))}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClass} pl-7`}
      />
    </span>
  )
}

/** One short line under a field. Keep it to a few words. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-hint text-muted">{children}</p>
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
    <label className="block min-w-0">
      <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-fg">
        <span className="truncate">{label}</span>
        {optional && <span className="shrink-0 text-hint font-normal text-muted">Optional</span>}
      </span>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </label>
  )
}

/**
 * One block of a step — the console card: a header bar (icon tile, title,
 * an optional aside) over its body. Edge to edge on a phone (`ws-step-body`
 * lets a `<section>` reach the screen edges), a 10px card from `sm` up.
 */
export function Section({
  title,
  icon: Icon,
  aside,
  flush = false,
  children,
}: {
  title?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Right side of the header bar — a count, a status, a small button. */
  aside?: ReactNode
  /** No body padding — for lists and boards that draw their own rows. */
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="border-y border-line bg-surface sm:rounded-lg sm:border">
      {title && (
        <header className="flex min-h-11 items-center gap-2 border-b border-line px-4 py-2">
          {Icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h4>
          {aside}
        </header>
      )}
      <div className={flush ? '' : 'space-y-3.5 px-4 py-3.5'}>{children}</div>
    </section>
  )
}

/**
 * A step: a title and at most one short line, then its sections. On a phone
 * the title is left to the wizard's header ("Step 3 of 6 · Price & choices")
 * and only the short line shows; from `sm` up the title shows too.
 */
export function StepShell({
  title,
  lead,
  children,
}: {
  title: string
  /** One short line — a few words. Leave it out when the sections say it. */
  lead?: ReactNode
  children: ReactNode
}) {
  // Fills the phone screen, so a short step still has its button bar
  // (`mt-auto`) at the bottom, under the thumb.
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-4 sm:px-0">
        <h3 className="sr-only font-heading text-xl leading-tight font-semibold text-fg sm:not-sr-only">{title}</h3>
        {lead && <p className="text-sm text-muted sm:mt-1">{lead}</p>}
      </div>
      <div className={`ws-step-body flex flex-1 flex-col gap-2 sm:gap-3 ${lead ? 'mt-2.5 sm:mt-4' : 'sm:mt-4'}`}>
        {children}
      </div>
    </div>
  )
}

/**
 * A step's error, brought into view. Steps are long and their buttons are
 * sticky, so an error drawn at the bottom sat under the bar: the seller tapped
 * Continue and nothing seemed to happen. Each new message scrolls itself to
 * the middle of the screen.
 */
export function StepError({ children }: { children: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [children])
  return (
    <div ref={ref}>
      <ErrorNote>{children}</ErrorNote>
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
  // A flush bar pinned to the bottom of a phone screen — Continue is always
  // under the thumb, however long the step — and an ordinary row from `sm` up.
  return (
    <footer className="sticky bottom-0 z-10 mt-auto flex flex-col gap-1.5 border-t border-line bg-surface px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:static sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:bg-transparent sm:px-0 sm:pt-4 sm:pb-0">
      <div className="flex items-center gap-2 sm:contents">
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack} disabled={busy} className="px-5">
            Back
          </Button>
        )}
        <Button
          type="button"
          onClick={onNext}
          loading={busy}
          disabled={!canNext}
          className="min-w-0 flex-1 sm:flex-none sm:px-8"
        >
          {busy ? 'Saving…' : nextLabel}
        </Button>
      </div>
      {skip && (
        <Button variant="ghost" size="sm" onClick={skip} disabled={busy} className="px-3">
          {skipLabel ?? 'Skip for now'}
        </Button>
      )}
    </footer>
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

/**
 * One answer to a two-way question ("same as the shop?") — the console's
 * option card: icon tile, a title, a few words, a radio dot. Wrap the pair in
 * a `role="radiogroup"`. Questions with a picture use `VersionCard`.
 */
export function ChoiceCard({
  active,
  icon: Icon,
  title,
  body,
  onClick,
}: {
  active: boolean
  icon: (props: { className?: string }) => ReactNode
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
        active ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/60'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          active ? 'bg-brand text-brand-contrast' : 'bg-fg/5 text-muted'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-hint text-muted">{body}</span>
      </span>
      <RadioDot on={active} />
    </button>
  )
}

/** The radio dot every option card ends with. */
export function RadioDot({ on, className = '' }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 bg-surface ${
        on ? 'border-brand' : 'border-fg/25'
      } ${className}`}
    >
      {on && <span className="h-2 w-2 rounded-full bg-brand" />}
    </span>
  )
}
