import { useCallback, useEffect, useRef, useState } from 'react'
import { MARKET_BANNER_FORMAT } from '../stores/bannerSpec'
import {
  BannerArrow,
  BannerArtwork,
  BannerLink,
  usePrefersReducedMotion,
  type CarouselBanner,
} from './BannerCarousel'

/**
 * The MARKETPLACE homepage's banners: 16:9 cards in a sideways-scrolling rail,
 * several on screen at once — about one card plus a peek of the next on a
 * phone, two on a tablet, two and a half on a desktop. The peek is the point:
 * a cut-off card says "there is more this way" without a word.
 *
 * Store homepages keep the one-wide-strip `BannerCarousel`: a seller's banners
 * are 16:5 artwork made for that frame.
 *
 * Scrolling is the browser's own (scroll-snap), so swipe, trackpad and
 * keyboard all work with no gesture code. On top of that the rail advances one
 * card every few seconds and wraps to the start at the end — except while the
 * shopper is hovering, focused inside it, or has just scrolled it themselves,
 * and never under `prefers-reduced-motion`.
 */

/** How long a card holds before the rail moves on. */
const ADVANCE_MS = 5000

/** After the shopper scrolls the rail, it stays put at least this long. */
const IDLE_AFTER_TOUCH_MS = 8000

/** Below this many pixels from an edge counts as "at" it — sub-pixel scroll. */
const EDGE_SLOP = 4

/**
 * Card width per breakpoint, as a share of the rail. Mirrored in `CARD_SIZES`
 * so the browser downloads the right sized copy.
 */
const CARD_WIDTH = 'basis-[86%] sm:basis-[46%] lg:basis-[38%]'
const CARD_SIZES = '(min-width: 1024px) 38vw, (min-width: 640px) 46vw, 86vw'

export function BannerCardRail({
  banners,
  id,
  className = '',
  containerClassName = '',
}: {
  banners: CarouselBanner[]
  id?: string
  /** Section chrome — band tone and spacing. */
  className?: string
  /** The content column the rail sits in. */
  containerClassName?: string
}) {
  const track = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [paused, setPaused] = useState(false)
  const activeRef = useRef(0)
  activeRef.current = active
  const lastTouch = useRef(0)
  const reduced = usePrefersReducedMotion()
  const count = banners.length

  /** Where card `i` sits, as a scroll offset of the rail. */
  const offsetOf = useCallback((i: number) => {
    const el = track.current
    const cards = el?.children
    if (!el || !cards?.length) return 0
    const first = cards[0] as HTMLElement
    const card = cards[Math.min(i, cards.length - 1)] as HTMLElement
    // Relative to the first card, so the rail's own side padding (phones)
    // is not counted as distance.
    return card.offsetLeft - first.offsetLeft
  }, [])

  /** Read the scroll position back into the arrows (and the active card). */
  const sync = useCallback(() => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const left = el.scrollLeft
    setCanPrev(left > EDGE_SLOP)
    setCanNext(left < max - EDGE_SLOP)
    // At the far end the last cards can never reach the left edge, so the
    // end itself means "the last card".
    if (left >= max - EDGE_SLOP) {
      setActive(count - 1)
      return
    }
    let nearest = 0
    for (let i = 1; i < count; i++) {
      if (Math.abs(offsetOf(i) - left) < Math.abs(offsetOf(nearest) - left)) {
        nearest = i
      }
    }
    setActive(nearest)
  }, [count, offsetOf])

  const scrollToCard = useCallback(
    (i: number) => {
      track.current?.scrollTo({
        left: offsetOf(i),
        behavior: reduced ? 'auto' : 'smooth',
      })
    },
    [offsetOf, reduced],
  )

  // Keep the arrows right when the rail is scrolled or resized.
  useEffect(() => {
    const el = track.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const resize = new ResizeObserver(onScroll)
    resize.observe(el)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      resize.disconnect()
    }
  }, [sync])

  // Auto-advance. Reads the live position each tick (through the ref) rather
  // than a captured `active`, so a shopper's own scroll is never overwritten
  // by a stale index.
  useEffect(() => {
    if (count < 2 || paused || reduced) return
    const timer = window.setInterval(() => {
      const el = track.current
      if (!el || el.scrollWidth <= el.clientWidth + EDGE_SLOP) return
      if (Date.now() - lastTouch.current < IDLE_AFTER_TOUCH_MS) return
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - EDGE_SLOP
      scrollToCard(atEnd ? 0 : activeRef.current + 1)
    }, ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [count, paused, reduced, scrollToCard])

  if (count === 0) return null

  return (
    <section
      id={id}
      aria-roledescription="carousel"
      aria-label="Offers"
      className={`scroll-mt-20 ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerDown={() => {
        lastTouch.current = Date.now()
      }}
      onWheel={() => {
        lastTouch.current = Date.now()
      }}
    >
      <div className={containerClassName}>
        <div className="relative">
          <ul
            ref={track}
            // Bleeds to the screen edge on a phone, so the peeking card is
            // cut by the screen rather than by the page gutter.
            className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {banners.map((banner, i) => {
              const art = (
                <BannerArtwork
                  banner={banner}
                  sizes={CARD_SIZES}
                  // The first few are on screen on arrival.
                  eager={i < 3}
                />
              )
              return (
                <li
                  key={banner.id}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  className={`${CARD_WIDTH} ${MARKET_BANNER_FORMAT.aspect} shrink-0 snap-start overflow-hidden rounded-lg border border-line bg-surface-alt`}
                >
                  {banner.href ? <BannerLink banner={banner}>{art}</BannerLink> : art}
                </li>
              )
            })}
          </ul>

          {canPrev && (
            <BannerArrow side="left" onClick={() => scrollToCard(active - 1)} />
          )}
          {canNext && (
            <BannerArrow side="right" onClick={() => scrollToCard(active + 1)} />
          )}
        </div>
        {/* No position dots: the peeking card already says "there is more",
            and the row under the cards cost a line of a phone screen. */}
      </div>
    </section>
  )
}
