/**
 * PUBLIC facade of the animations package — decorative motion the host apps
 * drop into a page. Only this package imports an animation library (today
 * `piixpal`, pinned); hosts import from here. It imports nothing from
 * `storefront/` or `admin/`. Design and rules: docs/FRONTEND_CONTEXT.md.
 */

export { Pal } from './Pal'
export type { PalName } from './pals'
