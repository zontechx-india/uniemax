import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { useReducedMotion } from '../../packages/animations/hooks'

/**
 * A segmented control with a "rubber" thumb — the ADMIN_UI_THEME §7.5 `segc`
 * look (neutral `surface-alt` track, the chosen cell a raised `surface` pane
 * in the text colour, never a brand fill), with motion:
 *
 *   - Tap another cell: the thumb first stretches over both cells, then the
 *     far edge lands and the near edge follows with a small squash.
 *   - Drag the thumb (phone or mouse): it follows the finger, rubber-bands at
 *     the ends, and a flick throws it to the next cell.
 *   - Native radios under the labels: arrow keys, Space and screen readers
 *     work as with any radio group.
 *   - "Reduce motion" on: no animation, the thumb jumps.
 *
 * Adapted from the RubberSegment library component, without its `motion`
 * dependency: the two thumb edges are plain numbers animated with
 * requestAnimationFrame and painted straight onto two elements (no React
 * render per frame).
 *
 * How the colour changes under the thumb: every option is drawn twice — the
 * labels (inactive look) and, above them, a copy in the active look clipped
 * to the thumb's edges. So a label turns from muted to full ink exactly where
 * the thumb passes. A third element behind both draws the thumb's shadow.
 * `renderOption(option, active)` draws both copies (labels with count pills,
 * say); the cells are equal width, so both copies line up.
 */

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

// Timings (ms) and feel — from the library's defaults.
const STRETCH_MS = 190
const HANDOFF_MS = 150
const LAND_MS = 300
const FLICK_LAND_MS = 400
const RELAX_MS = 160
const SQUASH_PX = 3
const FLICK = 110 // px/s — faster than this on release is a flick
const DEADZONE = 4 // px before a press on the thumb becomes a drag
const SLOP = 10 // px a tap may wander and still count as a tap
const RUBBER = 0.55
const GLIDE = 75

type Slot = { l: number; r: number }
type Sample = [number, number]
type Drag = { id: number; x0: number; slot: number; onThumb: boolean; live: boolean; offset: number; w: number; hist: Sample[] }
type Ease = (t: number) => number

/** cubic-bezier(0.23, 1, 0.32, 1)-like: fast start, soft landing. */
const easeOut: Ease = (t) => 1 - Math.pow(1 - t, 4)
/** A little overshoot for a flick, then settle. */
const easeOutBack: Ease = (t) => {
  const s = 1.2
  const p = t - 1
  return 1 + (s + 1) * p * p * p + s * p * p
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const rubber = (over: number, dim: number) => (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over))
/** How far a release velocity carries the thumb. */
const project = (v: number) => {
  const d = 1 - 0.1 * Math.pow(0.05, GLIDE / 100)
  return ((v / 1000) * d) / (1 - d)
}
const velocityOf = (hist: Sample[], now: number) => {
  const recent = hist.filter(([t]) => now - t <= 100)
  if (recent.length < 2) return 0
  const [t0, x0] = recent[0]!
  const [t1, x1] = recent[recent.length - 1]!
  return t1 - t0 >= 8 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0
}
const nearestSlot = (slots: Slot[], x: number) => {
  let best = 0
  for (let i = 1; i < slots.length; i++) {
    const mid = (s: Slot) => (s.l + s.r) / 2
    if (Math.abs(mid(slots[i]!) - x) < Math.abs(mid(slots[best]!) - x)) best = i
  }
  return best
}

/** Track padding (p-0.5) — the thumb sits this far inside the border. */
const INSET = 2

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  renderOption,
  cellClassName = 'min-h-9 gap-2 px-3',
  className = 'w-fit',
  draggable = true,
  disabled = false,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Read by screen readers — what the choice is about. */
  label: string
  /** Draws one option in its inactive (`false`) or chosen (`true`) look. */
  renderOption?: (option: SegmentOption<T>, active: boolean) => ReactNode
  /** Size and inner layout of each cell (height, padding, direction, gap). */
  cellClassName?: string
  /** Width of the whole control — `w-fit` (default) or `w-full sm:w-fit`. */
  className?: string
  draggable?: boolean
  disabled?: boolean
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const name = useId()
  const reduce = useReducedMotion()
  const draw = renderOption ?? defaultRender

  const trackRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLLabelElement | null)[]>([])
  const slots = useRef<Slot[]>([])
  const width = useRef(0)
  const box = useRef<DOMRect | null>(null)
  const committed = useRef(index)
  const drag = useRef<Drag | null>(null)
  const radius = useRef(8)
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The thumb: its two edges, and the running animation of each.
  const edges = useRef({ l: 0, r: 0 })
  const frames = useRef<{ l: number; r: number }>({ l: 0, r: 0 })
  const gen = useRef(0)

  const paint = () => {
    const { l, r } = edges.current
    const overlay = overlayRef.current
    const shadow = shadowRef.current
    if (overlay) {
      overlay.style.clipPath = `inset(0 ${Math.max(0, width.current - r)}px 0 ${Math.max(0, l)}px round ${radius.current}px)`
    }
    if (shadow) {
      shadow.style.transform = `translateX(${l}px)`
      shadow.style.width = `${Math.max(0, r - l)}px`
    }
  }

  const stop = (edge: 'l' | 'r') => cancelAnimationFrame(frames.current[edge])

  const set = (l: number, r: number) => {
    stop('l')
    stop('r')
    edges.current = { l, r }
    paint()
  }

  /** Animate one edge to `to`; resolves when it gets there (not if cut off). */
  const animateEdge = (edge: 'l' | 'r', to: number, ms: number, ease: Ease = easeOut) =>
    new Promise<void>((resolve) => {
      stop(edge)
      const from = edges.current[edge]
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        edges.current[edge] = from + (to - from) * ease(t)
        paint()
        if (t < 1) frames.current[edge] = requestAnimationFrame(step)
        else resolve()
      }
      frames.current[edge] = requestAnimationFrame(step)
    })

  const jumpTo = (i: number) => {
    const s = slots.current[i]
    if (!s) return
    clearTimeout(handoff.current)
    gen.current += 1
    set(s.l, s.r)
  }

  const measure = () => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    box.current = rect
    const left = rect.left + track.clientLeft + INSET
    slots.current = options.map((_, i) => {
      const el = cellRefs.current[i]
      if (!el) return { l: 0, r: 0 }
      const r = el.getBoundingClientRect()
      return { l: r.left - left, r: r.right - left }
    })
    width.current = track.clientWidth - INSET * 2
    const first = cellRefs.current[0]
    if (first) radius.current = parseFloat(getComputedStyle(first).borderTopLeftRadius) || 8
    jumpTo(committed.current)
  }

  const optionsKey = options.map((o) => o.value).join('|')
  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (trackRef.current) observer.observe(trackRef.current)
    void document.fonts?.ready.then(measure)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey])

  // The value changed from outside (URL, parent): jump there.
  useEffect(() => {
    if (!drag.current && committed.current !== index) {
      committed.current = index
      jumpTo(index)
    }
  })

  useEffect(
    () => () => {
      clearTimeout(handoff.current)
      cancelAnimationFrame(frames.current.l)
      cancelAnimationFrame(frames.current.r)
    },
    [],
  )

  const commit = (i: number) => {
    committed.current = i
    if (i !== index) onChange(options[i]!.value)
  }

  /** Lead edge first, the trailing edge follows (with a squash). */
  const land = (to: number, flick: boolean, withSquash: boolean) => {
    const b = slots.current[to]
    if (!b) return
    const g = ++gen.current
    const { l, r } = edges.current
    const dir = Math.sign((b.l + b.r) / 2 - (l + r) / 2) || 1
    const [lead, leadTo, trail, trailTo] = dir > 0 ? (['r', b.r, 'l', b.l] as const) : (['l', b.l, 'r', b.r] as const)
    void animateEdge(lead, leadTo, flick ? FLICK_LAND_MS : LAND_MS, flick ? easeOutBack : easeOut)
    if (!withSquash) {
      void animateEdge(trail, trailTo, LAND_MS)
      return
    }
    void animateEdge(trail, trailTo + dir * SQUASH_PX, LAND_MS).then(() => {
      if (gen.current === g) void animateEdge(trail, trailTo, RELAX_MS)
    })
  }

  /** A tap: stretch over both cells, then land on the new one. */
  const travel = (from: number, to: number) => {
    const a = slots.current[from]
    const b = slots.current[to]
    if (!a || !b) return
    clearTimeout(handoff.current)
    gen.current += 1
    if (reduce) return set(b.l, b.r)
    void animateEdge('l', Math.min(a.l, b.l), STRETCH_MS)
    void animateEdge('r', Math.max(a.r, b.r), STRETCH_MS)
    handoff.current = setTimeout(() => land(to, false, true), HANDOFF_MS)
  }

  const localX = (e: { clientX: number }) =>
    e.clientX - (box.current?.left ?? 0) - (trackRef.current?.clientLeft ?? 0) - INSET

  const onPointerDown = (e: PointerEvent<HTMLLabelElement>, i: number) => {
    if (disabled || drag.current || e.button !== 0) return
    box.current = trackRef.current?.getBoundingClientRect() ?? null
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is a nicety */
    }
    const x = localX(e)
    const onThumb = draggable && x >= edges.current.l && x <= edges.current.r
    drag.current = { id: e.pointerId, x0: x, slot: i, onThumb, live: false, offset: 0, w: 0, hist: [[e.timeStamp, x]] }
    if (onThumb) {
      clearTimeout(handoff.current)
      gen.current += 1
      stop('l')
      stop('r')
    } else if (!reduce) {
      e.currentTarget.dataset.pressed = ''
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id || !d.onThumb) return
    const x = localX(e)
    d.hist.push([e.timeStamp, x])
    if (d.hist.length > 8) d.hist.shift()
    if (!d.live) {
      if (Math.abs(x - d.x0) < DEADZONE) return
      d.live = true
      d.offset = x - edges.current.l
      d.w = edges.current.r - edges.current.l
      if (trackRef.current) trackRef.current.dataset.held = ''
    }
    const l = x - d.offset
    const maxL = width.current - d.w
    if (reduce) {
      const c = clamp(l, 0, maxL)
      set(c, c + d.w)
    } else if (l < 0) {
      set(0, d.w - rubber(-l, d.w))
    } else if (l > maxL) {
      set(maxL + rubber(l - maxL, d.w), width.current)
    } else {
      set(l, l + d.w)
    }
  }

  const release = () => {
    const d = drag.current!
    drag.current = null
    if (trackRef.current) delete trackRef.current.dataset.held
    const el = cellRefs.current[d.slot]
    if (el) delete el.dataset.pressed
    return d
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    release()
    const x = localX(e)
    if (!d.live) {
      if (Math.abs(x - d.x0) <= SLOP && d.slot !== committed.current) {
        const from = committed.current
        commit(d.slot)
        travel(from, d.slot)
      }
      return
    }
    const v = velocityOf(d.hist, e.timeStamp)
    const flick = Math.abs(v) > FLICK
    let to = nearestSlot(slots.current, (edges.current.l + edges.current.r) / 2 + project(v))
    if (flick && to === committed.current) to = clamp(to + Math.sign(v), 0, options.length - 1)
    commit(to)
    if (reduce) jumpTo(to)
    else land(to, flick, flick)
  }

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    release()
    if (!d.live) return
    if (reduce) jumpTo(committed.current)
    else land(committed.current, false, false)
  }

  /**
   * A pointer tap or drag is handled on pointer-up, so the label's own click
   * must not also tick its radio (after a drag it would tick the cell the
   * drag STARTED on). A click with no pointer (`detail` 0) passes through.
   */
  const onLabelClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (e.detail !== 0) e.preventDefault()
  }

  /** The native radio changed — arrow keys, Space, a screen reader. */
  const onRadioChange = (i: number) => {
    if (disabled || i === committed.current) return
    commit(i)
    jumpTo(i)
  }

  const cell = `flex items-center justify-center rounded-md text-center whitespace-nowrap ${cellClassName}`

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-draggable={draggable && !disabled ? '' : undefined}
      className={`group relative grid touch-pan-y auto-cols-[minmax(0,1fr)] grid-flow-col gap-0.5 rounded-lg border border-line bg-surface-alt p-0.5 select-none [-webkit-tap-highlight-color:transparent] data-[held]:cursor-grabbing aria-disabled:pointer-events-none aria-disabled:opacity-50 ${className}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    >
      {/* The thumb's raised pane + shadow, behind the labels. */}
      <div
        ref={shadowRef}
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-0 rounded-md bg-surface shadow-xs"
      />

      {options.map((option, i) => (
        <label
          key={option.value}
          ref={(el) => {
            cellRefs.current[i] = el
          }}
          data-on={i === index ? '' : undefined}
          onPointerDown={(e) => onPointerDown(e, i)}
          onClick={onLabelClick}
          className={`${cell} relative cursor-pointer text-muted transition-[color,transform] duration-150 data-[on]:cursor-default group-data-[draggable]:data-[on]:cursor-grab group-data-[held]:cursor-grabbing has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 data-[pressed]:scale-[0.96] [@media(hover:hover)]:[&:not([data-on]):hover]:text-fg`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={i === index}
            disabled={disabled}
            onChange={() => onRadioChange(i)}
            className="sr-only"
          />
          {draw(option, false)}
        </label>
      ))}

      {/* The chosen look, clipped to the thumb. */}
      <div
        ref={overlayRef}
        aria-hidden
        style={{ clipPath: 'inset(0 100% 0 0)' }}
        className="pointer-events-none absolute inset-0.5 grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-0.5 rounded-md bg-surface text-fg"
      >
        {options.map((option) => (
          <span key={option.value} className={cell}>
            {draw(option, true)}
          </span>
        ))}
      </div>
    </div>
  )
}

function defaultRender<T extends string>(option: SegmentOption<T>, active: boolean): ReactNode {
  return <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{option.label}</span>
}
