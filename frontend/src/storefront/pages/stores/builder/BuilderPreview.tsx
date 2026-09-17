import { useEffect, useRef, useState } from 'react'
import {
  postToPreview,
  readPreviewMessage,
} from '../../../features/publicStore/builderBridge'
import type { StoreThemeVars } from '../../../features/publicStore/storeTheme'

/**
 * The live preview: the seller's **actual storefront**, in a frame.
 *
 * Not a mock-up and not a sample shop — `/store/{slug}` itself, with the real
 * products, the real categories, the real banners and the real footer. A
 * preview that could disagree with the shop would be worse than no preview,
 * so there is deliberately nothing here that renders storefront markup.
 *
 * **Scaled, not squashed.** The frame is always laid out at the full logical
 * width of the device being previewed (1440 / 834 / 390 CSS pixels) and then
 * scaled down with a transform to fit whatever room the panel has left. That
 * is the difference between "your shop at desktop width, smaller" and "your
 * shop in a narrow window", which would show the seller the tablet layout and
 * call it desktop.
 */

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile'

/** Logical viewport width per device — what the storefront's breakpoints see. */
const DEVICE_WIDTH: Record<PreviewDevice, number> = {
  desktop: 1440,
  tablet: 834,
  mobile: 390,
}

/** Tall enough that the frame always has page below the fold to scroll into. */
const DEVICE_HEIGHT: Record<PreviewDevice, number> = {
  desktop: 900,
  tablet: 1112,
  mobile: 844,
}

export function BuilderPreview({
  slug,
  device,
  draftTheme,
  focusKey,
  refreshToken,
  onSelect,
}: {
  slug: string
  device: PreviewDevice
  /** Colors the seller has not saved yet, painted live. Null = the saved ones. */
  draftTheme: StoreThemeVars | null
  /** The section the editor is open on — ringed and scrolled to in the frame. */
  focusKey: string | null
  /** Bumped after every save; the frame refetches without reloading. */
  refreshToken: number
  /** The seller clicked a section inside the preview. */
  onSelect: (key: string) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  /**
   * Counts handshakes rather than recording a boolean.
   *
   * Nothing may be posted into a document that is not listening yet, and a
   * frame that reloads has to be told everything again. A counter does both:
   * it is falsy until the first `ready`, and because the send effects depend
   * on it, every later `ready` re-sends the current draft. A boolean could
   * not — the second handshake would not change it, and the frame would come
   * back showing the saved palette while the seller was still editing.
   */
  const [readyCount, setReadyCount] = useState(0)
  const ready = readyCount > 0

  const width = DEVICE_WIDTH[device]
  const height = DEVICE_HEIGHT[device]

  // --- fit the frame to the room the panel left it -------------------------
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const available = el.clientWidth
      // Never scale UP: a phone preview blown to 2x on a wide monitor looks
      // like a rendering bug, not a phone.
      setScale(Math.min(1, available / width))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  // --- messages out of the frame -------------------------------------------
  // Held in a ref so the caller can pass an inline closure without this
  // listener being torn down and re-attached on every render.
  const select = useRef(onSelect)
  select.current = onSelect

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Ignore anything that is not this frame talking — several previews
      // could exist, and other embeds certainly could.
      if (event.source !== frame.current?.contentWindow) return
      const message = readPreviewMessage(event)
      if (!message) return
      if (message.type === 'ready') setReadyCount((n) => n + 1)
      if (message.type === 'select') select.current(message.key)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // --- messages into the frame ---------------------------------------------
  // Each of these re-sends on `ready` as well as on its own value, so a frame
  // that reloads (device change, navigation inside the preview) comes back
  // holding the draft the seller is in the middle of.
  useEffect(() => {
    if (ready) postToPreview(frame.current, { type: 'theme', theme: draftTheme })
  }, [ready, readyCount, draftTheme])

  useEffect(() => {
    if (ready && refreshToken > 0) {
      postToPreview(frame.current, { type: 'refresh' })
    }
  }, [ready, refreshToken])

  useEffect(() => {
    if (ready) postToPreview(frame.current, { type: 'focus', key: focusKey })
  }, [ready, readyCount, focusKey])

  return (
    <div
      ref={box}
      className="flex min-w-0 flex-1 justify-center overflow-hidden"
    >
      <div
        // The scaled frame still occupies its FULL height in the layout, so
        // the wrapper is sized to the scaled result — otherwise a 900px frame
        // at 0.55 would reserve 900px of column and leave a gap below it.
        style={{ width: width * scale, height: height * scale }}
        className="shrink-0"
      >
        <iframe
          ref={frame}
          // `?builder=1` is what switches the storefront's bridge on; without
          // it (and without a parent frame) the same page is an ordinary shop.
          src={`/store/${slug}?builder=1`}
          title="Store preview"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className={`border bg-bg border-line ${
            device === 'mobile' ? 'rounded-[1.75rem]' : 'rounded-lg'
          }`}
        />
      </div>
    </div>
  )
}
