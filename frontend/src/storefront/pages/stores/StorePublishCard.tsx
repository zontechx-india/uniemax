import { useEffect, useRef, useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { shareOrCopy } from '../../../shared/share'
import { publicStoreUrl, storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { ChatIcon, CheckIcon, EyeIcon, GlobeIcon, ShareIcon } from '../../layout/icons'
import { BlockerLinks, useGateBlockers } from './GateBlockers'
import { Link } from 'react-router-dom'
import { useStoreManageScope } from '../../features/stores/storeManageScope'

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
 * - Once live, **Share on WhatsApp** opens WhatsApp with a ready-made
 *   message + link — how most small Indian sellers reach their customers.
 */

/** wa.me link with a ready-to-send message announcing the shop. */
export function whatsAppShareUrl(storeName: string, url: string): string {
  const text = `Hi! ${storeName} is now online. See our products and order here: ${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
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
  const blockers = useGateBlockers(store, 'PUBLISH')
  const blocked = !store.isPublished && !store.readiness.gates.PUBLISH.allowed
  const { storePath } = useStoreManageScope()

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
        {/* Phone: this card stacks ABOVE every section, so there it is one
            row — status, view, share, publish — instead of a block that
            pushed the page itself below the fold. The full card is lg+. */}
        <span className="ml-auto flex items-center gap-1 lg:hidden">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-fg transition hover:bg-surface-alt"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            {store.isPublished ? 'View' : 'Preview'}
          </a>
          <button
            type="button"
            onClick={share}
            aria-label={copied ? 'Link copied' : 'Share store link'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg transition hover:bg-surface-alt"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-success" />
            ) : (
              <ShareIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </span>
        {store.isPublished ? (
          <button
            type="button"
            onClick={togglePublished}
            disabled={busy}
            className="h-9 rounded-md px-3 text-xs font-semibold text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Unpublish'}
          </button>
        ) : (
          <Button
            size="sm"
            onClick={togglePublished}
            loading={busy}
            disabled={blocked}
          >
            Publish store
          </Button>
        )}
      </div>

      {blocked && (
        <Link
          to={storePath(store.slug)}
          className="mt-1 block text-right text-[11px] font-medium text-brand lg:hidden"
        >
          What&apos;s still needed?
        </Link>
      )}
      {error && (
        <p className="mt-1 text-[11px] leading-4 text-danger lg:hidden">{error}</p>
      )}

      <div className="hidden lg:block">
        {/* Naming the blockers beats a disabled button with no explanation —
            the seller can act without hunting for what is missing. */}
        {blocked ? (
          <div className="mt-2 rounded-md border border-line bg-surface-alt px-2.5 py-2">
            <p className="mb-1.5 text-xs font-medium text-fg">Before publishing, add:</p>
            <BlockerLinks blockers={blockers} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {store.isPublished
              ? 'Your shop is live! Send the link to your customers so they can order.'
              : 'Preview your shop with the link below, then tap Publish so customers can see it.'}
          </p>
        )}

        <div className="mt-3 space-y-2">
          {store.isPublished && (
            <a
              href={whatsAppShareUrl(store.name, shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#25D366] text-sm font-semibold text-white transition hover:opacity-90"
            >
              <ChatIcon className="h-4 w-4" />
              Share on WhatsApp
            </a>
          )}
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line text-xs font-semibold text-fg transition hover:bg-surface-alt"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              {store.isPublished ? 'View Store' : 'Preview'}
            </a>
            <button
              type="button"
              onClick={share}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line text-xs font-semibold text-fg transition hover:bg-surface-alt"
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
    </div>
  )
}

/**
 * Shown above the product list while the shop is NOT published: a seller
 * who just "published" a product otherwise believes customers can see it.
 * One tap publishes when nothing blocks it; otherwise it says what is left.
 */
export function ShopNotLiveNudge({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockers = useGateBlockers(store, 'PUBLISH')
  if (store.isPublished) return null
  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      onStoreChange(await storesApi.setPublished(store.id, true))
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <p className="font-semibold text-fg">Customers can't see your shop yet</p>
      {store.readiness.gates.PUBLISH.allowed ? (
        <>
          <p className="mt-0.5 text-muted">
            Your shop is not published. Publish it to start taking orders.
          </p>
          <Button
            size="md"
            className="mt-2"
            loading={busy}
            onClick={() => void publish()}
          >
            Publish my shop
          </Button>
        </>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted">Before you can publish, add:</span>
          <BlockerLinks blockers={blockers} />
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
