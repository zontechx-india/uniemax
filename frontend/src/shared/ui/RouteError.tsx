import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { buttonClass } from './Button'

/**
 * What a route shows when it fails — shared by both storefront routers and the
 * admin console, instead of react-router's raw developer error screen.
 *
 * The common real-world failure is not a bug but a DEPLOY: a tab opened
 * before the release still references the previous build's chunk names, so
 * the next lazy page 404s on its own JavaScript. That case reloads once
 * automatically (guarded, so a genuinely broken chunk cannot loop) and the
 * visitor lands on the new version without seeing an error at all.
 */

const RELOAD_GUARD = 'uniemax.chunkReloadAt'

function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
    message,
  )
}

/** Reload once per minute at most — enough for a deploy, never a loop. */
function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()))
  } catch {
    // Storage blocked: fall through to the manual Reload button.
    return false
  }
  window.location.reload()
  return true
}

export function ErrorScreen({ error, homeHref = '/' }: { error: unknown; homeHref?: string }) {
  const stale = isStaleChunk(error)
  useEffect(() => {
    if (stale) reloadForNewVersion()
  }, [stale])

  const notFound = isRouteErrorResponse(error) && error.status === 404
  const title = stale
    ? 'A new version is available'
    : notFound
      ? 'Page not found'
      : 'Something went wrong'
  const body = stale
    ? 'UnieMax was just updated. Reload to continue where you were.'
    : notFound
      ? "The page you're looking for doesn't exist or has moved."
      : 'This page hit an unexpected problem. Reloading usually fixes it — if not, head back home.'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center text-fg">
      <h1 className="font-body text-2xl font-semibold tracking-normal">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {!notFound && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonClass({ size: 'md' })}
          >
            Reload
          </button>
        )}
        {/* A full navigation, not a <Link>: home may live in another router. */}
        <a
          href={homeHref}
          className={buttonClass({ variant: notFound ? 'rise' : 'ring', size: 'md' })}
        >
          Back to home
        </a>
      </div>
    </div>
  )
}

/** `errorElement` for data routers (`createBrowserRouter`). */
export function RouteError({ homeHref }: { homeHref?: string }) {
  return <ErrorScreen error={useRouteError()} homeHref={homeHref} />
}

/** The same screen for trees without data-router error elements (admin). */
export class ErrorBoundary extends Component<
  { children: ReactNode; homeHref?: string },
  { error: unknown }
> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Still surface it in the console for whoever is debugging.
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} homeHref={this.props.homeHref} />
    }
    return this.props.children
  }
}
