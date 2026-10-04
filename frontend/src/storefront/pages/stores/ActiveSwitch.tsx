/**
 * Small pill toggle used on catalog rows (categories/products) to enable or
 * disable the item on the public storefront. Green = visible to customers,
 * gray = hidden. Purely presentational — the caller owns the request state.
 */
export function ActiveSwitch({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  /** Accessible name, e.g. "Enable Cricket Bats". */
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={checked ? 'Enabled — visible to customers' : 'Disabled — hidden from customers'}
      // The visual stays compact for dense rows, but `before:` stretches the
      // HIT area to 44px tall — a 20px target was the most-missed tap on a
      // phone. New screens use the labelled `BigSwitch` (stores/ui) instead.
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors before:absolute before:-inset-x-[6px] before:-inset-y-[12px] before:content-[''] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-success' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
