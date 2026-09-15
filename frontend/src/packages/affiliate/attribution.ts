import { ATTRIBUTION_STORAGE_KEY } from './config'

/**
 * Where the browser keeps the attribution token from /a/:token until checkout.
 * One token per store; the server decides whether it is still valid. Cleared
 * once an order uses it — one click credits one order.
 */
type Stored = Record<string, { ref: string; expiresAt: string }>

function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}

function write(all: Stored) {
  try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Private mode or storage full — the sale simply goes unattributed.
  }
}

export function saveAttribution(storeSlug: string, ref: string, expiresAt: string) {
  write({ ...read(), [storeSlug]: { ref, expiresAt } })
}

export function getAttribution(storeSlug: string): string | null {
  const entry = read()[storeSlug]
  if (!entry) return null
  if (new Date(entry.expiresAt) < new Date()) {
    clearAttribution(storeSlug)
    return null
  }
  return entry.ref
}

export function clearAttribution(storeSlug: string) {
  const all = read()
  if (!(storeSlug in all)) return
  delete all[storeSlug]
  write(all)
}
