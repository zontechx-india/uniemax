import { call, http } from '../../../shared/auth/http'
import type { StoreThemeColors } from './storesApi'

/**
 * Store appearance templates — the platform's curated palettes, offered to
 * sellers in Appearance → Templates.
 *
 * A template carries **colors only** (the same five keys as `StoreTheme`), so
 * applying one is a plain copy onto the store's own theme. The seller list is
 * read-only and already filtered to the enabled templates by the API; the
 * admin console's CRUD over the same table lives in `admin/features/adminApi`.
 */

export interface StoreThemeTemplate {
  id: string
  name: string
  description: string | null
  theme: StoreThemeColors
  isActive: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Which mount this client talks to — the same two-mount arrangement as
 * `storesApi`, because the Appearance screen that reads this list is one
 * component shared by the seller dashboard and the admin console:
 *
 *   '/api/v1/theme-templates'               the seller
 *   '/api/v1/admin/manage/theme-templates'  an admin managing that seller
 *
 * NOT the console's own `/api/v1/admin/theme-templates`, which is the CRUD
 * over this table and returns inactive rows — exactly what a palette picker
 * must never offer.
 */
let templatesBase = '/api/v1/theme-templates'

export function configureThemeTemplatesApi(mountBase: string): void {
  templatesBase = mountBase
}

export const themeTemplatesApi = {
  /** Enabled templates, in the order the platform arranged them. */
  async list(): Promise<StoreThemeTemplate[]> {
    return call<StoreThemeTemplate[]>(http.get(templatesBase))
  },
}
