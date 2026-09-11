import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ThemeProvider, initThemeMode } from '../shared/theme'
import { initStaleBuildReload } from '../shared/staleBuildReload'
import { StorefrontApp } from './StorefrontApp'

initStaleBuildReload()
initThemeMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <StorefrontApp />
    </ThemeProvider>
  </StrictMode>,
)
