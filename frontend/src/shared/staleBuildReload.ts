/**
 * Recovers a tab that is still running a build we have already replaced.
 *
 * Routes are code-split, so navigating fetches a hash-named chunk
 * (`/assets/StoresPage-DPQOZI4D.js`). Every build emits new hashes and every
 * deploy deletes the old files, so a tab holding the previous `index.html`
 * asks for a chunk that no longer exists: the import rejects with "Failed to
 * fetch dynamically imported module" and the router shows its error screen
 * until the user refreshes by hand.
 *
 * Vite dispatches a cancelable `vite:preloadError` when a dynamic import
 * fails. Cancelling it suppresses the throw, and reloading re-fetches
 * `index.html` (nginx serves the shells `no-cache`) so the same URL comes
 * back on the current build.
 *
 * The sessionStorage stamp keeps a chunk that is genuinely unreachable — the
 * user is offline, or a deploy landed broken — from looping the tab: one
 * recovery per window, after which the error is left to the error boundary.
 */
const ATTEMPT_KEY = 'uniemax:stale-build-reload'
const ATTEMPT_WINDOW_MS = 30_000

/** sessionStorage throws outright in some privacy modes — never break boot over it. */
function lastAttempt(): number {
  try {
    return Number(window.sessionStorage.getItem(ATTEMPT_KEY)) || 0
  } catch {
    return 0
  }
}

function stampAttempt(): void {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()))
  } catch {
    /* ignore — worst case the reload is not rate-limited */
  }
}

export function initStaleBuildReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    // Already tried once and the chunk still will not load: it is not a stale
    // build. Let the error through so the boundary can report it.
    if (Date.now() - lastAttempt() < ATTEMPT_WINDOW_MS) return

    event.preventDefault()
    stampAttempt()
    window.location.reload()
  })
}
