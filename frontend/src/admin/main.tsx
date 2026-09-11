import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ThemeProvider, initThemeMode } from '../shared/theme'
import { initStaleBuildReload } from '../shared/staleBuildReload'
import { AdminApp } from './AdminApp'

initStaleBuildReload()
initThemeMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AdminApp />
    </ThemeProvider>
  </StrictMode>,
)
