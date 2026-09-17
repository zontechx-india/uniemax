import { useEffect, useRef, useState } from 'react'
import type { StoreThemeVars } from './storeTheme'

/**
 * The bridge between the Store Builder and the **real storefront** it shows
 * inside its preview frame.
 *
 * The builder's preview is not a mock-up: it is `/store/{slug}` itself, loaded
 * in an iframe with `?builder=1`. That is the only way a seller can trust what
 * they are looking at — the preview cannot drift from the shop because it *is*
 * the shop. What this module adds is the small amount of two-way talk a
 * preview needs and a plain page does not:
 *
 * | Direction        | Message   | What it does                              |
 * | ---------------- | --------- | ----------------------------------------- |
 * | builder → store  | `theme`   | paints an UNSAVED palette, live           |
 * | builder → store  | `refresh` | refetch after a save, without a reload    |
 * | builder → store  | `focus`   | scroll to a section and ring it            |
 * | store  → builder | `ready`   | the frame is up and listening              |
 * | store  → builder | `select`  | the seller clicked a section IN the preview|
 *
 * Everything here is inert outside the frame: `isBuilderPreview()` is false
 * for every real shopper, so the public storefront carries no builder
 * behaviour, no extra listeners and no extra markup.
 *
 * **Same-origin only.** The builder and the storefront are the same app on the
 * same host, so messages are posted to `window.parent` with the app's own
 * origin and every inbound message is checked against it — a page embedded by
 * anyone else simply never gets a handshake.
 */

/** Marks a message as ours in both directions. */
const CHANNEL = 'uniemax-store-builder'

/** Attribute the builder hit-tests against — put it on each section band. */
export const BUILDER_SECTION_ATTR = 'data-builder-section'

/** Class the bridge paints on the section the builder is editing. */
const FOCUS_CLASS = 'builder-focus'

/** What the builder sends the storefront. */
export type BuilderInboundBody =
  | { type: 'theme'; theme: StoreThemeVars | null }
  | { type: 'refresh' }
  | { type: 'focus'; key: string | null }

/** What the storefront sends back. */
export type BuilderOutboundBody =
  | { type: 'ready' }
  | { type: 'select'; key: string }

/** Stamped on the wire in both directions — the union is over the BODY, so
 *  a caller writes `{ type: 'focus', key }` and never repeats the channel. */
type Envelope<T> = T & { channel: typeof CHANNEL }

export type BuilderInbound = Envelope<BuilderInboundBody>
export type BuilderOutbound = Envelope<BuilderOutboundBody>

/** Post a message INTO a preview frame. Used by the builder side. */
export function postToPreview(
  frame: HTMLIFrameElement | null,
  message: BuilderInboundBody,
): void {
  frame?.contentWindow?.postMessage(
    { ...message, channel: CHANNEL },
    window.location.origin,
  )
}

/** Read a message coming OUT of a preview frame. Used by the builder side. */
export function readPreviewMessage(event: MessageEvent): BuilderOutbound | null {
  if (event.origin !== window.location.origin) return null
  const data = event.data as Partial<BuilderOutbound> | null
  if (!data || data.channel !== CHANNEL) return null
  return data.type === 'ready' || data.type === 'select'
    ? (data as BuilderOutbound)
    : null
}

/**
 * Is this document the builder's preview frame? Requires BOTH the flag and an
 * actual parent frame, so pasting `?builder=1` into the address bar of a real
 * storefront does nothing.
 */
export function isBuilderPreview(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.parent === window) return false
  } catch {
    return false // cross-origin parent — not ours
  }
  return new URLSearchParams(window.location.search).get('builder') === '1'
}

/**
 * Attributes for a section band, so the builder can hit-test a click and
 * scroll to a section. An empty object outside the preview — the public
 * storefront ships no builder markup.
 */
export function builderSectionProps(
  key: string,
): Record<string, string> | undefined {
  return isBuilderPreview() ? { [BUILDER_SECTION_ATTR]: key } : undefined
}

/**
 * Storefront side of the bridge — called once, by `PublicStoreLayout`.
 *
 * Returns the palette the page should paint with: the builder's unsaved draft
 * while one is in flight, otherwise `null` (meaning "use the store's saved
 * theme"). Also wires the click-to-edit hit-testing and the refresh event.
 */
export function useBuilderPreviewBridge(): StoreThemeVars | null {
  const [draftTheme, setDraftTheme] = useState<StoreThemeVars | null>(null)
  const active = useRef<Element | null>(null)

  useEffect(() => {
    if (!isBuilderPreview()) return

    const origin = window.location.origin
    const send = (message: BuilderOutboundBody) =>
      window.parent.postMessage({ ...message, channel: CHANNEL }, origin)

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return
      const data = event.data as Partial<BuilderInbound> | null
      if (!data || data.channel !== CHANNEL) return

      if (data.type === 'theme') {
        setDraftTheme(data.theme ?? null)
        return
      }
      if (data.type === 'refresh') {
        // Every page that loads its own data listens for this, so a save
        // repaints the preview in place instead of reloading the frame (which
        // would flash white and throw away the scroll position).
        window.dispatchEvent(new CustomEvent('uniemax:builder:refresh'))
        return
      }
      if (data.type === 'focus') {
        active.current?.classList.remove(FOCUS_CLASS)
        active.current = null
        if (!data.key) return
        const el = document.querySelector(
          `[${BUILDER_SECTION_ATTR}="${CSS.escape(data.key)}"]`,
        )
        if (!el) return
        active.current = el
        el.classList.add(FOCUS_CLASS)
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    /**
     * One delegated listener instead of a handler per section: the seller is
     * pointing at a *region*, and the capture phase means a click on a product
     * card selects the row it sits in rather than navigating away from the
     * preview.
     */
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        `[${BUILDER_SECTION_ATTR}]`,
      )
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      const key = target.getAttribute(BUILDER_SECTION_ATTR)
      if (key) send({ type: 'select', key })
    }

    window.addEventListener('message', onMessage)
    document.addEventListener('click', onClick, true)
    send({ type: 'ready' })

    return () => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('click', onClick, true)
      active.current?.classList.remove(FOCUS_CLASS)
    }
  }, [])

  return draftTheme
}

/**
 * Refetch this page's data when the builder says something was saved. A no-op
 * for every real visitor, so a public storefront never adds the listener.
 *
 * The callback is held in a ref so a caller can pass an inline closure without
 * re-subscribing on every render.
 */
export function useBuilderRefresh(reload: () => void): void {
  const latest = useRef(reload)
  latest.current = reload

  useEffect(() => {
    if (!isBuilderPreview()) return
    const handler = () => latest.current()
    window.addEventListener('uniemax:builder:refresh', handler)
    return () => window.removeEventListener('uniemax:builder:refresh', handler)
  }, [])
}
