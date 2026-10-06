import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../shared/ui/Dialog'
import { storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import {
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  GlobeIcon,
  QrCodeIcon,
  ShareIcon,
} from '../../layout/icons'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import { BlockerLinks, useGateBlockers } from './GateBlockers'
import { usePublishActions, whatsAppShareUrl } from './usePublishActions'
import { StatusPill } from './ui/StatusPill'
import { WhatsAppShareLink } from './ui/WhatsAppShareLink'

/**
 * Publish & share — in two frames over ONE body (`ShareActions`):
 *
 * - **Desktop**: `StorePublishCard`, the foot of the section sidebar.
 * - **Phone**: `StoreShareSheet`, opened by the Share / Publish button in the
 *   store strip at the top of every section. (The old phone version was a
 *   cramped row of 36px icons; the WhatsApp button — how most small sellers
 *   here reach buyers — was desktop-only.)
 *
 * What the body says depends on where the shop is:
 *   - **Not live, something missing** → what to add, each a link to its fix.
 *   - **Not live, ready** → one big **Publish my shop**.
 *   - **Live** → **Share on WhatsApp** first, then copy / view, and a quiet
 *     "Take shop offline" that asks before it does anything.
 *
 * Unpublished shops 404 for everyone except the signed-in owner, who gets a
 * draft preview at the same URL — so "Preview" is safe to offer before launch.
 */

function ShareActions({
  store,
  onStoreChange,
  onNavigate,
  compact = false,
}: {
  store: Store
  onStoreChange: (store: Store) => void
  /** Called when a blocker link navigates away (closes the phone sheet). */
  onNavigate?: () => void
  /** The 264px desktop column: smaller secondary buttons that fit one line. */
  compact?: boolean
}) {
  const actions = usePublishActions(store, onStoreChange)
  const blockers = useGateBlockers(store, 'PUBLISH')
  const { storePath, hiddenSections } = useStoreManageScope()
  const { shareUrl, blocked, copied } = actions

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {store.isPublished ? (
          <StatusPill tone="success">Live</StatusPill>
        ) : (
          <StatusPill tone="pending">Not live yet</StatusPill>
        )}
        <p className="min-w-0 text-hint text-muted">
          {store.isPublished
            ? 'Customers can see your shop and order.'
            : 'Only you can see your shop for now.'}
        </p>
      </div>

      {/* Naming the blockers beats a disabled button with no explanation. */}
      {blocked ? (
        <div className="rounded-xl bg-pending-soft px-3 py-2.5">
          <p className="mb-2 text-sm font-semibold text-fg">
            Before customers can see your shop, add:
          </p>
          <div onClick={onNavigate}>
            <BlockerLinks blockers={blockers} />
          </div>
        </div>
      ) : (
        !store.isPublished && (
          <Button
            variant="primary"
            size="lg"
            full
            loading={actions.busy}
            onClick={actions.publish}
          >
            {actions.busy ? 'Publishing…' : 'Publish my shop'}
          </Button>
        )
      )}

      {store.isPublished && (
        <WhatsAppShareLink href={whatsAppShareUrl(store.name, shareUrl)} />
      )}

      {/* The Share Kit (QR cards for Instagram & WhatsApp). Absolute path:
          this panel also opens from the My shops list, where a relative
          link would resolve against /mystores. Live shops only — before
          launch "Publish my shop" is the one thing to do here. */}
      {store.isPublished && !hiddenSections.includes('share') && (
        <Link
          to={`${storePath(store.slug)}/share`}
          onClick={onNavigate}
          className="share-kit-cta flex h-field w-full items-center justify-center gap-2 rounded-md text-base font-bold"
        >
          <QrCodeIcon className="h-5 w-5" />
          Share your store
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}

      <a
        href={shareUrl}
        target="_blank"
        rel="noreferrer"
        className="glass-inset flex min-h-tap items-center gap-2 rounded-md px-3 text-hint text-muted transition hover:text-fg"
      >
        <GlobeIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{shareUrl.replace(/^https?:\/\//, '')}</span>
      </a>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void actions.share()}
          className={buttonClass({
            variant: 'secondary',
            size: compact ? 'sm' : 'md',
            full: true,
            className: 'whitespace-nowrap',
          })}
        >
          {copied ? <CheckIcon className="h-4 w-4" /> : <ShareIcon className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({
            variant: 'secondary',
            size: compact ? 'sm' : 'md',
            full: true,
            className: 'whitespace-nowrap',
          })}
        >
          <EyeIcon className="h-4 w-4" />
          {store.isPublished ? 'View shop' : 'Preview'}
        </a>
      </div>

      {actions.error && (
        <p role="alert" className="text-hint font-medium text-danger">
          {actions.error}
        </p>
      )}

      {store.isPublished && (
        <button
          type="button"
          onClick={actions.askUnpublish}
          className="flex min-h-tap w-full items-center justify-center rounded-md text-sm font-semibold text-muted transition hover:bg-fg/5 hover:text-danger"
        >
          Take shop offline
        </button>
      )}

      <ConfirmDialog
        open={actions.confirmingUnpublish}
        title="Take your shop offline?"
        description="Customers will not be able to see your shop or place orders until you publish it again. Your products and orders are kept."
        confirmLabel="Take offline"
        cancelLabel="Keep it live"
        busy={actions.busy}
        onConfirm={actions.confirmUnpublish}
        onCancel={actions.cancelUnpublish}
      />
    </div>
  )
}

/** Desktop: the publish & share block at the foot of the section sidebar. */
export function StorePublishCard({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  return (
    <div className="border-t border-line p-4">
      <ShareActions store={store} onStoreChange={onStoreChange} compact />
    </div>
  )
}

/** Phone: the same panel as a bottom sheet, opened from the store strip. */
export function StoreShareSheet({
  open,
  store,
  onStoreChange,
  onClose,
}: {
  open: boolean
  store: Store
  onStoreChange: (store: Store) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      title={store.isPublished ? 'Share your shop' : 'Publish your shop'}
      subtitle={store.name}
      onClose={onClose}
    >
      <ShareActions store={store} onStoreChange={onStoreChange} onNavigate={onClose} />
    </Dialog>
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
