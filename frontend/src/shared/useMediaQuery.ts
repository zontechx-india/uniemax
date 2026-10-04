import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, kept live as the window resizes or the
 * device rotates. For the few places where a layout needs a different TREE
 * per breakpoint (a portal on phones, inline on desktop) rather than
 * different classes — prefer Tailwind variants everywhere else.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
