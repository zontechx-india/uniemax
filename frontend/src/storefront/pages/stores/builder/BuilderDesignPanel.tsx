import { useEffect, useState } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote } from '../../../../shared/ui/form'
import type { Store, StoreTheme } from '../../../features/stores/storesApi'
import { themeTemplatesApi } from '../../../features/stores/themeTemplatesApi'
import type { StoreThemeTemplate } from '../../../features/stores/themeTemplatesApi'
import { PaletteIcon } from '../../../layout/icons'
import { ThemeColorGrid } from '../ThemeColorFields'
import { findActiveTemplate, ThemeTemplateStrip } from '../ThemeTemplateStrip'

/**
 * Design — the store's colours, and nothing else.
 *
 * It is called **Color Theme**, not "Template", because colour is genuinely
 * all a theme changes today: the layouts, the type scale, the card proportions
 * and the spacing are the platform's, identical in every shop, and naming this
 * "Template" would promise a seller a choice they do not have. The *shape* of
 * their storefront is chosen in Sections, one row at a time.
 *
 * Picking a theme is one click and needs no explanation; the five colour
 * pickers are folded away behind **Customize colours**, because a seller who
 * opens this panel has an opinion about "which of these suits my shop" and
 * none at all about what hex value a surface should be.
 *
 * Unlike the rest of the builder this panel does **not** autosave. Colour is
 * the one change that can make a shop unreadable, so it is previewed live
 * (the frame paints the draft as it is edited) and committed deliberately.
 */
export function BuilderDesignPanel({
  store,
  theme,
  onThemeChange,
  onSave,
  onDiscard,
  dirty,
  busy,
  error,
}: {
  store: Store
  /** The DRAFT palette — what the preview is painting. */
  theme: StoreTheme
  onThemeChange: (theme: StoreTheme) => void
  onSave: () => void
  onDiscard: () => void
  dirty: boolean
  busy: boolean
  error: string | null
}) {
  const [templates, setTemplates] = useState<StoreThemeTemplate[] | null>(null)
  const [customizing, setCustomizing] = useState(false)

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

  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) =>
    onThemeChange({ ...theme, [key]: value })

  const startCustomizing = () => {
    onThemeChange({
      ...theme,
      // A custom theme always carries a name; seed it from the template the
      // seller started out from so the field is never an empty demand.
      themeName: theme.themeName ?? `My ${activeTemplate?.name ?? store.name}`,
    })
    setCustomizing(true)
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">Color theme</h3>
          <span className="text-xs text-muted">
            {activeTemplate
              ? `Using ${activeTemplate.name}`
              : theme.themeName
                ? `Using "${theme.themeName}"`
                : 'Using your own colors'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Pick one and your whole shop re-colours — buttons, prices, links and
          panels all follow.
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
            onCustomize={startCustomizing}
            emptyHint="No ready-made themes are available right now — set your colors below."
          />
        </div>
      </section>

      {customizing ? (
        <section className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">Your colors</h3>
              <p className="mt-0.5 text-xs text-muted">
                Saved to this store only — the ready-made themes stay as they
                are.
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
              Name this theme
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
              Only you see this — it names the palette in this panel.
            </span>
          </label>

          <div className="mt-5">
            <ThemeColorGrid theme={theme} onChange={set} />
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

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Sticky so the commit is reachable however far the colour grid has
          scrolled — the one place in the builder with a save to press. */}
      {dirty && (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 sm:-mx-5 sm:px-5">
          <span className="min-w-0 flex-1 text-xs font-medium text-muted">
            You have unsaved colors. The preview is showing them.
          </span>
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-alt disabled:opacity-50"
          >
            Discard
          </button>
          <Button variant="rise" size="sm" onClick={onSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save colors'}
          </Button>
        </div>
      )}
    </div>
  )
}
