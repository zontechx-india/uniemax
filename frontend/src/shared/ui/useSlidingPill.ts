import { useEffect, useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from '../../packages/animations/hooks'

/**
 * A highlight pill that slides between targets — the tab-bar version of the
 * `SegmentedControl` thumb, with the same "rubber" feel:
 *
 *   - It stretches over the old and the new target, then lands on the new
 *     one with a small squash of its trailing edge.
 *   - `hop(key)` makes that target's icon bounce once (a tap answer).
 *   - "Reduce motion" on: no slide, no hop — the pill just jumps.
 *
 * Usage: put `containerRef` on a positioned (`relative`) box, render
 * `<span ref={pillRef} className="absolute …" />` inside it FIRST, and give
 * each target `ref={target(key)}` plus `relative` so it paints above the
 * pill. Uses the Web Animations API; no React render per frame.
 */

type Box = { left: number; top: number; width: number; height: number }

const SLIDE_MS = 380
const SQUASH_PX = 3

export function useSlidingPill(activeKey: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const targets = useRef(new Map<string, HTMLElement>())
  const last = useRef<Box | null>(null)
  const reduce = useReducedMotion()

  const target = (key: string) => (el: HTMLElement | null) => {
    if (el) targets.current.set(key, el)
    else targets.current.delete(key)
  }

  const place = (animate: boolean) => {
    const box = containerRef.current
    const pill = pillRef.current
    if (!box || !pill) return
    const el = activeKey ? targets.current.get(activeKey) : undefined
    if (!el) {
      pill.style.opacity = '0'
      last.current = null
      return
    }
    const b = box.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const to: Box = {
      left: r.left - b.left - box.clientLeft,
      top: r.top - b.top - box.clientTop,
      width: r.width,
      height: r.height,
    }
    const from = last.current
    last.current = to
    pill.style.opacity = '1'
    pill.style.left = `${to.left}px`
    pill.style.top = `${to.top}px`
    pill.style.width = `${to.width}px`
    pill.style.height = `${to.height}px`
    if (!animate || reduce || !from || from.left === to.left) return

    // Stretch over both, then land; the trailing edge overshoots a little.
    const dir = Math.sign(to.left - from.left)
    const spanL = Math.min(from.left, to.left)
    const spanR = Math.max(from.left + from.width, to.left + to.width)
    const squash =
      dir > 0
        ? { left: to.left + SQUASH_PX, width: to.width - SQUASH_PX }
        : { left: to.left, width: to.width - SQUASH_PX }
    const px = (k: { left: number; width: number }) => ({ left: `${k.left}px`, width: `${k.width}px` })
    pill.animate(
      [
        { ...px(from), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        { ...px({ left: spanL, width: spanR - spanL }), offset: 0.4, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        { ...px(squash), offset: 0.8, easing: 'ease-out' },
        px(to),
      ],
      { duration: SLIDE_MS },
    )
  }

  // Each change of the active target: slide there.
  useLayoutEffect(() => {
    place(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  // Resizes (rotation, fonts loading): follow without animating.
  useEffect(() => {
    const box = containerRef.current
    if (!box) return
    const observer = new ResizeObserver(() => place(false))
    observer.observe(box)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  /** One small bounce of the target's icon (its first `svg`). */
  const hop = (key: string) => {
    if (reduce) return
    const icon = targets.current.get(key)?.querySelector('svg')
    icon?.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-5px)', offset: 0.35 },
        { transform: 'translateY(0)', offset: 0.7 },
        { transform: 'translateY(-1.5px)', offset: 0.85 },
        { transform: 'translateY(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  }

  return { containerRef, pillRef, target, hop }
}
