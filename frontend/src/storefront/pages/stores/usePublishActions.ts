import { useEffect, useRef, useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { shareOrCopy } from '../../../shared/share'
import { publicStoreUrl, storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { showToast } from './ui/Toast'

/**
 * Publish / take-offline / share, as one piece of state shared by the two
 * places a seller does it: the desktop sidebar card (`StorePublishCard`) and
 * the phone Share sheet (`StoreShareSheet`).
 *
 * Taking a live shop offline is ONE tap away from the share buttons and is
 * the most damaging thing on the panel — buyers mid-checkout hit a dead page
 * — so it is a request (`askUnpublish`) the caller confirms in a sheet, not
 * an immediate toggle. Publishing needs no confirm: it is what the seller is
 * working towards, and the server refuses it while anything blocks it.
 */
export function usePublishActions(store: Store, onStoreChange: (store: Store) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const shareUrl = publicStoreUrl(store.slug)
  /** Mirrors the publish endpoint's own check; unpublishing is never blocked. */
  const blocked = !store.isPublished && !store.readiness.gates.PUBLISH.allowed

  const setPublished = async (next: boolean) => {
    setError(null)
    setBusy(true)
    try {
      onStoreChange(await storesApi.setPublished(store.id, next))
      setConfirmingUnpublish(false)
      showToast(next ? 'Your shop is live' : 'Your shop is offline')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    setError(null)
    const outcome = await shareOrCopy({ title: store.name, url: shareUrl })
    if (outcome === 'copied') {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return {
    shareUrl,
    blocked,
    busy,
    error,
    copied,
    share,
    publish: () => void setPublished(true),
    /** Opens the "Take your shop offline?" confirm. */
    askUnpublish: () => setConfirmingUnpublish(true),
    confirmingUnpublish,
    confirmUnpublish: () => void setPublished(false),
    cancelUnpublish: () => setConfirmingUnpublish(false),
  }
}

/** wa.me link with a ready-to-send message announcing the shop. */
export function whatsAppShareUrl(storeName: string, url: string): string {
  const text = `Hi! ${storeName} is now online. See our products and order here: ${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
