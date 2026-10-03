import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ThemeProvider, initThemeMode } from '../shared/theme'
import { initStaleBuildReload } from '../shared/staleBuildReload'
import { initServiceWorker } from '../shared/serviceWorker'
import { getMediaConfig } from '../shared/media/mediaConfig'
import { StorefrontApp } from './StorefrontApp'

initStaleBuildReload()
initThemeMode()
initServiceWorker()
// Image sizing rules: fetched alongside the page's own data, so the first
// product photos already know which copy to download.
void getMediaConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <StorefrontApp />
    </ThemeProvider>
  </StrictMode>,
)
