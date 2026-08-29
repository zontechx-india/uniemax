import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, SuccessNote } from '../../../shared/ui/form'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreTheme } from '../../features/stores/storesApi'
import { themeTemplatesApi } from '../../features/stores/themeTemplatesApi'
import type { StoreThemeTemplate } from '../../features/stores/themeTemplatesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ThemePreview } from './ThemePreview'
import { findActiveTemplate, ThemeTemplateStrip } from './ThemeTemplateStrip'
import type { ThemeNavState } from './ThemeTemplateStrip'
import { EyeIcon, PaletteIcon } from '../../layout/icons'

/**
 * Appearance — pick a look, then (optionally) make it yours.
 *
 * The section leads with the platform's **templates** rather than five color
 * pickers, because a seller opening this page for the first time has an
 * opinion about "which of these looks right for my shop" and none at all
 * about what hex value a surface should be. One click applies a whole
 * palette; **Customize** then opens the same per-color editor for anyone who
 * wants it, saved under a name of their own.
 *
 * Nothing here writes to a template: applying one COPIES its five colors onto
 * the store (`theme.templateId` records where they came from), so a seller's
 * edits stay in their store and a later change to the template leaves every
 * storefront exactly as it is.
 *
 * The inline preview is deliberately compact — it fits the panel and gives
 * immediate feedback while picking colors. **Open full preview** hands the
 * current draft to `/stores/{slug}/appearance/preview`, which renders the same
 * sample shop across the whole window with no section nav stealing 260px.
 *
 * The preview below is one sample shop, identical for every seller — see
 * `ThemePreview`. It is deliberately not this store's own page: the palette is
 * then the only thing that differs between two templates, which is what makes
 * them comparable, and nothing has to be fetched to show one.
 */
export function StoreAppearancePage() {
  const { store, onStoreChange } = useManagedStore()
  const { storeSlug } = useParams()
  const location = useLocation()
  // The full-screen preview hands its draft back here (and asks for the color
  // editor when the seller pressed Customize there). Read once, on mount:
  // arriving from that page is a fresh mount of this one.
  const handoff = location.state as ThemeNavState | null

  const [theme, setTheme] = useState<StoreTheme>(handoff?.theme ?? store.theme)
  const [templates, setTemplates] = useState<StoreThemeTemplate[] | null>(null)
  const [customizing, setCustomizing] = useState(Boolean(handoff?.customize))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    themeTemplatesApi
      .list()
      // An empty list is a legitimate state (the platform disabled them all):
      // the page then falls back to being the plain color editor it was.
      .then((rows) => !cancelled && setTemplates(rows))
      .catch(() => !cancelled && setTemplates([]))
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = JSON.stringify(theme) !== JSON.stringify(store.theme)

  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => {
    setTheme((t) => ({ ...t, [key]: value }))
    setSaved(false)
  }

  const activeTemplate = findActiveTemplate(templates, theme)

  const selectTheme = (next: StoreTheme) => {
    setTheme(next)
    setCustomizing(false)
    setSaved(false)
  }

  const startCustomizing = () => {
    setTheme((t) => ({
      ...t,
      // A custom theme always carries a name; seed it from the template the
      // seller started out from so the field is never an empty demand.
      themeName: t.themeName ?? `My ${activeTemplate?.name ?? store.name}`,
    }))
    setCustomizing(true)
    setSaved(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const updated = await storesApi.updateTheme(store.id, theme)
      onStoreChange(updated)
      setTheme(updated.theme)
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
        Pick a ready-made look for your store, then customize it if you want to.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-6" noValidate>
        {/* ---- Templates ------------------------------------------------ */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">Templates</h3>
            <span className="text-xs text-muted">
              {activeTemplate
                ? `Using ${activeTemplate.name}`
                : theme.themeName
                  ? `Using your theme "${theme.themeName}"`
                  : 'Using your own colors'}
            </span>
          </div>

          <div className="mt-3">
            <ThemeTemplateStrip
              templates={templates}
              savedTheme={store.theme}
              theme={theme}
              onSelect={selectTheme}
              onCustomize={startCustomizing}
              emptyHint="No templates are available right now — set your colors below."
            />
          </div>
        </section>

        {/* ---- Customize ------------------------------------------------ */}
        {customizing ? (
          <section className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-fg">
                  Customize your theme
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Your changes are saved to this store only — the template stays
                  as it is.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Done
              </button>
            </div>

            <label className="mt-4 block max-w-sm">
              <span className="mb-2 block text-sm font-medium text-muted">
                Theme name
              </span>
              <input
                type="text"
                value={theme.themeName ?? ''}
                onChange={(e) => set('themeName', e.target.value || null)}
                maxLength={60}
                placeholder="My store theme"
                className="h-11 w-full rounded-md border border-line bg-transparent px-3 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
              <span className="mt-1.5 block text-xs text-muted">
                Only you see this — it names the palette in this section.
              </span>
            </label>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
                hint="Text on your buttons (Add to Cart, Place Order). Check the button in the preview stays readable."
                autoLabel="white or black, based on your primary color"
                value={theme.buttonTextColor}
                customizeSeed={autoButtonText(theme.primaryColor)}
                onChange={(v) => set('buttonTextColor', v)}
              />
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={startCustomizing}
            className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-brand"
          >
            <PaletteIcon className="h-4 w-4" />
            Customize colors
          </button>
        )}

        {/* ---- Preview -------------------------------------------------- */}
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted">Preview</span>
            {/* Carries the DRAFT, so opening the big preview mid-edit shows
                what you were editing rather than the last saved palette. */}
            <Link
              to={`/stores/${storeSlug}/appearance/preview`}
              state={{ theme } satisfies ThemeNavState}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-brand"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Open full preview
            </Link>
          </div>
          <ThemePreview
            theme={theme}
            storeName={store.name}
            logoUrl={store.logoUrl}
          />
          <span className="mt-1.5 block text-xs text-muted">
            A sample shop in your colors — the same layout for every store, so
            templates differ here by color alone. Open the full preview to see
            it across the whole window.
          </span>
        </section>

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
