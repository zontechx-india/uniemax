import { useState } from 'react'
import type { StoreTheme } from '../../features/stores/storesApi'

/**
 * The five colour controls, and the rules about what "Auto" means.
 *
 * Extracted from the Appearance section so the Store Builder's Design panel
 * edits colours with the *same* controls rather than a second, subtly
 * different set — including the shorthand expansion, the paste handling and
 * the Auto fields, all of which are easy to get almost right twice.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const HEX_SHORT = /^#[0-9a-fA-F]{3}$/

/** Mirror of the storefront's Auto rule: white on dark, near-black on light. */
export function autoButtonText(primary: string): string {
  const match = primary.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!match) return '#ffffff'
  const r = parseInt(match.slice(0, 2), 16)
  const g = parseInt(match.slice(2, 4), 16)
  const b = parseInt(match.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? '#ffffff' : '#101010'
}

export function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  /** One-line role description shown under the field. */
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-muted">{label}</span>
      <ColorFieldInner value={value} label={label} onChange={onChange} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** The swatch + hex input row (shared by ColorField and AutoColorField). */
function ColorFieldInner({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  // Local draft so the user can type/paste freely; only valid #rrggbb
  // values are committed to the theme.
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  const commit = (raw: string) => {
    const text =
      raw.trim().startsWith('#') || raw.trim() === ''
        ? raw.trim()
        : `#${raw.trim()}`
    setDraft(text)
    if (HEX_COLOR.test(text)) onChange(text)
  }

  const blur = () => {
    // Expand shorthand like #EB3 → #EEBB33; otherwise snap back if invalid
    if (HEX_SHORT.test(draft)) {
      const [r, g, b] = draft.slice(1)
      const full = `#${r}${r}${g}${g}${b}${b}`
      setDraft(full)
      onChange(full)
    } else if (!HEX_COLOR.test(draft)) {
      setDraft(value)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-line p-2.5 transition-colors hover:border-fg/30 focus-within:border-accent">
      <input
        type="color"
        value={value}
        onChange={(e) => commit(e.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => commit(e.target.value)}
        onBlur={blur}
        maxLength={7}
        spellCheck={false}
        placeholder="#6C3EF4"
        aria-label={`${label} hex code`}
        className="w-full min-w-0 bg-transparent font-mono text-sm uppercase text-fg outline-none placeholder:text-muted"
      />
    </div>
  )
}

/**
 * A ColorField that can also be **Auto** (`value === null`): the storefront
 * derives the color itself (secondary follows primary; surface follows the
 * background) — the behaviour every store had before these settings existed.
 * "Customize" seeds the picker with a sensible starting color; "Auto" resets.
 */
export function AutoColorField({
  label,
  hint,
  autoLabel,
  value,
  customizeSeed,
  onChange,
}: {
  label: string
  hint: string
  /** What Auto means for this field, e.g. "same as primary". */
  autoLabel: string
  value: string | null
  /** Color the picker starts from when switching off Auto. */
  customizeSeed: string
  onChange: (value: string | null) => void
}) {
  if (value === null) {
    return (
      <div>
        <span className="mb-2 flex items-center justify-between text-sm font-medium text-muted">
          {label}
          <button
            type="button"
            onClick={() => onChange(customizeSeed)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Customize
          </button>
        </span>
        <div className="flex h-[58px] items-center rounded-md border border-dashed border-line px-3.5">
          <span className="text-sm text-muted">Auto — {autoLabel}</span>
        </div>
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      </div>
    )
  }

  return (
    <div>
      <span className="mb-2 flex items-center justify-between text-sm font-medium text-muted">
        {label}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Reset to Auto
        </button>
      </span>
      <ColorFieldInner value={value} label={label} onChange={onChange} />
      <span className="mt-1.5 block text-xs text-muted">{hint}</span>
    </div>
  )
}

/**
 * All five colour controls in the order the seller meets them: the two that
 * always apply first, then the three that can stay on Auto.
 *
 * Kept as one component because the *order* and the *wording* are the design —
 * a seller who is told "Surface — keep it close to your background's tone" is
 * far less likely to produce an unreadable shop than one handed five unlabelled
 * pickers.
 */
export function ThemeColorGrid({
  theme,
  onChange,
}: {
  theme: StoreTheme
  onChange: <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => void
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <ColorField
        label="Background color"
        hint="The page canvas."
        value={theme.backgroundColor}
        onChange={(v) => onChange('backgroundColor', v)}
      />
      <ColorField
        label="Primary color"
        hint="Buttons and the call-to-action shine."
        value={theme.primaryColor}
        onChange={(v) => onChange('primaryColor', v)}
      />
      <AutoColorField
        label="Secondary color"
        hint="Links, prices and highlights."
        autoLabel="same as primary"
        value={theme.secondaryColor}
        customizeSeed={theme.primaryColor}
        onChange={(v) => onChange('secondaryColor', v)}
      />
      <AutoColorField
        label="Surface color"
        hint="Cards and panels. Keep it close to your background's tone so text stays readable."
        autoLabel="derived from background"
        value={theme.surfaceColor}
        customizeSeed={theme.backgroundColor}
        onChange={(v) => onChange('surfaceColor', v)}
      />
      <AutoColorField
        label="Button text color"
        hint="Text on your buttons (Add to Cart, Place Order). Check the button in the preview stays readable."
        autoLabel="white or black, based on your primary color"
        value={theme.buttonTextColor}
        customizeSeed={autoButtonText(theme.primaryColor)}
        onChange={(v) => onChange('buttonTextColor', v)}
      />
    </div>
  )
}
