/**
 * Service-worker bootstrap — what makes the storefront installable.
 *
 * Chrome only offers a real install (a standalone window, no URL bar) when the
 * site has a manifest AND a registered service worker with a fetch handler.
 * `usePushSubscription` also registers `/push-sw.js`, but only when a customer
 * turns notifications on — so before this, a phone that had never enabled push
 * had no worker, and Chrome fell back to offering a plain browser shortcut.
 *
 * Registering is silent: it asks for no permission and shows no prompt, so it
 * is safe on page load. Requesting *notification* permission still happens
 * only from a user gesture, in `usePushSubscription`.
 *
 * Registration is idempotent — the same script URL and scope resolves to the
 * existing registration — so the push hook registering again costs nothing.
 *
 * Storefront only. The admin console (`admin.html`) deliberately never calls
 * this: it is a staff tool on the same origin, not something to install.
 */
export function initServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  // After load, so registration never competes with the first render for
  // bandwidth on a phone.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/push-sw.js').catch(() => {
      // A failed registration costs the install prompt and push, nothing else
      // — the site works exactly as before, so there is nothing to tell the
      // user about and nothing to retry.
    })
  })
}
