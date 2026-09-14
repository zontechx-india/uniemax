import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ThemeProvider, initThemeMode } from '../shared/theme'
import { initStaleBuildReload } from '../shared/staleBuildReload'
import { configureStoresApi } from '../storefront/features/stores/storesApi'
import { configureThemeTemplatesApi } from '../storefront/features/stores/themeTemplatesApi'
import { AdminApp } from './AdminApp'

initStaleBuildReload()
initThemeMode()

/**
 * This console drives the seller's store screens against the ADMIN mount of
 * the same backend plugin, so every call they make is authorised as an admin
 * over any store rather than as a customer over their own.
 *
 * Set once, here, before anything renders — the storefront build never calls
 * this and keeps the default `/api/v1/stores`. Because the CSRF cookie is
 * chosen from the request URL, this one line also moves the store client onto
 * the admin surface's cookie namespace.
 */
configureStoresApi('/api/v1/admin/manage/stores')
configureThemeTemplatesApi('/api/v1/admin/manage/theme-templates')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AdminApp />
    </ThemeProvider>
  </StrictMode>,
)
