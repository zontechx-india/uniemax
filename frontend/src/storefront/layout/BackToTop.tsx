import { useEffect, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { ArrowUpIcon } from './icons'

/** Shown once the visitor is this many screens down the page. */
const SHOW_AFTER_SCREENS = 2

/**
 * "↑ Top" — a floating button bottom-right once a long page has been
 * scrolled two screens down. Mounted by the marketplace pages and the store
 * layout (not on a store's product page, whose buy bar owns the bottom).
 * Built from the shared `Button`, so inside a store it wears the store's
 * palette; respects reduced motion.
 */
export function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () =>
      setShow(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })}
      className="fixed bottom-4 right-4 z-30 shadow-floating sm:bottom-6 sm:right-6"
    >
      <ArrowUpIcon className="h-4 w-4" />
      Top
    </Button>
  )
}
