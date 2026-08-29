import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreTheme } from '../../features/stores/storesApi'
import { themeTemplatesApi } from '../../features/stores/themeTemplatesApi'
import type { StoreThemeTemplate } from '../../features/stores/themeTemplatesApi'
import { useStore } from '../../features/stores/useStores'
import { usePageTitle } from '../../../shared/usePageTitle'
import { ThemePreview } from './ThemePreview'
import { findActiveTemplate, ThemeTemplateStrip } from './ThemeTemplateStrip'
import type { ThemeNavState } from './ThemeTemplateStrip'
import { ArrowLeftIcon } from '../../layout/icons'

/**
 * `/stores/{slug}/appearance/preview` — the theme preview at full width.
 *
 * It sits OUTSIDE `StoreManageLayout` on purpose. Inside the management
 * workbench the preview shares the row with a 260px section nav and two sets
 * of panel padding, which on a 1024px laptop leaves it barely 648px — narrower
 * than the same preview gets on a 768px tablet, where the nav has stacked. As
 * its own route it keeps the whole window, so the seller finally judges the
 * palette at something close to the size a shopper will see.
 *
 * The picker travels with it: switching template here re-paints the preview
 * immediately and Save writes it, so choosing a look never means bouncing
 * between two screens. Colors stay on the Appearance section — that is a form,
 * and a form is perfectly happy in a panel — so **Customize** hands the draft
 * back there rather than duplicating five color fields.
 *
 * **Unsaved work survives the trip in both directions.** Appearance links here
 * with its draft in router state and this page seeds from it, so opening the
 * full preview mid-edit shows what you were editing rather than the last saved
 * palette; Customize sends the draft back the same way.
 */

export function StoreThemePreviewPage() {
  const { storeSlug } = useParams()
  const { store } = useStore(storeSlug)
  const navigate = useNavigate()
  const location = useLocation()
  const handoff = (location.state as ThemeNavState | null)?.theme

  const [theme, setTheme] = useState<StoreTheme | null>(handoff ?? null)
  const [templates, setTemplates] = useState<StoreThemeTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // Variadic: parts join with " · " and the app name is appended.
  usePageTitle('Theme preview', store?.name)

  useEffect(() => {
    let cancelled = false
    themeTemplatesApi
      .list()
      .then((rows) => !cancelled && setTemplates(rows))
      .catch(() => !cancelled && setTemplates([]))
    return () => {
      cancelled = true
    }
  }, [])

  // Seed from the store once it lands — unless Appearance handed us a draft,
  // which is newer than anything the server knows about.
  useEffect(() => {
    if (store && theme === null) setTheme(store.theme)
  }, [store, theme])

  if (store === undefined || theme === null) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading…
      </div>
    )
  }
  if (store === null) return <Navigate to="/stores" replace />

  const appearanceUrl = `/stores/${storeSlug}/appearance`
  const dirty = JSON.stringify(theme) !== JSON.stringify(store.theme)
  const activeTemplate = findActiveTemplate(templates, theme)

  const save = async () => {
    setError(null)
    setBusy(true)
    try {
      const updated = await storesApi.updateTheme(store.id, theme)
      setTheme(updated.theme)
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Chrome + picker stay put while the preview scrolls under them: the
          preview is a whole page tall, and having to scroll back up to try
          the next template is the thing that makes a picker tiring. */}
      <div className="sticky top-14 z-10 space-y-3 bg-bg pb-3 pt-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            to={appearanceUrl}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Appearance
          </Link>

          <div className="min-w-0">
            <h1 className="truncate font-body text-base font-semibold tracking-normal text-fg">
              Theme preview
            </h1>
            <p className="truncate text-xs text-muted">
              {activeTemplate
                ? `Using ${activeTemplate.name}`
                : theme.themeName
                  ? `Using your theme "${theme.themeName}"`
                  : 'Using your own colors'}
              {dirty && ' · unsaved'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {error && <span className="text-xs text-danger">{error}</span>}
            {saved && !dirty && (
              <span className="text-xs font-medium text-success">Saved.</span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
            >
              {busy ? 'Saving…' : 'Save Appearance'}
            </button>
          </div>
        </div>

        <ThemeTemplateStrip
          templates={templates}
          savedTheme={store.theme}
          theme={theme}
          onSelect={(next) => {
            setTheme(next)
            setSaved(false)
          }}
          // Colors live on the Appearance form; carry the draft back to it.
          onCustomize={() =>
            navigate(appearanceUrl, {
              state: { theme, customize: true } satisfies ThemeNavState,
            })
          }
          emptyHint="No templates are available right now — set your colors on the Appearance section."
        />
      </div>

      <ThemePreview
        theme={theme}
        storeName={store.name}
        logoUrl={store.logoUrl}
      />

      <p className="pb-2 text-xs text-muted">
        A sample shop in your colors — the same layout for every store, so
        templates differ here by color alone.
      </p>
    </div>
  )
}
