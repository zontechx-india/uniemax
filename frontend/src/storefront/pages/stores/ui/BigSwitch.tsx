/**
 * The seller workspace's on/off control — the successor to `ActiveSwitch`,
 * with the same core props so a call site swaps by name.
 *
 * What changed, and why:
 *   - 52×32 track inside a 44px-tall hit area (was 36×20).
 *   - The state is WRITTEN beside it ("On" / "Off", or the caller's words),
 *     so it does not depend on reading green-vs-grey.
 *   - `label` is still the accessible name ("Show Cricket Bats in the shop").
 */
export function BigSwitch({
  checked,
  disabled = false,
  label,
  onChange,
  onText = 'On',
  offText = 'Off',
  showState = true,
}: {
  checked: boolean
  disabled?: boolean
  /** Accessible name, e.g. "Show Cricket Bats in the shop". */
  label: string
  onChange: (next: boolean) => void
  /** The visible state words — "Showing" / "Hidden" reads better than On/Off
   *  for visibility toggles. */
  onText?: string
  offText?: string
  /** Hide the state word where a row already says it elsewhere. */
  showState?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-tap shrink-0 items-center gap-2 rounded-pill pr-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`relative h-8 w-[52px] shrink-0 rounded-pill transition-colors duration-200 ${
          checked ? 'bg-success' : 'bg-fg/20'
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-[left] duration-200 ${
            checked ? 'left-[24px]' : 'left-1'
          }`}
        />
      </span>
      {showState && (
        // Both words share one grid cell, the inactive one invisible, so the
        // label is always as wide as the LONGER word — switches in a list stay
        // aligned instead of nudging their neighbours as they flip.
        <span aria-hidden className="grid text-left text-sm font-semibold">
          <span className={`[grid-area:1/1] ${checked ? 'text-success' : 'invisible'}`}>
            {onText}
          </span>
          <span className={`[grid-area:1/1] ${checked ? 'invisible' : 'text-muted'}`}>
            {offText}
          </span>
        </span>
      )}
    </button>
  )
}
