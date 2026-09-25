import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { publicStoreUrl, storesApi } from '../../../features/stores/storesApi'
import type { Store } from '../../../features/stores/storesApi'
import {
  ArrowLeftIcon,
  CheckIcon,
  ExternalLinkIcon,
  StoreIcon,
} from '../../../layout/icons'
import type { PreviewDevice } from './BuilderPreview'
import { BlockerLinks, useGateBlockers } from '../GateBlockers'

/**
 * The builder's top bar: where you are, what it looks like on, whether your
 * work is safe, and the one button that puts the shop in front of customers.
 *
 * Saving and publishing are kept visibly apart. Everything in the builder
 * saves itself as it is changed — that is what the status text reports — while
 * **Publish** is a separate, deliberate act that decides whether the world can
 * see any of it. Conflating the two is how sellers end up either afraid to
 * touch anything or surprised that their shop went live.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const DEVICES: { id: PreviewDevice; label: string }[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
]

export function BuilderHeader({
  store,
  onStoreChange,
  backTo,
  device,
  onDeviceChange,
  saveState,
  saveError,
}: {
  store: Store
  onStoreChange: (store: Store) => void
  /** The store's management home — where the back arrow goes. */
  backTo: string
  device: PreviewDevice
  onDeviceChange: (device: PreviewDevice) => void
  saveState: SaveState
  saveError: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  /**
   * What stops this store going live, straight from the server's own
   * evaluation — the same object the publish endpoint checks, so the button is
   * disabled for exactly the reasons a request would be rejected. Unpublishing
   * is never blocked: a seller must always be able to take their shop down.
   */
  const gate = store.readiness.gates.PUBLISH
  const blocked = !store.isPublished && !gate.allowed

  /** Each blocker as a link to the screen that fixes it. */
  const blockers = useGateBlockers(store, 'PUBLISH')

  const togglePublished = async () => {
    setPublishError(null)
    setBusy(true)
    try {
      onStoreChange(await storesApi.setPublished(store.id, !store.isPublished))
    } catch (err) {
      setPublishError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    // Sticky below `lg`, where the page itself scrolls; inside the desktop
    // workbench it is simply the top row of a fixed frame.
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <Link
          to={backTo}
          title={`Back to ${store.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span className="sr-only">Back to {store.name}</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2.5">
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
              <StoreIcon className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">
              Store Builder
            </span>
            <span className="block truncate text-xs text-muted">
              {store.name}
            </span>
          </span>
        </div>

        {/* The device switch is the centre of gravity on a wide screen and
            simply absent on a narrow one, where there is no preview beside the
            controls to switch. */}
        <div className="mx-auto hidden lg:block">
          <div
            role="group"
            aria-label="Preview size"
            className="flex rounded-md border border-line p-0.5"
          >
            {DEVICES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onDeviceChange(id)}
                aria-pressed={device === id}
                className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                  device === id
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SaveStatus state={saveState} error={saveError} />

          <a
            href={publicStoreUrl(store.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-alt"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {store.isPublished ? 'View store' : 'Preview store'}
            </span>
          </a>

          {store.isPublished ? (
            <button
              type="button"
              onClick={togglePublished}
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-alt disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
              {busy ? 'Saving…' : 'Published'}
            </button>
          ) : (
            <Button
              variant="rise"
              size="sm"
              onClick={togglePublished}
              disabled={busy || blocked}
              title={
                blocked ? `Still needed: ${gate.blockers.join(', ')}` : undefined
              }
            >
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {/* A disabled Publish with no explanation is the most frustrating
          control in a dashboard, so the reasons are on screen and each one is
          a link to the screen that fixes it. */}
      {blocked && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-pending-soft px-3 py-2 text-xs sm:px-4">
          <span className="font-semibold text-fg">
            Almost ready to publish.
          </span>
          <span className="text-muted">Still needed:</span>
          <BlockerLinks blockers={blockers} />
        </div>
      )}

      {publishError && (
        <p className="border-t border-line bg-danger-soft px-3 py-2 text-xs font-medium text-danger sm:px-4">
          {publishError}
        </p>
      )}
    </header>
  )
}

/**
 * "Saved" rather than a Save button, because the builder has no unsaved state
 * to lose — but the seller still has to be *told* that, or they will hunt for
 * a button that does not exist.
 */
function SaveStatus({
  state,
  error,
}: {
  state: SaveState
  error: string | null
}) {
  if (state === 'error') {
    return (
      <span
        role="status"
        title={error ?? undefined}
        className="hidden max-w-[16rem] truncate text-xs font-semibold text-danger sm:inline"
      >
        Couldn&rsquo;t save — {error}
      </span>
    )
  }
  if (state === 'saving') {
    return (
      <span role="status" className="hidden text-xs text-muted sm:inline">
        Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span
        role="status"
        className="hidden items-center gap-1 text-xs text-muted sm:inline-flex"
      >
        <CheckIcon className="h-3.5 w-3.5 text-success" />
        Saved
      </span>
    )
  }
  return null
}
