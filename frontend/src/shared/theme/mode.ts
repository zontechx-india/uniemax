/**
 * Theme-mode controller (no React) — applies light/dark to <html>.
 *
 * **Light is the default** (the brand palette is light-first) and is also what
 * `:root` paints before JS runs, so first load never flashes. The choice is
 * persisted to localStorage and reflected as `data-theme` on the document
 * root, which is what the CSS variables in `index.css` key off. Call
 * `initThemeMode()` once, as early as possible, before React renders (done in
 * each app's `main.tsx`).
 */
import type { ThemeMode } from './colors'

export type { ThemeMode }

const STORAGE_KEY = 'uniemax-theme'
export const DEFAULT_MODE: ThemeMode = 'light'

export function getStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'dark' || value === 'light') return value
  } catch {
    /* localStorage unavailable (SSR/private mode) — fall through */
  }
  return DEFAULT_MODE
}

/**
 * What the phone paints the status bar with when the app is installed and
 * running standalone. Each is the scheme's `--surface`, because that is what
 * the sticky header paints directly beneath the status bar — matching `--bg`
 * instead would leave a visible seam wherever the header is on screen.
 */
const STATUS_BAR: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#1e1e1e',
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
  // The theme is a STORED choice, not `prefers-color-scheme`, so the meta tag
  // has to be rewritten here — a media-query pair in index.html would follow
  // the phone and strand a light app under a dark status bar.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', STATUS_BAR[mode])
}

export function setStoredMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore persistence failure */
  }
  applyThemeMode(mode)
}

/** Idempotent bootstrap — safe to call before render. */
export function initThemeMode(): ThemeMode {
  const mode = getStoredMode()
  applyThemeMode(mode)
  return mode
}
