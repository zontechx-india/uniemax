import { createElement, useEffect, useRef, useState } from 'react'
import { useHostNearScreen, useReducedMotion } from './hooks'
import { loadPal } from './pals'
import type { PalName } from './pals'

type PalProps = {
  name: PalName
  /** Where along the host it starts, 0 (left) to 1 (right). */
  at?: number
  /** Jump height multiplier (Boing). */
  energy?: number
}

/**
 * A Piixpal character living on the element this is placed in — put it
 * straight inside the host (`<footer>…<Pal name="boing" /></footer>`), not in
 * a wrapper, because a pal hops along its parent.
 *
 * Costs nothing until the host comes near the screen: only then are the
 * engine and this pal downloaded. When the host scrolls away the pal is
 * removed, which stops the library's animation loop (it keeps ticking while
 * any pal is on the page, even one that is off screen). Never shown with
 * "reduce motion" on.
 */
export function Pal({ name, at, energy }: PalProps) {
  const marker = useRef<HTMLSpanElement>(null)
  const near = useHostNearScreen(marker)
  const reduced = useReducedMotion()
  const [loaded, setLoaded] = useState<PalName | null>(null)
  const wanted = near && !reduced

  useEffect(() => {
    if (!wanted) return
    let live = true
    loadPal(name).then(
      () => {
        if (live) setLoaded(name)
      },
      () => {}, // decoration only — a failed download just means no pal
    )
    return () => {
      live = false
    }
  }, [wanted, name])

  return (
    <>
      <span ref={marker} hidden />
      {wanted && loaded === name && createElement('piix-pal', { pal: name, at, energy })}
    </>
  )
}
