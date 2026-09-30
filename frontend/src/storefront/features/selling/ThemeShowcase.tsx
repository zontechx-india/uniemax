import { useEffect, useState } from 'react'
import { CheckIcon } from '../../layout/icons'
import { DEMO_STORES } from './demoStores'
import { StorePhone } from './StorePhone'
import { useInView } from './useInView'

/** How long each example store holds while the picker plays by itself. */
const AUTOPLAY_MS = 3200

/** What the Store Builder actually lets a seller change — nothing more. */
const CUSTOMISE = [
  'Your logo, colours and banners',
  'Homepage sections you can reorder, rename or hide',
  'A live preview on phone, tablet and desktop',
  'A footer with your locations, social links and policies',
] as const

/**
 * "Make it yours" — the same storefront re-skinned for five kinds of
 * business. Tapping a kind recolors the phone through the real `storeVars()`.
 *
 * It plays by itself while on screen (so a visitor who only scrolls still
 * sees the point), and stops for good the moment they pick one — or never
 * starts under reduced motion.
 */
export function ThemeShowcase() {
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState(false)
  const [reduceMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const [phoneRef, onScreen] = useInView<HTMLDivElement>({ threshold: 0.35 })

  useEffect(() => {
    if (picked || reduceMotion || !onScreen) return
    const timer = window.setInterval(
      () => setActive((i) => (i + 1) % DEMO_STORES.length),
      AUTOPLAY_MS,
    )
    return () => window.clearInterval(timer)
  }, [picked, reduceMotion, onScreen])

  const store = DEMO_STORES[active]!

  // Three blocks, so a phone reads intro → picker → PHONE → list (a tap
  // recolors a phone that is on screen), while from `lg` the phone stands
  // beside the intro and list, spanning both rows.
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-8">
      <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
        <p className="text-sm font-semibold text-brand">Make it yours</p>
        <h2 className="mt-3 font-heading text-3xl font-extrabold leading-[1.1] tracking-tight text-fg sm:text-4xl lg:text-5xl">
          A store that looks like your brand
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Every store starts with a complete, ready-to-sell homepage. Make it
          yours in the Store Builder — or publish it just as it is.
        </p>

        <div
          role="group"
          aria-label="Preview a kind of store"
          className="mt-8 flex flex-wrap gap-2"
        >
          {DEMO_STORES.map((demo, index) => {
            const on = index === active
            return (
              <button
                key={demo.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked(true)
                  setActive(index)
                }}
                className={`inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition ${
                  on
                    ? 'border-fg bg-surface text-fg shadow-floating'
                    : 'border-line bg-surface/60 text-muted hover:border-fg/40 hover:text-fg'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: demo.theme.primaryColor }}
                />
                {demo.kind}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={phoneRef}
        className="relative flex justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center"
      >
        {/* A soft pool of the store's own color behind the phone — a masked
            fill rather than a blur filter, which is costly on low-end phones
            and would re-rasterize on every color change. */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 opacity-30 transition-colors duration-700"
          style={{
            backgroundColor: store.theme.primaryColor,
            maskImage: 'radial-gradient(circle, #000 0%, transparent 65%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 65%)',
          }}
        />
        <StorePhone store={store} className="relative" />
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:self-start">
        {CUSTOMISE.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-fg">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <CheckIcon className="h-3 w-3" />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
