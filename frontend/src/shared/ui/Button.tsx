import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * The one button (docs/DESIGN_GUIDELINES.md section 9).
 *
 * Height, radius, padding and weight live HERE, so a call site can only
 * choose a role and a size; a hand-made `<button>` styled as a CTA is not
 * allowed. Four roles, chosen by IMPORTANCE:
 *
 * | Variant     | Use for                                        | Per view |
 * | ----------- | ---------------------------------------------- | -------- |
 * | `primary`   | the main action — Save, Buy Now, Place Order   | one*     |
 * | `secondary` | a supporting action — Cancel, Add to Cart      | any      |
 * | `ghost`     | a low-priority action — Skip, Clear filters    | any      |
 * | `danger`    | a destructive action — Delete, Cancel order    | rare     |
 *
 * (*) A list may repeat its row action, but a screen has one clear primary.
 * Fills are FLAT (no gradients or glows); the primary takes `--cta`, which
 * a storefront re-points to the shop owner's colour. Every state — hover,
 * pressed, focus (global ring), disabled, loading — is handled here.
 *
 * Links that look like buttons use `buttonClass()`:
 *
 * ```tsx
 * <Link to={...} className={buttonClass({ variant: 'primary' })}>Place Order</Link>
 * ```
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

// Heights in px: sm 36 (dense rows only), md 44 (the tap minimum), lg 48.
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-[36px] gap-1.5 px-3.5 text-sm',
  md: 'h-tap gap-2 px-5 text-sm',
  lg: 'h-field gap-2 px-6 text-base',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md font-semibold ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45'

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
  variant = 'primary',
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
  /** React 19: refs are plain props (ConfirmDialog focuses Cancel). */
  ref?: Ref<HTMLButtonElement>
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
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
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
