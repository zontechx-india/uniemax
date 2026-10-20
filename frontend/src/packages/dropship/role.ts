import { useEffect, useState } from 'react'
import { dropshipApi } from './api'
import type { StoreRole } from './api'

/**
 * Whether the supplier screens exist at all (the backend flag, D-30) and what
 * one store is to them. Cached per store so the nav, the mobile nav and the
 * layout share one request; `refreshDropshipRole` drops the cache after
 * something that changes it (a supplier joining, a first invite).
 */

export interface DropshipRole extends StoreRole {
  enabled: true
}

let enabled: Promise<boolean> | null = null
const roles = new Map<string, Promise<DropshipRole | null>>()
const listeners = new Set<() => void>()

export function isEnabled(): Promise<boolean> {
  enabled ??= dropshipApi.status().then(
    () => true,
    () => false,
  )
  return enabled
}

function load(storeRef: string): Promise<DropshipRole | null> {
  let hit = roles.get(storeRef)
  if (!hit) {
    hit = isEnabled().then(async (on) => {
      if (!on) return null
      try {
        return { enabled: true as const, ...(await dropshipApi.role(storeRef)) }
      } catch {
        return null
      }
    })
    roles.set(storeRef, hit)
  }
  return hit
}

export function refreshDropshipRole(storeRef?: string) {
  if (storeRef) roles.delete(storeRef)
  else roles.clear()
  listeners.forEach((fn) => fn())
}

/** `null` while loading, when the package is off, or when `storeRef` is null (admin view). */
export function useDropshipRole(storeRef: string | null | undefined): DropshipRole | null {
  const [role, setRole] = useState<DropshipRole | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const bump = () => setNonce((n) => n + 1)
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])

  useEffect(() => {
    let live = true
    if (!storeRef) {
      setRole(null)
      return
    }
    load(storeRef).then((r) => {
      if (live) setRole(r)
    })
    return () => {
      live = false
    }
  }, [storeRef, nonce])

  return role
}
