/**
 * The one place the supplier UI knows where its API lives. When the backend
 * package becomes its own service, these are the constants that move.
 */
export const DROPSHIP_API_BASE = '/api/v1/dropship'
/** Admin screens sit inside the admin subtree its session cookies are scoped to. */
export const DROPSHIP_ADMIN_API_BASE = '/api/v1/admin/dropship'
