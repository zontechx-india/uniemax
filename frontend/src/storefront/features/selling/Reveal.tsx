import type { ReactNode } from 'react'
import { useInView } from './useInView'

/**
 * Rises into place the first time it scrolls into view (`.sell-reveal` in
 * `index.css`). `delay` staggers siblings in a row. Under reduced motion the
 * CSS shows it in place from the start.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  /** Milliseconds — staggers cards in the same row. */
  delay?: number
}) {
  const [ref, inView] = useInView<HTMLDivElement>({
    once: true,
    rootMargin: '0px 0px -8% 0px',
  })
  return (
    <div
      ref={ref}
      className={`sell-reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
