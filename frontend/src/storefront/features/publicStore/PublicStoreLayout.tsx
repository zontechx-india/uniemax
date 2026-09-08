import { createContext, useContext, useEffect, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { customerAuth } from '../../../shared/auth/authApi'
import { toApiError } from '../../../shared/auth/http'
import { resetFavicon, setFavicon } from '../../../shared/favicon'
import { publicStoreApi, type PublicStore } from '../stores/storesApi'
import { StoreIcon } from '../../layout/icons'
import { StoreFooter } from './StoreFooter'
import { StoreHeader } from './StoreHeader'
import { SKIN, storeVars, type Skin } from './storeTheme'
import { rememberStoreVisit } from '../discovery/recentActivity'

/**
 * Shell for every `/store/{slug}` page. Fetches the store **once** — branding,
 * theme and the category tree, with no products — and shares it with all child
 * routes through context, so navigating between the homepage, a category and a
 * product never refetches the chrome.
 *
 * The owner's palette (flat surfaces + chrome-CTA accents) is applied here via
 * `storeVars()`, so every page inside inherits it.
 *
 * **Draft preview** — the API serves an unpublished store to its signed-in
 * owner (`isPublished: false` in the shell); a banner above the header makes
 * the draft state unmistakable. Everyone else gets a 404 → `StoreUnavailable`.
 */

interface StoreContext {
  store: PublicStore
  skin: Skin
}

const Ctx = createContext<StoreContext | null>(null)

/** The current store + skin. Only valid inside `PublicStoreLayout`. */
export function usePublicStore(): StoreContext {
  const value = useContext(Ctx)
  if (!value) throw new Error('usePublicStore must be used inside a store route')
  return value
}

export function PublicStoreLayout() {
  const { storeSlug = '' } = useParams()
  const [store, setStore] = useState<PublicStore | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setStore(undefined)
    const load = async (): Promise<PublicStore | null> => {
      try {
        return await publicStoreApi.getBySlug(storeSlug)
      } catch (err) {
        // An owner previewing a draft can arrive with an expired access
        // token — the API then treats them as anonymous and answers 404.
        // Rotate the session cookie once and retry before giving up (for a
        // signed-out visitor the refresh fails instantly and we fall through).
        if (toApiError(err).statusCode === 404) {
          try {
            await customerAuth.refresh()
            return await publicStoreApi.getBySlug(storeSlug)
          } catch {
            /* genuinely unavailable */
          }
        }
        return null
      }
    }
    load().then((found) => {
      if (cancelled) return
      setStore(found)
      if (found) {
        // The tab icon follows the store while the visitor is inside it —
        // its uploaded logo, or the app favicon when it has none. Restored
        // on the way out by this effect's cleanup.
        setFavicon(found.logoUrl)
        // The marketplace homepage's "Recently Viewed" rail (published
        // stores only — a draft preview is not a shopping visit).
        if (found.isPublished) {
          rememberStoreVisit({
            slug: found.slug,
            name: found.name,
            logoUrl: found.logoUrl,
          })
        }
      }
    })
    return () => {
      cancelled = true
      resetFavicon()
    }
  }, [storeSlug])

  if (store === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-sm text-muted">
        Loading store…
      </div>
    )
  }

  if (store === null) return <StoreUnavailable />

  return (
    <Ctx.Provider value={{ store, skin: SKIN }}>
      <div
        className="flex min-h-screen flex-col bg-bg text-fg"
        style={storeVars(store.theme)}
      >
        {!store.isPublished && <DraftPreviewBanner storeSlug={store.slug} />}
        <StoreHeader store={store} skin={SKIN} />
        {/* Truly full-bleed: each page brings its own container, so the
            homepage can render edge-to-edge section bands while the inner
            pages keep the standard padded column (`StorePageShell`). */}
        <main className="flex-1">
          <Outlet />
        </main>
        <StoreFooter store={store} skin={SKIN} />
      </div>
    </Ctx.Provider>
  )
}

/**
 * Standard padded column for the inner storefront pages (category, product,
 * shop). Full-bleed with a soft 1920px cap for ultrawides, exactly what
 * `<main>` used to provide. The homepage deliberately opts out — it renders
 * its own edge-to-edge section bands instead.
 */
export function StorePageShell({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[1920px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Only the owner ever sees this (anyone else gets a 404 for an unpublished
 * store). Solid warning band, deliberately NOT store-themed — it is app
 * chrome telling the owner about the store, not part of the store's design.
 */
function DraftPreviewBanner({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="bg-warning px-4 py-2 text-center text-xs font-semibold text-white sm:px-6 lg:px-10">
      Draft preview — this store isn't published yet, so only you can see it.{' '}
      {/* Plain <a>: /mystores/… lives in the AUTHED router, and the gate picks
          a router per full page load — a client-side Link can't cross it. */}
      <a
        href={`/mystores/${storeSlug}`}
        className="underline underline-offset-2 hover:opacity-80"
      >
        Manage &amp; publish
      </a>
    </div>
  )
}

export function StoreUnavailable() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-surface-alt text-muted">
        <StoreIcon className="h-8 w-8" />
      </div>
      <h1 className="mt-5 font-heading text-xl font-bold tracking-tight text-fg">
        This store isn't available
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The store you're looking for doesn't exist or is no longer published.
        Double-check the link you were given.
      </p>
    </div>
  )
}
