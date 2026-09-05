import { useEffect, useRef, useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { shareOrCopy } from '../../../shared/share'
import { publicStoreUrl, storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { CheckIcon, EyeIcon, GlobeIcon, ShareIcon } from '../../layout/icons'

/**
 * Publish & share panel shown on every store-management section (left card).
 *
 * - Publish/Unpublish toggles the store's public page. Only published
 *   stores are reachable by customers — unpublished ones 404 for everyone
 *   except the signed-in owner, who gets a **draft preview** at the same URL.
 * - Preview opens the storefront in a new tab (labelled "View Store" once
 *   published, since it is then simply the live page).
 * - Share Store copies the store's public URL (/store/{slug}) so the owner
 *   can hand it straight to customers.
 */
export function StorePublishCard({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const shareUrl = publicStoreUrl(store.slug)

  /**
   * What stops this store going live, straight from the server's evaluation —
   * the same object the publish endpoint checks, so the button is disabled
   * for exactly the reasons a request would have been rejected. Unpublishing
   * is never blocked: a seller must always be able to take their shop down.
   */
  const publishGate = store.readiness.gates.PUBLISH
  const blocked = !store.isPublished && !publishGate.allowed

  const togglePublished = async () => {
    setError(null)
    setBusy(true)
    try {
      onStoreChange(await storesApi.setPublished(store.id, !store.isPublished))
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

  return (
    <div className="border-t border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <span
            className={`h-2 w-2 rounded-full ${
              store.isPublished ? 'bg-success' : 'bg-line'
            }`}
          />
          {store.isPublished ? 'Published' : 'Not published'}
        </span>
        <button
          type="button"
          onClick={togglePublished}
          disabled={busy || blocked}
          title={
            blocked
              ? `Still needed: ${publishGate.blockers.join(', ')}`
              : undefined
          }
          className={`h-8 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed ${
            store.isPublished
              ? 'bg-surface-alt text-fg hover:bg-line'
              : blocked
                ? 'bg-line text-muted'
                : 'bg-success text-white shadow-floating hover:bg-success/90'
          }`}
        >
          {busy ? 'Saving…' : store.isPublished ? 'Unpublish' : 'Publish'}
        </button>
      </div>

      {/* Naming the blockers beats a disabled button with no explanation —
          the seller can act without hunting for what is missing. */}
      {blocked ? (
        <div className="mt-2 rounded-md border border-line bg-surface-alt px-2.5 py-2">
          <p className="text-xs font-medium text-fg">Before publishing, add:</p>
          <ul className="mt-1 space-y-0.5">
            {publishGate.blockers.map((blocker) => (
              <li key={blocker} className="flex gap-1.5 text-xs text-muted">
                <span aria-hidden>·</span>
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {store.isPublished
            ? 'Your store is live — customers can browse it at the link below.'
            : 'Open the link below to preview your store, and publish it when it looks right.'}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md bg-surface-alt px-3 py-2 text-xs text-muted transition hover:bg-line hover:text-fg"
        >
          <GlobeIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate">{shareUrl.replace(/^https?:\/\//, '')}</span>
        </a>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line text-xs font-semibold text-fg transition hover:bg-surface-alt"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            {store.isPublished ? 'View Store' : 'Preview'}
          </a>
          <button
            type="button"
            onClick={share}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line text-xs font-semibold text-fg transition hover:bg-surface-alt"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-success" />
                Link copied!
              </>
            ) : (
              <>
                <ShareIcon className="h-3.5 w-3.5" />
                Share Store
              </>
            )}
          </button>
        </div>

        {!store.isPublished && (
          <p className="text-[11px] leading-4 text-warning">
            Until you publish, the link is a private draft preview — only you
            can open it.
          </p>
        )}
        {error && <p className="text-[11px] leading-4 text-danger">{error}</p>}
      </div>
    </div>
  )
}
