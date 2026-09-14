import { useEffect, useRef, useState } from 'react'
import {
  BANNER_LINK_TYPES,
  adminApi,
  type BannerInput,
  type BannerLinkType,
  type BannerRow,
  type StoreRow,
} from '../features/adminApi'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../ui/primitives'
import {
  BANNER_ASPECT,
  BANNER_FORMAT,
  bannerSizeLabel,
  checkBannerImage,
  needsBannerCrop,
} from '../../storefront/features/stores/bannerSpec'
import { ImageEditDialog } from '../../shared/media/ImageEditDialog'

/**
 * Marketplace banners — the promo carousel at the top of the marketplace
 * homepage, which replaced the old hand-written hero. The platform team owns
 * it, so it lives here rather than in a seller's console; the per-store
 * banners a seller manages are a separate table on a separate page.
 *
 * A **grid of preview cards**: a banner is a picture, so the picture is the
 * row. Reordering is drag-and-drop with ←/→ buttons for keyboard and touch.
 * Every write returns the server's full list, so the page never merges a row
 * into local state.
 */

/** Mirrors MAX_BANNERS on the server, so Add stops before a 409 does. */
const MAX_BANNERS = 10

/** The server caps every admin list page at 100 — asking for more is a 400. */
const STORE_PICKER_PAGE_SIZE = 100

const LINK_LABEL: Record<BannerLinkType, string> = {
  NONE: 'No link',
  STORE: 'A store',
  URL: 'A web address',
}

export default function BannersPage() {
  const [banners, setBanners] = useState<BannerRow[] | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  /** A picked file that is not 16:5 yet — held until it is cropped. */
  const [cropping, setCropping] = useState<{
    file: File
    bannerId?: string
  } | null>(null)

  const addInput = useRef<HTMLInputElement>(null)

  const load = () => {
    setError(null)
    adminApi
      .listBanners()
      .then(setBanners)
      .catch((err: Error) => {
        setBanners([])
        setError(err.message)
      })
    // Destinations for the link picker, loaded SEPARATELY from the banners: it
    // only fills a dropdown, so a failure here must not blank the page the
    // admin actually came for. One page is plenty — a banner promotes a
    // notable shop, and the list is searchable by typing.
    adminApi
      .listStores({ pageSize: STORE_PICKER_PAGE_SIZE })
      .then((storeList) => setStores(storeList.items))
      .catch(() => setStores([]))
  }

  useEffect(load, [])

  /** One place to run a write: clears the error, applies the returned list. */
  const run = async (action: () => Promise<BannerRow[]>) => {
    setError(null)
    setBusy(true)
    try {
      setBanners(await action())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setUploadPct(null)
    }
  }

  /**
   * A picked file, measured. Already 16:5 → uploaded untouched, so a correctly
   * exported banner is never re-encoded. Anything else goes to the crop dialog
   * FIRST: a banner fills a fixed frame, so an off-ratio image has to lose
   * something, and the admin should be the one deciding what.
   */
  const pick = async (file: File, bannerId?: string) => {
    const [width, height] = await measure(file)
    setNotice(checkBannerImage(width, height))
    if (needsBannerCrop(width, height)) {
      setCropping(bannerId === undefined ? { file } : { file, bannerId })
      return
    }
    await send(file, file.name, bannerId)
  }

  /** The actual upload — a picked file, or the blob the crop dialog rendered. */
  const send = async (blob: Blob, filename: string, bannerId?: string) => {
    const onProgress = (fraction: number) =>
      setUploadPct(Math.round(fraction * 100))
    await run(() =>
      bannerId
        ? adminApi.replaceBannerImage(bannerId, blob, filename, onProgress)
        : adminApi.createBanner(blob, filename, {}, onProgress),
    )
  }

  /** Drop `dragged` in front of `target` (or last), then send the whole order. */
  const reorder = (draggedId: string, targetId: string | null) => {
    if (!banners || draggedId === targetId) return
    const without = banners.filter((b) => b.id !== draggedId)
    const moved = banners.find((b) => b.id === draggedId)
    if (!moved) return
    const at = targetId ? without.findIndex((b) => b.id === targetId) : -1
    without.splice(at === -1 ? without.length : at, 0, moved)
    setBanners(without) // optimistic — dragging must feel immediate
    void run(() => adminApi.reorderBanners(without.map((b) => b.id)))
  }

  /** Keyboard and touch reordering — drag alone is not an accessible control. */
  const move = (index: number, delta: number) => {
    if (!banners) return
    const to = index + delta
    if (to < 0 || to >= banners.length) return
    const next = [...banners]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item!)
    setBanners(next)
    void run(() => adminApi.reorderBanners(next.map((b) => b.id)))
  }

  const full = (banners?.length ?? 0) >= MAX_BANNERS

  return (
    <div className="space-y-4">
      <PageHeader
        title="Homepage banners"
        subtitle="The promo carousel at the top of the marketplace homepage. With more than one they rotate automatically, in the order below."
        actions={
          <>
            <input
              ref={addInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = '' // re-picking the same file must still fire
                if (file) void pick(file)
              }}
            />
            <Button
              variant="primary"
              disabled={busy || full}
              onClick={() => addInput.current?.click()}
            >
              Add banner
            </Button>
          </>
        }
      />

      <Card>
        <p className="text-sm font-medium text-fg">
          {bannerSizeLabel()} — one image, used on every screen
        </p>
        <p className="mt-1 text-xs text-muted">
          The banner keeps its {BANNER_FORMAT.ratio} shape everywhere and is
          scaled to the screen's width, so its height shrinks on smaller screens
          and the whole image always stays visible — nothing is cropped or
          letterboxed. On a 1920px monitor it is 600px tall, on a laptop about
          450px, and on a phone about 122px. Keep text large and near the
          centre, or it will be unreadable on a phone.
        </p>
        {uploadPct !== null && (
          <p className="mt-2 text-xs text-muted">Uploading… {uploadPct}%</p>
        )}
        {full && (
          <p className="mt-2 text-xs text-muted">
            {MAX_BANNERS} is the maximum — delete one to add another.
          </p>
        )}
        {notice && <p className="mt-2 text-xs font-medium text-fg">{notice}</p>}
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {banners === null ? (
        <Skeleton rows={6} />
      ) : banners.length === 0 ? (
        <EmptyState
          title="No banners yet"
          hint={`Add a ${bannerSizeLabel()} image and it appears at the top of the marketplace homepage. Until then the homepage opens on Shop by Category.`}
        />
      ) : (
        <ul
          className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          // A drop past the last card appends.
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId) reorder(dragId, null)
            setDragId(null)
            setOverId(null)
          }}
        >
          {banners.map((banner, index) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              index={index}
              total={banners.length}
              stores={stores}
              busy={busy}
              dragging={dragId === banner.id}
              over={overId === banner.id && dragId !== banner.id}
              onDragStart={() => setDragId(banner.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDragOver={() => setOverId(banner.id)}
              onDrop={() => {
                if (dragId) reorder(dragId, banner.id)
                setDragId(null)
                setOverId(null)
              }}
              onMove={(delta) => move(index, delta)}
              onPatch={(patch) => run(() => adminApi.updateBanner(banner.id, patch))}
              onReplaceImage={(file) => void pick(file, banner.id)}
              onDelete={() => {
                if (
                  window.confirm(
                    'Delete this banner? The image is removed for good, and it is live on the homepage.',
                  )
                ) {
                  void run(() => adminApi.deleteBanner(banner.id))
                }
              }}
            />
          ))}
        </ul>
      )}

      {/* Mandatory, not optional: the frame is fixed, so "use original" would
          just hand the crop back to the browser. */}
      {cropping && (
        <ImageEditDialog
          file={cropping.file}
          aspects={[{ label: BANNER_FORMAT.ratio, value: BANNER_ASPECT }]}
          allowOriginal={false}
          maxEdge={BANNER_FORMAT.width}
          title={`Crop to ${BANNER_FORMAT.ratio}`}
          confirmLabel="Use this crop"
          busy={busy}
          onCancel={() => setCropping(null)}
          onDone={(blob, filename) => {
            const target = cropping
            setCropping(null)
            void send(blob, filename, target.bannerId)
          }}
        />
      )}
    </div>
  )
}

/**
 * One card: the preview at the homepage's own ratio, then its controls.
 *
 * Dragging is armed by **holding the grip**, not by grabbing the card — a card
 * full of inputs that slides away when you try to select text would be
 * unusable.
 */
function BannerCard({
  banner,
  index,
  total,
  stores,
  busy,
  dragging,
  over,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onPatch,
  onReplaceImage,
  onDelete,
}: {
  banner: BannerRow
  index: number
  total: number
  stores: StoreRow[]
  busy: boolean
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
  onMove: (delta: number) => void
  onPatch: (patch: BannerInput) => void
  onReplaceImage: (file: File) => void
  onDelete: () => void
}) {
  const imageInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(banner.title ?? '')
  const [url, setUrl] = useState(
    banner.linkType === 'URL' ? (banner.linkValue ?? '') : '',
  )
  const [armed, setArmed] = useState(false)

  // The server is the source of truth: a rejected edit (or another admin) must
  // not leave an input showing something that was never saved.
  useEffect(() => setTitle(banner.title ?? ''), [banner.title])
  useEffect(() => {
    if (banner.linkType === 'URL') setUrl(banner.linkValue ?? '')
  }, [banner.linkType, banner.linkValue])

  return (
    <li
      draggable={armed && !busy}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation() // the list itself handles "dropped past the end"
        onDrop()
      }}
      className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
        over ? 'border-brand' : 'border-line'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      <div
        className={`group relative ${BANNER_FORMAT.aspect} w-full bg-surface-alt`}
      >
        {banner.imageUrl ? (
          <img
            src={banner.imageUrl}
            alt=""
            className={`h-full w-full object-cover ${
              banner.isActive ? '' : 'opacity-50 grayscale'
            }`}
          />
        ) : null}

        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          Replace image
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onReplaceImage(file)
          }}
        />

        {/* Above the replace overlay, so the handle stays grabbable. */}
        <span
          onPointerDown={() => setArmed(true)}
          onPointerUp={() => setArmed(false)}
          title="Drag to reorder"
          className="absolute left-2 top-2 z-10 cursor-grab rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white active:cursor-grabbing"
        >
          Drag
        </span>
        <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
          {index + 1} of {total}
        </span>
        {!banner.isActive && (
          <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Hidden
          </span>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              disabled={busy || index === 0}
              onClick={() => onMove(-1)}
              aria-label="Move banner earlier"
            >
              ←
            </Button>
            <Button
              variant="ghost"
              disabled={busy || index === total - 1}
              onClick={() => onMove(1)}
              aria-label="Move banner later"
            >
              →
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-fg">
              <input
                type="checkbox"
                checked={banner.isActive}
                disabled={busy}
                onChange={(e) => onPatch({ isActive: e.target.checked })}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Live
            </label>
            <Button variant="danger" disabled={busy} onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>

        <TextInput
          label="Title"
          value={title}
          placeholder="Festive sale"
          hint="Not shown on the banner — it labels this row and describes the image to screen readers."
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const next = title.trim()
            if (next !== (banner.title ?? '')) {
              onPatch({ title: next === '' ? null : next })
            }
          }}
        />

        <SelectInput
          label="When tapped, go to"
          value={banner.linkType}
          disabled={busy}
          options={BANNER_LINK_TYPES.map((type) => ({
            value: type,
            label: LINK_LABEL[type],
          }))}
          onChange={(e) => {
            // Switching kind clears the old destination — a store id would be
            // nonsense as a URL, and vice versa.
            onPatch({
              linkType: e.target.value as BannerLinkType,
              linkValue: null,
            })
          }}
        />

        {banner.linkType === 'STORE' && (
          <SelectInput
            label="Store"
            value={banner.linkValue ?? ''}
            disabled={busy}
            options={[
              { value: '', label: 'Pick a store…' },
              ...stores.map((store) => ({ value: store.id, label: store.name })),
            ]}
            onChange={(e) =>
              onPatch({ linkType: 'STORE', linkValue: e.target.value })
            }
          />
        )}

        {banner.linkType === 'URL' && (
          <TextInput
            label="Web address"
            type="url"
            value={url}
            disabled={busy}
            placeholder="https://example.com/sale"
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              const next = url.trim()
              if (next && next !== banner.linkValue) {
                onPatch({ linkType: 'URL', linkValue: next })
              }
            }}
          />
        )}

        {/* A link whose target is unpublished, suspended or deleted is stated
            plainly — the console showing a healthy row while the homepage
            renders a dead banner is the failure worth preventing. */}
        {banner.target?.missing && (
          <p className="text-xs font-semibold text-danger">
            {banner.target.label} is not visible to shoppers — this banner shows
            without a link.
          </p>
        )}
        {banner.linkType !== 'NONE' && !banner.linkValue && (
          <p className="text-xs text-muted">
            Pick a destination, or this banner stays unlinked.
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * An image's pixel dimensions, so the size check can talk about the actual
 * file. Resolves to 0×0 for anything the browser cannot decode; the caller
 * then says nothing rather than inventing a complaint.
 */
function measure(file: File): Promise<[number, number]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve([img.naturalWidth, img.naturalHeight])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve([0, 0])
    }
    img.src = url
  })
}
