import { useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, SuccessNote } from '../../../shared/ui/form'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreTheme } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { storeVars } from '../../features/publicStore/storeTheme'

/**
 * Appearance section — storefront customization: background + primary
 * colors, optional secondary (links/prices/highlights) and surface
 * (cards/panels) colors — both default to **Auto**, matching the derived
 * behaviour stores had before the fields existed — with a live
 * mini-storefront preview mirroring how the public store page will render.
 */
export function StoreAppearancePage() {
  const { store, onStoreChange } = useManagedStore()

  const [theme, setTheme] = useState<StoreTheme>(store.theme)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const dirty = JSON.stringify(theme) !== JSON.stringify(store.theme)
  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => {
    setTheme((t) => ({ ...t, [key]: value }))
    setSaved(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const updated = await storesApi.updateTheme(store.id, theme)
      onStoreChange(updated)
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-muted">
        Customize how your store looks to customers.
      </p>

      <form onSubmit={submit} className="mt-4 max-w-xl space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField
            label="Background color"
            hint="The page canvas."
            value={theme.backgroundColor}
            onChange={(v) => set('backgroundColor', v)}
          />
          <ColorField
            label="Primary color"
            hint="Buttons and the call-to-action shine."
            value={theme.primaryColor}
            onChange={(v) => set('primaryColor', v)}
          />
          <AutoColorField
            label="Secondary color"
            hint="Links, prices and highlights."
            autoLabel="same as primary"
            value={theme.secondaryColor}
            customizeSeed={theme.primaryColor}
            onChange={(v) => set('secondaryColor', v)}
          />
          <AutoColorField
            label="Surface color"
            hint="Cards and panels. Keep it close to your background's tone so text stays readable."
            autoLabel="derived from background"
            value={theme.surfaceColor}
            customizeSeed={theme.backgroundColor}
            onChange={(v) => set('surfaceColor', v)}
          />
          <AutoColorField
            label="Button text color"
            hint="Text on your buttons (Add to Cart, Place Order). Check the button in the preview below stays readable."
            autoLabel="white or black, based on your primary color"
            value={theme.buttonTextColor}
            customizeSeed={autoButtonText(theme.primaryColor)}
            onChange={(v) => set('buttonTextColor', v)}
          />
        </div>

        {/* Live mini-storefront preview */}
        <div>
          <span className="mb-2 block text-sm font-medium text-muted">
            Preview
          </span>
          <ThemePreview theme={theme} storeName={store.name} />
          <span className="mt-1.5 block text-xs text-muted">
            A miniature of your public store page with these settings.
          </span>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Appearance saved.</SuccessNote>}

        <button
          type="submit"
          disabled={busy || !dirty}
          className="h-11 rounded-md bg-brand-gradient px-6 text-sm font-semibold text-brand-contrast transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : 'Save Appearance'}
        </button>
      </form>
    </div>
  )
}

/**
 * Miniature of the public store page: sticky chrome (logo · search · cart),
 * the horizontal category bar, and the product card grid. It drives itself
 * from the very same `storeVars()` + `.metal-*` semantics the real
 * storefront uses (flat surfaces, chrome CTAs), so the luminance-adaptive
 * palette shown here is exactly what customers get.
 */
function ThemePreview({
  theme,
  storeName,
}: {
  theme: StoreTheme
  storeName: string
}) {
  return (
    <div
      className="overflow-hidden rounded-md border border-line"
      style={storeVars(theme)}
    >
      {/* Mini top bar: logo · search · cart — flat like the real header. */}
      <div className="flex items-center gap-2 border-b border-line bg-bg px-3.5 py-2.5">
        <span className="metal-cta h-6 w-6 shrink-0 rounded-md" />
        <span className="truncate text-[11px] font-bold text-fg">
          {storeName}
        </span>
        <span className="ml-auto h-5 w-24 shrink-0 rounded-full border border-line bg-surface-alt" />
        <span className="relative shrink-0">
          <span className="block h-6 w-6 rounded-full border border-line bg-surface" />
          <span className="metal-cta absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" />
        </span>
      </div>

      {/* Mini category bar */}
      <div className="flex items-center gap-1.5 border-b border-line bg-bg px-3.5 py-2">
        <span className="metal-cta h-3.5 w-7 rounded-full" />
        <span className="h-3.5 w-10 rounded-full border border-line bg-surface" />
        <span className="h-3.5 w-8 rounded-full border border-line bg-surface" />
        <span className="h-3.5 w-11 rounded-full border border-line bg-surface" />
      </div>

      {/* Mini product grid — flat cards; the shine lives on the CTAs only. */}
      <div className="bg-bg px-3.5 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-line bg-surface p-2"
            >
              <div className="h-10 rounded-md bg-surface-alt" />
              <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-surface-alt" />
              <div className="mt-2 flex items-center justify-between">
                <span className="h-1.5 w-6 rounded-full bg-brand" />
                <span className="metal-cta h-4 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Real, labeled CTA — the place to check the button text color
            actually reads against the button. Same classes as the live
            storefront's Add to Cart / Place Order. */}
        <div className="mt-3 flex justify-center">
          <span className="metal-cta inline-flex h-8 items-center rounded-md px-4 text-xs font-bold text-cta-contrast">
            Add to Cart
          </span>
        </div>
      </div>
    </div>
  )
}

/** Mirror of the storefront's Auto rule: white on dark, near-black on light. */
function autoButtonText(primary: string): string {
  const match = primary.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!match) return '#ffffff'
  const r = parseInt(match.slice(0, 2), 16)
  const g = parseInt(match.slice(2, 4), 16)
  const b = parseInt(match.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? '#ffffff' : '#101010'
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const HEX_SHORT = /^#[0-9a-fA-F]{3}$/

function ColorField({
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
      <span className="mb-2 block text-sm font-medium text-muted">
        {label}
      </span>
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
    const text = raw.trim().startsWith('#') || raw.trim() === ''
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
function AutoColorField({
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
