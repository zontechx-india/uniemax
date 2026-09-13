import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from '../../layout/icons'
import { BANNER_FORMAT } from '../stores/bannerSpec'

/**
 * The banner carousel, shared by the MARKETPLACE homepage (platform banners,
 * managed in /admin) and every STORE homepage (per-store banners, managed by
 * the seller). The two have different owners and different link targets, but
 * they are the same component on screen, so they are the same component in
 * code — the alternative was two copies drifting apart on motion, focus
 * handling and aspect ratio.
 *
 * Everything theme-specific arrives as a class name, so the store version can
 * hand it the owner's palette (`skin`) while the marketplace hands it the
 * global one.
 */

/**
 * How long each banner holds before the carousel advances. Long enough to read
 * a promo, short enough that a second banner is discovered before the shopper
 * scrolls past.
 */
const BANNER_INTERVAL_MS = 6000

/**
 * What the carousel needs from a banner. Both the marketplace and the store
 * payloads already have this shape, so neither has to adapt.
 */
export interface CarouselBanner {
  id: string
  title: string | null
  imageUrl: string | null
  /** Null renders the banner as a plain image rather than a dead link. */
  href: string | null
  /** True only for an off-site link — opened in a new tab, safely. */
  external: boolean
}

/**
 * **Full-bleed, not banded.** A banner is artwork somebody chose; wrapping it
 * in the standard padded band would frame it in a colour they did not pick and
 * shrink it on exactly the screens it is meant to fill. It keeps the band's
 * bottom divider so the page rhythm survives, and nothing else.
 *
 * **One ratio at every screen size** — 16:5, from `bannerSpec.ts`, the same
 * contract quoted verbatim to uploaders. The banner is scaled by WIDTH, so its
 * height simply falls out of the viewport (1920 → 600, 1440 → 450, 390 → 122)
 * and the whole artwork stays visible on a phone exactly as on a monitor.
 * Pinning the ratio also keeps the page still: one that followed each upload
 * would make it jump as the carousel advances, and shift whatever is below it
 * down after the first image loads.
 *
 * Motion is opt-out: auto-advance stops for `prefers-reduced-motion`, while
 * the arrows, dots and swipe keep working, so the same markup serves both.
 */
export function BannerCarousel({
  banners,
  id,
  className = '',
  wellClassName = 'bg-surface-alt',
}: {
  banners: CarouselBanner[]
  id?: string
  /** Section chrome — divider and band tone, from the caller's palette. */
  className?: string
  /** The empty slot behind an image while it loads. */
  wellClassName?: string
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length

  // Clamp rather than reset: deleting the banner you were on should land you
  // on the new last one, not silently back at the first.
  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  )

  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (count < 2 || paused || reduced) return
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      BANNER_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [count, paused, reduced])

  const swipe = useSwipe(
    useCallback(
      (direction: 1 | -1) => {
        setIndex((i) => (((i + direction) % count) + count) % count)
      },
      [count],
    ),
  )

  if (count === 0) return null

  return (
    <section
      id={id}
      className={`scroll-mt-20 ${className}`}
      // Hovering to read a banner should not have it slide away mid-sentence;
      // the same guard covers a keyboard user tabbing into a link.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      {...swipe}
    >
      <div className="relative isolate overflow-hidden">
        {/* One track, translated — every slide stays in the DOM so a link is
            never removed from under a click that has already started. */}
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {banners.map((banner, i) => (
            <BannerSlide
              key={banner.id}
              banner={banner}
              wellClassName={wellClassName}
              // Only the visible slide is reachable; the rest would otherwise
              // be invisible tab stops.
              hidden={i !== safeIndex}
              eager={i === 0}
            />
          ))}
        </div>

        {count > 1 && (
          <>
            <BannerArrow side="left" onClick={() => go(safeIndex - 1)} />
            <BannerArrow side="right" onClick={() => go(safeIndex + 1)} />
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
              {banners.map((banner, i) => (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show banner ${i + 1} of ${count}`}
                  aria-current={i === safeIndex}
                  className={`h-2 rounded-pill border border-black/10 transition-all ${
                    i === safeIndex
                      ? 'w-6 bg-white'
                      : 'w-2 bg-white/60 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/** One slide — a single 16:5 image, scaled to the viewport width. */
function BannerSlide({
  banner,
  wellClassName,
  hidden,
  eager,
}: {
  banner: CarouselBanner
  wellClassName: string
  hidden: boolean
  eager: boolean
}) {
  const image = (
    <img
      src={banner.imageUrl ?? ''}
      alt={banner.title ?? ''}
      // The first banner is above the fold on every screen — lazy-loading it
      // would guarantee a blank strip on arrival.
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="h-full w-full object-cover"
    />
  )

  return (
    <div
      // The ratio comes from the shared contract quoted to uploaders, so what
      // they export is exactly what renders. No max-height: a cap would crop a
      // correctly-sized upload on a wide monitor.
      className={`${BANNER_FORMAT.aspect} w-full shrink-0 grow-0 basis-full ${wellClassName}`}
      aria-hidden={hidden}
      // Keeps a slide off the tab order without display:none, which would
      // break the translated track.
      inert={hidden}
    >
      {banner.href ? <BannerLink banner={banner}>{image}</BannerLink> : image}
    </div>
  )
}

/**
 * Internal destinations route through the SPA; an off-site banner gets a plain
 * anchor plus `noopener` — the address came from an uploader, not from us.
 */
function BannerLink({
  banner,
  children,
}: {
  banner: CarouselBanner
  children: React.ReactNode
}) {
  const className = 'block h-full w-full'
  if (banner.external) {
    return (
      <a
        href={banner.href ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    )
  }
  return (
    <Link to={banner.href ?? '#'} className={className}>
      {children}
    </Link>
  )
}

/**
 * Carousel arrow. Sits on the image rather than on the theme, so it is a
 * neutral scrim in both directions — no palette can be trusted to contrast
 * with an arbitrary photograph.
 */
function BannerArrow({
  side,
  onClick,
}: {
  side: 'left' | 'right'
  onClick: () => void
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous banner' : 'Next banner'}
      className={`absolute top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill border border-black/10 bg-white/85 text-black/70 transition hover:bg-white sm:flex ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}

/**
 * Whether the viewer asked for less motion. Read live rather than once, so
 * toggling the OS setting takes effect without a reload.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Horizontal swipe on touch. Deliberately tiny and pointer-event based — a
 * carousel library would be several kilobytes for one gesture, and the page
 * must not fight the browser's own vertical scrolling, so a drag that is
 * mostly vertical is ignored.
 */
function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = e.clientX - from.x
      const dy = e.clientY - from.y
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
      onSwipe(dx < 0 ? 1 : -1)
    },
  }
}
