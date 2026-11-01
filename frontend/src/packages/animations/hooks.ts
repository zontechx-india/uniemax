import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

const REDUCE = '(prefers-reduced-motion: reduce)'

/** The visitor's "reduce motion" setting, kept live if they change it. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(REDUCE).matches,
    () => true,
  )
}

/**
 * Whether the PARENT of `marker` is on or near the screen. A pal lives on its
 * parent element, so that is the element worth watching. `false` until the
 * first observation, so nothing loads on first paint for a footer far below.
 */
export function useHostNearScreen(marker: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [near, setNear] = useState(false)

  useEffect(() => {
    const host = marker.current?.parentElement
    if (!host || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setNear(entry.isIntersecting)
    }, { rootMargin })
    observer.observe(host)
    return () => observer.disconnect()
  }, [marker, rootMargin])

  return near
}
