import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The one button.
 *
 * Height, radius, padding and weight live HERE, so a call site can only
 * choose a variant and a size. Before this, every CTA was sized inline and
 * the storefront drifted into four height systems, three font weights and
 * two radii across seven files — that drift is no longer expressible.
 *
 * ## Which variant
 *
 * The choice is about IMPORTANCE, not looks. In order of weight:
 *
 * | Variant  | Use for                                          | Per view |
 * | -------- | ------------------------------------------------ | -------- |
 * | `sheen`  | the ONE committing action — Buy Now, Place Order  | max 1    |
 * | `rise`   | every other primary — the default                | any      |
 * | `ring`   | the secondary standing BESIDE a primary          | any      |
 *
 * `sheen` sweeps a highlight across on hover; more than one per screen and
 * it reads as noise. `ring` is a gradient outline that fills on hover — it
 * belongs next to a `rise`/`sheen` (Add to Cart beside Buy Now), where a
 * second filled button would compete for the same attention.
 *
 * All three fills are cut from the STORE OWNER's primary color via the
 * `--cta-*` stops (`storeTheme.ts#storeVars()`), so they re-derive per store.
 * The fills themselves are in `index.css`; see docs/FRONTEND_CONTEXT.md.
 *
 * ## Links
 *
 * Several CTAs are `<Link>`, not `<button>`. Those use `buttonClass()`
 * directly rather than this component:
 *
 * ```tsx
 * <Link to={…} className={buttonClass({ variant: 'sheen' })}>Place Order</Link>
 * ```
 */

export type ButtonVariant = 'rise' | 'sheen' | 'ring'
export type ButtonSize = 'sm' | 'md' | 'lg'

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3.5 text-xs',
  md: 'h-11 gap-2 px-5 text-sm',
  lg: 'h-12 gap-2 px-6 text-sm',
}

const VARIANT: Record<ButtonVariant, string> = {
  rise: 'btn-rise text-cta-contrast',
  sheen: 'btn-sheen text-cta-contrast',
  // Label flips from the flat brand to the CTA contrast as the ring fills.
  ring: 'btn-ring text-brand hover:text-cta-contrast',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md font-bold ' +
  'transition disabled:cursor-not-allowed disabled:opacity-45'

export interface ButtonClassOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container — the full-width CTA under a product. */
  full?: boolean
  /** Appended last, so a caller can add layout (margins, `flex-1`). */
  className?: string
}

/** The class string on its own — for `<Link>` and other non-`<button>` CTAs. */
export function buttonClass({
  variant = 'rise',
  size = 'md',
  full = false,
  className = '',
}: ButtonClassOptions = {}): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${full ? 'w-full' : ''} ${className}`
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonClassOptions {
  /** Shows the spinner and disables the button. Swap the label yourself. */
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant,
  size,
  full,
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={buttonClass({ variant, size, full, className })}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

/** Inline ring spinner in `currentColor` — no asset, no dependency. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  )
}
