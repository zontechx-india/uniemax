/**
 * Where the admin console and the storefront live.
 *
 * The console is served two ways from the same build:
 *   - on its own host, `admin.<storefront host>` (admin.uniemax.com,
 *     admin.dev.uniemax.zontechx.com, admin.localhost:5173) at the root `/`;
 *   - at the `/admin` path of the storefront host (local `localhost:5173/admin`).
 *
 * Code that links from the console to the storefront (a store page, the
 * marketplace home, a seller's dashboard) must use `storefrontOrigin()`, never
 * `window.location.origin` or a bare `/store/...` path — on the admin host
 * those resolve to the console, not the shop.
 */

const ADMIN_HOST_PREFIX = 'admin.'

/** True when this page was opened on the dedicated admin host. */
export function isAdminHost(): boolean {
  return window.location.hostname.startsWith(ADMIN_HOST_PREFIX)
}

/** The console router's basename: `/` on the admin host, else `/admin`. */
export function adminBasename(): string {
  return isAdminHost() ? '/' : '/admin'
}

/** The storefront's origin, e.g. `https://uniemax.com` from the admin host. */
export function storefrontOrigin(): string {
  const { protocol, host } = window.location
  return isAdminHost()
    ? `${protocol}//${host.slice(ADMIN_HOST_PREFIX.length)}`
    : `${protocol}//${host}`
}
