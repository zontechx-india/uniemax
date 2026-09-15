/**
 * The one place the affiliate UI knows where its API lives. When the backend
 * package becomes its own service, this is the constant that moves.
 */
export const AFFILIATE_API_BASE = '/api/v1/affiliate'

/** localStorage key for the attribution tokens picked up from /a/:token. */
export const ATTRIBUTION_STORAGE_KEY = 'uniemax.affiliateRef'
