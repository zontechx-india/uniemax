/**
 * The pals this app ships, each with its own loader so the bundler makes one
 * small chunk per pal (Boing ≈ 2 KB gzipped) and nothing else of the
 * library's 44 pals is ever downloaded.
 *
 * The engine (`piixpal/core`, ≈ 19 KB gzipped) must be running BEFORE a
 * pal's file runs: a pal file that finds no engine fetches one from a public
 * CDN, and we never want a third-party script on our pages.
 */
const PALS = {
  /** A coral jelly drop that hops along the top edge of its parent (a footer). */
  boing: () => import('piixpal/c/boing'),
} satisfies Record<string, () => Promise<unknown>>

export type PalName = keyof typeof PALS

let engine: Promise<unknown> | null = null
const ready = new Map<PalName, Promise<void>>()

/** Engine first, then the pal — each downloaded once per page load. */
export function loadPal(name: PalName): Promise<void> {
  let loading = ready.get(name)
  if (!loading) {
    engine ??= import('piixpal/core')
    loading = engine.then(PALS[name]).then(() => undefined)
    // A failed download (offline, deploy mid-visit) may be retried next time.
    loading.catch(() => {
      engine = null
      ready.delete(name)
    })
    ready.set(name, loading)
  }
  return loading
}
