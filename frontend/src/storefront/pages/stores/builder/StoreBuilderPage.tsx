import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { usePageTitle } from '../../../../shared/usePageTitle'
import { storesApi } from '../../../features/stores/storesApi'
import type {
  HomepageSection,
  HomepageSectionKey,
  HomepageSectionSettings,
  Store,
  StoreTheme,
} from '../../../features/stores/storesApi'
import { useStoreManageScope } from '../../../features/stores/storeManageScope'
import { ManagedStoreProvider } from '../../../features/stores/useManagedStore'
import { useStore } from '../../../features/stores/useStores'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PaletteIcon,
  PanelLeftIcon,
} from '../../../layout/icons'
import { StoreBannersPage } from '../StoreBannersPage'
import { StoreFooterPage } from '../StoreFooterPage'
import { BuilderDesignPanel } from './BuilderDesignPanel'
import { BuilderHeader } from './BuilderHeader'
import type { SaveState } from './BuilderHeader'
import { BuilderPreview } from './BuilderPreview'
import type { PreviewDevice } from './BuilderPreview'
import { BuilderSectionEditor } from './BuilderSectionEditor'
import { BuilderSectionList } from './BuilderSectionList'
import type { BuilderTarget } from './BuilderSectionList'
import { BUILDER_SECTIONS } from './builderSections'

/**
 * **Store Builder** — one workspace for everything a seller's storefront looks
 * like.
 *
 * It replaces four separate screens (Appearance, Homepage, Banners, Footer)
 * that between them described a single thing: the shop. Splitting them made
 * the seller learn the platform's filing system before they could change a
 * heading, and none of the four could show them the result. Here the controls
 * are on the left, the actual storefront is on the right, and the two are the
 * same shop.
 *
 * ## How it saves
 *
 * Structure — order, on/off, per-section settings — **saves itself**. Each
 * change replaces the whole ordered list (the API takes nothing less), so a
 * reorder, a toggle and a renamed heading are all the same write. Typing is
 * debounced; a click is not. The header reports the state, and a failed write
 * rolls the panel back to the server's answer rather than leaving the seller
 * looking at something that is not true.
 *
 * Colours are the exception and are saved on purpose, from the Design panel —
 * see `BuilderDesignPanel`.
 *
 * ## How the preview stays honest
 *
 * The right-hand frame is `/store/{slug}` itself. After every successful save
 * it is told to refetch, so it repaints in place. While colours are being
 * edited the draft palette is posted into it, so it paints what is not saved
 * yet — and clicking any section inside the frame opens that section's editor,
 * which is the shortest path there is between "I don't like that bit" and
 * changing it.
 */

/** How long typing settles before a settings write goes out. */
const TYPING_DEBOUNCE_MS = 600

/** How long "Saved" stays on screen before the header goes quiet again. */
const SAVED_NOTICE_MS = 2500

export function StoreBuilderPage() {
  const { storeSlug } = useParams()
  const { store, setStore } = useStore(storeSlug)
  const scope = useStoreManageScope()

  if (store === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted">
        Loading…
      </div>
    )
  }
  // Unknown or foreign store — back to the list it would have been opened from.
  if (store === null) return <Navigate to={scope.indexPath} replace />

  return (
    // Keyed on the store so switching shops re-mounts the whole workspace
    // rather than carrying one store's draft into another's.
    <Builder key={store.id} store={store} onStoreChange={setStore} />
  )
}

function Builder({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const scope = useStoreManageScope()
  const storePath = scope.storePath(store.slug)
  usePageTitle(`Store Builder · ${store.name}`)

  const [sections, setSections] = useState<HomepageSection[]>(store.homepage)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const [tab, setTab] = useState<'sections' | 'design'>('sections')
  const [target, setTarget] = useState<BuilderTarget | null>(null)
  // Survives closing the editor, so coming back to the list still shows which
  // row you were just in — otherwise a seller loses their place every time.
  const [lastTarget, setLastTarget] = useState<BuilderTarget | null>(null)
  // A seller on a phone is previewing a phone; defaulting to the desktop
  // frame would hand them a 1440px shop scaled to a quarter size.
  const [device, setDevice] = useState<PreviewDevice>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024
      ? 'mobile'
      : 'desktop',
  )
  // Below `lg` the panel and the preview cannot share a row, so they share a
  // switch instead — never a two-column desktop layout squeezed onto a phone.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')

  // Bumped after every successful write; the preview frame refetches on it.
  const [previewToken, setPreviewToken] = useState(0)
  const refreshPreview = useCallback(() => setPreviewToken((n) => n + 1), [])

  // --- colours -------------------------------------------------------------
  const [theme, setTheme] = useState<StoreTheme>(store.theme)
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeError, setThemeError] = useState<string | null>(null)
  const themeDirty = useMemo(
    () => JSON.stringify(theme) !== JSON.stringify(store.theme),
    [theme, store.theme],
  )

  const saveTheme = async () => {
    setThemeError(null)
    setThemeBusy(true)
    try {
      const updated = await storesApi.updateTheme(store.id, theme)
      onStoreChange(updated)
      setTheme(updated.theme)
      refreshPreview()
    } catch (err) {
      setThemeError(toApiError(err).message)
    } finally {
      setThemeBusy(false)
    }
  }

  // --- structure, saved as it changes --------------------------------------
  const pending = useRef<number | undefined>(undefined)
  const savedNotice = useRef<number | undefined>(undefined)
  const inFlight = useRef<HomepageSection[] | null>(null)

  /**
   * Whatever a debounced write was about to send. On unmount it is sent
   * immediately rather than dropped — a seller who types a heading and closes
   * the builder within the debounce window must not lose it, and "we saved
   * everything as you went" has to be true even on the last keystroke.
   */
  const queued = useRef<HomepageSection[] | null>(null)
  const storeId = store.id

  useEffect(
    () => () => {
      window.clearTimeout(savedNotice.current)
      if (pending.current !== undefined) {
        window.clearTimeout(pending.current)
        const last = queued.current
        // Fire and forget: the component is going away, so there is no state
        // left to report into — but the write still has to happen.
        if (last) void storesApi.updateHomepage(storeId, last).catch(() => {})
      }
    },
    [storeId],
  )

  /**
   * Persist the whole ordered list. Optimistic, because a switch that waits
   * for a round-trip feels broken — and rolled back to the server's answer if
   * the write fails, because a panel that disagrees with the shop is worse
   * than a slow one.
   */
  const push = useCallback(
    async (next: HomepageSection[]) => {
      const previous = inFlight.current ?? store.homepage
      inFlight.current = next
      setSaveError(null)
      setSaveState('saving')
      try {
        const updated = await storesApi.updateHomepage(store.id, next)
        onStoreChange(updated)
        setSections(updated.homepage)
        inFlight.current = updated.homepage
        refreshPreview()
        setSaveState('saved')
        window.clearTimeout(savedNotice.current)
        savedNotice.current = window.setTimeout(
          () => setSaveState('idle'),
          SAVED_NOTICE_MS,
        )
      } catch (err) {
        setSections(previous)
        inFlight.current = previous
        setSaveError(toApiError(err).message)
        setSaveState('error')
      }
    },
    [store.id, store.homepage, onStoreChange, refreshPreview],
  )

  /**
   * `debounce` is for typing only. A click — a toggle, a drag, a layout choice
   * — is a finished decision and goes out immediately; waiting on it would
   * just delay the preview for no reason.
   */
  const commit = useCallback(
    (next: HomepageSection[], { debounce = false } = {}) => {
      setSections(next)
      window.clearTimeout(pending.current)
      if (!debounce) {
        pending.current = undefined
        queued.current = null
        void push(next)
        return
      }
      setSaveState('saving')
      queued.current = next
      pending.current = window.setTimeout(() => {
        pending.current = undefined
        queued.current = null
        void push(next)
      }, TYPING_DEBOUNCE_MS)
    },
    [push],
  )

  const toggle = (key: HomepageSectionKey, enabled: boolean) =>
    commit(sections.map((s) => (s.key === key ? { ...s, enabled } : s)))

  const changeSettings = (
    key: HomepageSectionKey,
    settings: HomepageSectionSettings,
  ) =>
    commit(
      sections.map((section) => {
        if (section.key !== key) return section
        // Drop blank values here as well as on the server, so the row the
        // panel holds matches the row that comes back and "reset" really does
        // leave nothing behind.
        const cleaned = Object.fromEntries(
          Object.entries(settings).filter(([, value]) => value),
        ) as HomepageSectionSettings
        return Object.keys(cleaned).length > 0
          ? { key: section.key, enabled: section.enabled, settings: cleaned }
          : { key: section.key, enabled: section.enabled }
      }),
      { debounce: true },
    )

  // --- what the right-hand panel is editing --------------------------------
  const activeSection =
    target && target !== 'header' && target !== 'footer'
      ? (sections.find((s) => s.key === target) ?? null)
      : null

  const openTarget = (next: BuilderTarget) => {
    setTab('sections')
    setTarget(next)
    setLastTarget(next)
    setMobileView('edit')
  }

  /** Context for the two editors that are whole screens of their own. */
  const managed = useMemo(
    () => ({
      store,
      onStoreChange: (next: Store) => {
        onStoreChange(next)
        refreshPreview()
      },
      dashboard: null,
      dashboardError: null,
      refreshDashboard: () => {},
    }),
    [store, onStoreChange, refreshPreview],
  )

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      {/* Two tabs, because there are exactly two kinds of decision here: what
          the shop is made of, and what colour it is. */}
      {target === null && (
        <div className="shrink-0 border-b border-line px-3 pt-3 sm:px-4">
          <div className="flex gap-1">
            <PanelTab
              active={tab === 'sections'}
              icon={PanelLeftIcon}
              label="Sections"
              onClick={() => setTab('sections')}
            />
            <PanelTab
              active={tab === 'design'}
              icon={PaletteIcon}
              label="Design"
              onClick={() => setTab('design')}
            />
          </div>
        </div>
      )}

      {target !== null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2.5 sm:px-3">
          <button
            type="button"
            onClick={() => setTarget(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="sr-only">Back to sections</span>
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {target === 'header'
              ? 'Store header'
              : target === 'footer'
                ? 'Footer'
                : BUILDER_SECTIONS[target].label}
          </h2>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {target === null && tab === 'sections' && (
          <>
            <BuilderSectionList
              sections={sections}
              activeKey={lastTarget}
              busy={false}
              onSelect={openTarget}
              onToggle={toggle}
              onReorder={(next) => commit(next)}
            />
            <p className="mt-4 text-xs text-muted">
              A section appears in your shop when it is switched on and has
              something to show. Everything here saves as you change it.
            </p>
          </>
        )}

        {target === null && tab === 'design' && (
          <BuilderDesignPanel
            store={store}
            theme={theme}
            onThemeChange={setTheme}
            onSave={() => void saveTheme()}
            onDiscard={() => {
              setTheme(store.theme)
              setThemeError(null)
            }}
            dirty={themeDirty}
            busy={themeBusy}
            error={themeError}
          />
        )}

        {target === 'header' && <HeaderNotice storePath={storePath} />}

        {target === 'footer' && (
          <ManagedStoreProvider value={managed}>
            <StoreFooterPage embedded />
          </ManagedStoreProvider>
        )}

        {activeSection &&
          (BUILDER_SECTIONS[activeSection.key].editor === 'banners' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                {BUILDER_SECTIONS[activeSection.key].about}
              </p>
              <ManagedStoreProvider value={managed}>
                <StoreBannersPage embedded onSaved={refreshPreview} />
              </ManagedStoreProvider>
            </div>
          ) : (
            <BuilderSectionEditor
              section={activeSection}
              storePath={storePath}
              busy={false}
              onToggle={toggle}
              onSettingsChange={changeSettings}
            />
          ))}
      </div>
    </div>
  )

  const preview = (
    <BuilderPreview
      slug={store.slug}
      device={device}
      draftTheme={themeDirty ? theme : null}
      focusKey={
        target && target !== 'header' && target !== 'footer' ? target : null
      }
      refreshToken={previewToken}
      onSelect={(key) => {
        // Guarded: the frame is same-origin and ours, but a target the panel
        // has no editor for would leave it blank.
        if (
          key === 'header' ||
          key === 'footer' ||
          key in BUILDER_SECTIONS
        ) {
          openTarget(key as BuilderTarget)
        }
      }}
    />
  )

  return (
    // A workbench on a wide screen (fixed frame, each column scrolling on its
    // own, so the preview never scrolls away from the control being used) and
    // an ordinary page on a narrow one, where a fixed frame inside a mobile
    // browser's shifting viewport is a fight nobody wins.
    <div className="flex min-h-screen flex-col bg-bg lg:h-screen lg:overflow-hidden">
      <BuilderHeader
        store={store}
        onStoreChange={onStoreChange}
        backTo={storePath}
        device={device}
        onDeviceChange={setDevice}
        saveState={saveState}
        saveError={saveError}
      />

      {/* Below `lg`: one column, switched. */}
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2 lg:hidden">
        <div className="flex rounded-md border border-line p-0.5">
          {(['edit', 'preview'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              aria-pressed={mobileView === view}
              className={`h-8 flex-1 rounded text-xs font-semibold transition-colors ${
                mobileView === view
                  ? 'bg-brand-soft text-brand'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {view === 'edit' ? 'Edit' : 'Preview'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div
          className={`min-w-0 border-line bg-surface lg:block lg:h-full lg:border-r ${
            mobileView === 'edit' ? '' : 'hidden'
          }`}
        >
          {panel}
        </div>

        <div
          className={`min-w-0 bg-surface-alt p-3 sm:p-4 lg:flex lg:h-full lg:items-start lg:justify-center lg:overflow-y-auto ${
            mobileView === 'preview' ? 'flex' : 'hidden'
          }`}
        >
          {preview}
        </div>
      </div>
    </div>
  )
}

function PanelTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand text-fg'
          : 'border-transparent text-muted hover:text-fg'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/**
 * The header is fixed chrome — the same bar on every page of every shop — so
 * there is nothing to arrange. What it *shows* is the store's own identity,
 * which is edited on Store Details, and this says so rather than presenting an
 * empty panel.
 */
function HeaderNotice({ storePath }: { storePath: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Your header is the same on every page of your shop — logo, search,
        categories and the cart. It always stays at the top, so there is nothing
        to arrange here.
      </p>
      <div className="rounded-lg border border-line px-3 py-2.5">
        <p className="text-xs text-muted">
          The logo and name it shows come from your store details.
        </p>
        <Link
          to={`${storePath}/details`}
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
        >
          Edit store details
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
