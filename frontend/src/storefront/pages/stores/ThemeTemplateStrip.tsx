import { sameColors, themeColors } from '../../features/stores/storesApi'
import type {
  StoreTheme,
  StoreThemeColors,
} from '../../features/stores/storesApi'
import type { StoreThemeTemplate } from '../../features/stores/themeTemplatesApi'
import { storeVars, SKIN } from '../../features/publicStore/storeTheme'
import { CheckIcon } from '../../layout/icons'

/**
 * The horizontal template picker, shared by the Appearance section and the
 * full-screen preview page so the two can never drift apart — the same cards,
 * the same selection rule, the same "your colors" behaviour in both places.
 *
 * Each card is a miniature storefront drawn with `storeVars` + the `SKIN`
 * fragments, exactly like the big preview, so a swatch never promises a look
 * the page won't deliver.
 */

/**
 * The template a palette is sitting on, unedited.
 *
 * Matched on the recorded `templateId` first, then on the colors alone: a
 * store can be on a template's palette without carrying the breadcrumb — it
 * predates templates, or its colors were what the starter set was built from.
 * The colors are what the seller sees, so they decide which card reads as
 * selected.
 */
export function findActiveTemplate(
  templates: StoreThemeTemplate[] | null,
  theme: StoreTheme,
): StoreThemeTemplate | null {
  const list = templates ?? []
  return (
    list.find((t) => t.id === theme.templateId && sameColors(theme, t.theme)) ??
    list.find((t) => sameColors(theme, t.theme)) ??
    null
  )
}

/**
 * Router state the Appearance section and the full-screen preview hand each
 * other, so an unsaved draft survives the trip in either direction.
 */
export interface ThemeNavState {
  theme?: StoreTheme
  /** Set when the preview sends the seller back to edit colors. */
  customize?: boolean
}

/** Applying a template is a COPY — the template itself is never touched. */
export function themeFromTemplate(template: StoreThemeTemplate): StoreTheme {
  return {
    ...themeColors(template.theme),
    templateId: template.id,
    themeName: null,
  }
}

export function ThemeTemplateStrip({
  templates,
  savedTheme,
  theme,
  onSelect,
  onCustomize,
  emptyHint,
}: {
  /** `null` while loading. An empty array is a legitimate state. */
  templates: StoreThemeTemplate[] | null
  /** The store's persisted palette — offered as its own card when custom. */
  savedTheme: StoreTheme
  /** The palette currently being previewed. */
  theme: StoreTheme
  onSelect: (theme: StoreTheme) => void
  /** Omitted → no Customize button on the selected card. */
  onCustomize?: () => void
  emptyHint: string
}) {
  const activeTemplate = findActiveTemplate(templates, theme)

  /**
   * Offer the saved palette as its own card whenever it isn't one of the
   * templates — otherwise trying templates out would quietly discard the
   * colors the seller already chose, with no way back short of a reload.
   */
  const savedIsCustom =
    templates !== null && !templates.some((t) => sameColors(savedTheme, t.theme))

  if (templates === null) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-44 w-52 shrink-0 animate-pulse rounded-lg bg-surface-alt"
          />
        ))}
      </div>
    )
  }

  if (templates.length === 0 && !savedIsCustom) {
    return <p className="text-sm text-muted">{emptyHint}</p>
  }

  return (
    // No negative margin: an earlier `-mx-1` pulled the row's edges into the
    // panel's own gutter, so it sat visibly wider than every other block. It
    // only existed to stop the selected card's 1px ring being clipped by
    // `overflow-x-auto`; `ring-inset` solves that at the source.
    <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
      {savedIsCustom && (
        <TemplateCard
          name={savedTheme.themeName ?? 'Your colors'}
          description="The palette this store is saved with."
          colors={savedTheme}
          selected={sameColors(theme, savedTheme)}
          onSelect={() => onSelect(savedTheme)}
          onCustomize={onCustomize}
        />
      )}
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          name={template.name}
          description={template.description}
          colors={template.theme}
          selected={activeTemplate?.id === template.id}
          onSelect={() => onSelect(themeFromTemplate(template))}
          onCustomize={onCustomize}
        />
      ))}
    </ul>
  )
}

function TemplateCard({
  name,
  description,
  colors,
  selected,
  onSelect,
  onCustomize,
}: {
  name: string
  description: string | null
  colors: StoreThemeColors
  selected: boolean
  onSelect: () => void
  onCustomize?: () => void
}) {
  return (
    <li className="w-52 shrink-0 snap-start">
      <div
        className={`flex h-full flex-col overflow-hidden rounded-lg border transition-colors ${
          selected
            ? 'border-brand ring-1 ring-inset ring-brand'
            : 'border-line hover:border-fg/30'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="block w-full text-left"
        >
          {/* Miniature storefront in the template's palette. */}
          <span className="block bg-bg p-2.5" style={storeVars(colors)}>
            <span className="flex items-center gap-1.5">
              <span className={`h-4 w-4 rounded ${SKIN.cta}`} />
              <span className={`h-1.5 w-12 rounded-full ${SKIN.well}`} />
              <span
                className={`ml-auto h-4 w-4 rounded-full border ${SKIN.border} ${SKIN.chip}`}
              />
            </span>
            <span
              className={`mt-2 flex gap-1.5 rounded-md border p-1.5 ${SKIN.border} ${SKIN.surface}`}
            >
              <span className={`h-9 w-9 shrink-0 rounded ${SKIN.well}`} />
              <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <span className={`h-1.5 w-full rounded-full ${SKIN.well}`} />
                <span className="text-[9px] font-bold text-brand">₹1,299</span>
              </span>
            </span>
            <span
              className={`mt-2 flex h-6 items-center justify-center rounded text-[9px] font-bold ${SKIN.cta}`}
            >
              Add to Cart
            </span>
          </span>

          <span className="block border-t border-line p-2.5">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                {name}
              </span>
              {selected && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast">
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              )}
            </span>
            {description && (
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted">
                {description}
              </span>
            )}
          </span>
        </button>

        {selected && onCustomize && (
          <button
            type="button"
            onClick={onCustomize}
            className="mt-auto border-t border-line px-2.5 py-2 text-xs font-semibold text-brand transition-colors hover:bg-brand-soft"
          >
            Customize
          </button>
        )}
      </div>
    </li>
  )
}
