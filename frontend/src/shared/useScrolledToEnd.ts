import { useEffect, useState } from 'react'

/**
 * Whether a sideways-scrolling row is scrolled to its end (or has nothing to
 * scroll). For the right-edge fade that says "there is more": once the row
 * is at its end there is no more, so the fade should go — otherwise it dims
 * the last item.
 *
 * Put `ref` on the scrolling element. It is a callback ref, so a row that
 * appears later (another tab shown first) is still picked up. Follows
 * scrolling and resizes (the row's own size and its content's, e.g. counts
 * arriving later).
 */
export function useScrolledToEnd<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    if (!el) return
    // 1px slack: scroll positions can be fractional on high-DPI screens.
    const check = () => setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', check)
      observer.disconnect()
    }
  }, [el])

  return { ref, atEnd }
}
