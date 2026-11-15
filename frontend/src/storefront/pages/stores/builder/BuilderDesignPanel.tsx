import { useEffect, useState } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote, SuccessNote } from '../../../../shared/ui/form'
import { sameColors } from '../../../features/stores/storesApi'
import type { Store, StoreTheme } from '../../../features/stores/storesApi'
import { themeTemplatesApi } from '../../../features/stores/themeTemplatesApi'
import type { StoreThemeTemplate } from '../../../features/stores/themeTemplatesApi'
import { themeReadabilityProblems } from '../../../features/publicStore/storeTheme'
import { CheckIcon, ChevronDownIcon, PaletteIcon } from '../../../layout/icons'
import { ThemeColorGrid } from '../ThemeColorFields'
import { findActiveTemplate, ThemeTemplateStrip } from '../ThemeTemplateStrip'

/**
 * Design — the store's colours, and nothing else.
 *
 * It is about colour, not "Template", because colour is genuinely all a theme
 * changes today: the layouts, the type scale, the card proportions and the
 * spacing are the platform's, identical in every shop. The *shape* of the
 * storefront is chosen in Sections, one row at a time.
 *
 * Picking a ready theme is one tap. "Choose my own colour" offers a row of
 * brand-colour swatches — one decision, everything else worked out — and the
 * five hex pickers sit behind **Advanced**, because a seller who opens this
 * panel has an opinion about "which colour suits my shop" and none at all
 * about what hex value a surface should be.
 *
 * Unlike the rest of the builder this panel does **not** autosave: colour is
 * the one change that can make a shop unreadable, so it is previewed first and
 * committed with one clear button, "Use this look for my shop". That button
 * stays on screen (fixed to the bottom on a phone, where the panel scrolls
 * with the page and a sticky bar ended up below the fold), and a palette that
 * would make text unreadable cannot be saved at all.
 */

/** Brand colours offered as one-tap swatches. All pass white-text contrast. */
const BRAND_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#d32f2f' },
  { name: 'Orange', hex: '#e65100' },
  { name: 'Amber', hex: '#b26a00' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Teal', hex: '#00796b' },
  { name: 'Blue', hex: '#1565c0' },
  { name: 'Indigo', hex: '#3949ab' },
  { name: 'Purple', hex: '#6a1b9a' },
  { name: 'Pink', hex: '#c2185b' },
  { name: 'Brown', hex: '#6d4c41' },
  { name: 'Grey', hex: '#455a64' },
  { name: 'Black', hex: '#212121' },
]

export function BuilderDesignPanel({
  store,
  theme,
  onThemeChange,
  onSave,
  onDiscard,
  dirty,
  busy,
  error,
  savedName,
}: {
  store: Store
  /** The DRAFT palette — what the preview is painting. */
  theme: StoreTheme
  onThemeChange: (theme: StoreTheme) => void
  /** Gets the name of the look being saved, for the success message. */
  onSave: (lookName: string) => void
  onDiscard: () => void
  dirty: boolean
  busy: boolean
  error: string | null
  /** Set right after a save: the look the shop now uses. */
  savedName: string | null
}) {
  const [templates, setTemplates] = useState<StoreThemeTemplate[] | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    let cancelled = false
    themeTemplatesApi
      .list()
      // An empty list is a legitimate state (the platform disabled them all):
      // the panel then falls back to being the plain colour editor.
      .then((rows) => !cancelled && setTemplates(rows))
      .catch(() => !cancelled && setTemplates([]))
    return () => {
      cancelled = true
    }
  }, [])

  const activeTemplate = findActiveTemplate(templates, theme)
  const lookName = activeTemplate?.name ?? theme.themeName ?? 'your own colours'
  const problems = themeReadabilityProblems(theme)

  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) =>
    onThemeChange({ ...theme, [key]: value })

  /** One brand colour drives the buttons AND the accents; the rest is Auto. */
  const pickBrand = (hex: string) =>
    onThemeChange({
      ...theme,
      primaryColor: hex,
      secondaryColor: null,
      buttonTextColor: null,
    })

  return (
    // Room at the bottom on a phone so the fixed save bar never covers the
    // last control.
    <div className={`space-y-5 ${dirty ? 'pb-36 lg:pb-0' : ''}`}>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">Shop colours</h3>
          <span className="text-xs text-muted">
            {dirty ? `Trying ${lookName}` : `Your shop uses ${lookName}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Tap a look to try it. Your shop changes only when you tap{' '}
          <span className="font-semibold text-fg">Use this look for my shop</span>.
        </p>

        <div className="mt-3">
          <ThemeTemplateStrip
            templates={templates}
            savedTheme={store.theme}
            theme={theme}
            onSelect={(next) => {
              onThemeChange(next)
              setCustomizing(false)
            }}
            onCustomize={() => setCustomizing(true)}
            emptyHint="No ready-made looks are available right now — choose your own colour below."
          />
        </div>
      </section>

      {savedName && !dirty && (
        <SuccessNote>
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="h-4 w-4" />
            Your shop now uses {savedName}.
          </span>
        </SuccessNote>
      )}

      {customizing ? (
        <section className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">Pick your brand colour</h3>
              <p className="mt-0.5 text-xs text-muted">
                Used for your buttons, prices and links. The other colours are
                worked out for you.
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

          <ul className="mt-4 grid grid-cols-6 gap-2">
            {BRAND_SWATCHES.map((swatch) => {
              const selected =
                theme.primaryColor.toLowerCase() === swatch.hex &&
                theme.secondaryColor === null
              return (
                <li key={swatch.hex}>
                  <button
                    type="button"
                    onClick={() => pickBrand(swatch.hex)}
                    aria-pressed={selected}
                    aria-label={swatch.name}
                    title={swatch.name}
                    className={`flex aspect-square w-full items-center justify-center rounded-lg text-white transition ${
                      selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'hover:opacity-85'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {selected && <CheckIcon className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            onClick={() => setAdvanced((open) => !open)}
            aria-expanded={advanced}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg"
          >
            Advanced colours
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${advanced ? 'rotate-180' : ''}`}
            />
          </button>
          {advanced && (
            <div className="mt-4">
              <ThemeColorGrid theme={theme} onChange={set} />
            </div>
          )}
        </section>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setCustomizing(true)}
        >
          <PaletteIcon className="h-4 w-4" />
          Choose my own colour
        </Button>
      )}

      {problems.length > 0 && (
        <ErrorNote>
          {problems.map((problem) => (
            <span key={problem} className="block">
              {problem}
            </span>
          ))}
        </ErrorNote>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {dirty && (
        // Fixed to the bottom of the screen on a phone (the panel scrolls with
        // the page there, so `sticky` left it at the very bottom edge, mostly
        // hidden); sticky inside the panel's own scroll on a wide screen.
        <div className="ws-bar fixed inset-x-3 bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-lg p-2.5 lg:sticky lg:inset-x-auto">
          <span className="min-w-0 flex-1 basis-40 text-hint font-medium text-fg">
            {problems.length > 0
              ? 'Fix the colours above before saving.'
              : `You are trying ${lookName}. Your shop has not changed yet.`}
          </span>
          <Button
            variant="secondary"
            onClick={onDiscard}
            disabled={busy}
            className="shrink-0"
          >
            Undo
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onSave(lookName)}
            disabled={busy || problems.length > 0}
          >
            {busy ? 'Saving…' : 'Use this look for my shop'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Has the seller really changed the colours? (Name and provenance aside.) */
export function themeChanged(draft: StoreTheme, saved: StoreTheme): boolean {
  return !sameColors(draft, saved)
}
