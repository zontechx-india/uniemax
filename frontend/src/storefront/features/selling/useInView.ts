import { useEffect, useRef, useState } from 'react'

/**
 * Whether an element is on screen, via IntersectionObserver.
 *
 * `null` until the first observation, so a caller can tell "not measured
 * yet" from "measured and off screen" — the /sell sticky bar must not flash
 * in on first paint just because nothing has been measured. With `once`, it
 * latches `true` the first time the element is seen and stops observing.
 *
 * Without IntersectionObserver (very old browsers) everything counts as on
 * screen, so nothing that waits on this can stay hidden.
 */
export function useInView<T extends Element>({
  once = false,
  rootMargin = '0px',
  threshold = 0,
}: { once?: boolean; rootMargin?: string; threshold?: number } = {}) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState<boolean | null>(() =>
    typeof IntersectionObserver === 'undefined' ? true : null,
  )

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setInView(entry.isIntersecting)
        if (once && entry.isIntersecting) observer.disconnect()
      },
      { rootMargin, threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return [ref, inView] as const
}
