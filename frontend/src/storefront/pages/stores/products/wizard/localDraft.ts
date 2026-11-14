/**
 * Work in progress the server cannot hold yet, kept on THIS device.
 *
 * Step 3's options (Colour: Red, Blue · Size: S, M) are only written to the
 * server on its last Continue — the server stores sellable variants, and a
 * variant needs a price. A seller who closed the wizard half-way ("Close —
 * your work is saved") came back to nothing. So the step keeps its draft
 * here on every change, restores it when the product is reopened, and clears
 * it once the server has the real thing. The step-1 answer ("one or many?")
 * is kept the same way.
 *
 * Storage can be missing (private mode, blocked site data): every call is
 * wrapped and the wizard simply works without it.
 */

const KEY = 'uniemax.productDraft.'

export function readLocalDraft<T>(productId: string, part: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${KEY}${part}.${productId}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeLocalDraft(productId: string, part: string, value: unknown): void {
  try {
    window.localStorage.setItem(`${KEY}${part}.${productId}`, JSON.stringify(value))
  } catch {
    // No storage — nothing to keep; the wizard still works.
  }
}

export function clearLocalDraft(productId: string, part: string): void {
  try {
    window.localStorage.removeItem(`${KEY}${part}.${productId}`)
  } catch {
    // Same as above.
  }
}
