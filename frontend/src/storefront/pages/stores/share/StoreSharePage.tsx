import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../../shared/ui/Button'
import { fieldClass } from '../../../../shared/ui/field'
import { ErrorNote, InfoNote } from '../../../../shared/ui/form'
import { ErrorState, Skeleton } from '../../../../shared/ui/states'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { useMediaQuery } from '../../../../shared/useMediaQuery'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { cardBackground } from '../../../features/shareKit/shareCard'
import type { ShareFormat, ShareTemplate } from '../../../features/shareKit/shareCard'
import { PATTERNS, drawPattern } from '../../../features/shareKit/patterns'
import type { SharePattern } from '../../../features/shareKit/patterns'
import type { CardPalette } from '../../../features/shareKit/palette'
import type { QrStyle } from '../../../features/shareKit/qr'
import { whatsAppStoreMessageUrl } from '../../../features/shareKit/share'
import {
  ChatIcon,
  CheckIcon,
  DownloadIcon,
  GlobeIcon,
  LinkIcon,
  QrCodeIcon,
  ShareIcon,
  StoreIcon,
} from '../../../layout/icons'
import { BigSwitch } from '../ui/BigSwitch'
import { PageHeader } from '../ui/PageHeader'
import { CAPTION_MAX, CAPTION_PRESETS, productCover, useShareKit } from './useShareKit'

/**
 * Store Share Kit — a QR share card for Instagram (post + story), plus
 * WhatsApp, native share and copy-link for the store's public URL.
 *
 * Two columns from `lg`: the live preview (sticky) beside the controls. On a
 * phone the preview comes FIRST, then the controls, then the downloads — the
 * seller sees what they are making before they are asked to change it.
 *
 * The preview is the real renderer at full resolution, scaled by CSS, so it
 * IS the downloaded image. See `features/shareKit/shareCard.ts`.
 */

const TEMPLATES: { value: ShareTemplate; label: string; hint: string }[] = [
  { value: 'minimal', label: 'Minimal', hint: 'Clean white card' },
  { value: 'brand', label: 'Brand', hint: 'In your shop colour' },
  { value: 'product', label: 'Product', hint: 'Leads with a photo' },
]

const QR_STYLES: { value: QrStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'brand', label: 'Brand' },
  { value: 'rounded', label: 'Rounded' },
]

const FORMAT_TABS: { value: ShareFormat; label: string }[] = [
  { value: 'post', label: 'Post · 4:5' },
  { value: 'story', label: 'Story · 9:16' },
]

export function StoreSharePage() {
  const { store } = useManagedStore()
  const kit = useShareKit(store)
  const { choices } = kit
  const accentColor =
    (choices.accents.find((a) => a.key === choices.accentKey) ?? choices.accents[0])?.color ?? '#6c3ef4'

  if (!kit.url || !kit.qrAvailable) {
    return (
      <div className="space-y-4">
        <Header />
        <ErrorState
          title="We couldn't make your store link"
          message="Your store address isn't available right now. Refresh the page, or contact Help from UnieMax if it keeps happening."
          onRetry={() => window.location.reload()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      {!store.isPublished && (
        <InfoNote>
          Your shop isn’t live yet. You can make your card now, but people who scan it will only
          see your shop once you publish it from the{' '}
          <Link to=".." relative="path" className="font-semibold underline underline-offset-2">
            Dashboard
          </Link>
          .
        </InfoNote>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        {/* ---- Preview ---- */}
        <section aria-label="Preview" className="lg:sticky lg:top-24 lg:self-start">
          <Segmented
            legend="Image size"
            name="format"
            options={FORMAT_TABS}
            value={choices.format}
            onChange={choices.setFormat}
          />
          <Preview kit={kit} />
          <p className="mt-3 text-center text-sm text-muted">
            {choices.format === 'post' ? '1080 × 1350 px' : '1080 × 1920 px'} · updates as you
            choose
          </p>
        </section>

        {/* ---- Controls ---- */}
        <div className="space-y-6">
          <Field label="Template">
            <div role="radiogroup" aria-label="Template" className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <OptionTile
                  key={t.value}
                  name="template"
                  checked={choices.template === t.value}
                  onChange={() => choices.setTemplate(t.value)}
                >
                  <TemplateThumb template={t.value} accent={accentColor} />
                  <span className="mt-2 block text-sm font-semibold text-fg">{t.label}</span>
                  <span className="hidden text-caption leading-snug text-muted sm:block">{t.hint}</span>
                </OptionTile>
              ))}
            </div>
          </Field>

          {choices.template === 'product' && <ProductPicker kit={kit} />}

          <Field label="Background">
            <div role="radiogroup" aria-label="Background" className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {PATTERNS.map((pattern) => (
                <OptionTile
                  key={pattern.value}
                  name="pattern"
                  checked={choices.pattern === pattern.value}
                  onChange={() => choices.setPattern(pattern.value)}
                >
                  <PatternSwatch
                    pattern={pattern.value}
                    template={choices.template}
                    palette={kit.palette}
                    seed={store.name}
                  />
                  <span className="mt-1.5 block truncate text-caption font-medium text-fg">
                    {pattern.label}
                  </span>
                </OptionTile>
              ))}
            </div>
          </Field>

          <Segmented
            legend="QR style"
            name="qr-style"
            options={QR_STYLES}
            value={choices.qrStyle}
            onChange={choices.setQrStyle}
          />

          <Field
            label="Colour"
            hint="From your shop’s colours. Dark enough to scan is checked for you."
          >
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
              {choices.accents.map((a) => (
                <label key={a.key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="accent"
                    className="peer sr-only"
                    checked={choices.accentKey === a.key}
                    onChange={() => choices.setAccentKey(a.key)}
                  />
                  <span className="flex h-tap items-center gap-2 rounded-pill border border-line bg-surface pr-4 pl-1.5 text-sm font-medium text-fg transition-colors peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-brand hover:border-fg/30">
                    <span
                      aria-hidden
                      className="h-8 w-8 rounded-full border border-fg/10"
                      style={{ backgroundColor: a.color }}
                    />
                    {a.label}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <CaptionField value={choices.caption} onChange={choices.setCaption} />

          <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-fg">Logo in the QR code</p>
              <p className="text-sm text-muted">
                {kit.hasLogo
                  ? 'Your logo sits in the middle. The code still scans.'
                  : 'No logo yet, so your initials are used.'}
              </p>
            </div>
            <BigSwitch
              checked={choices.showLogoInQr}
              label="Show logo in the QR code"
              onText="On"
              offText="Off"
              onChange={choices.setShowLogoInQr}
            />
          </div>

          <Downloads kit={kit} />
          <ShareLinks url={kit.url} onCopy={kit.copyLink} onShare={kit.shareStore} />
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <PageHeader
      icon={QrCodeIcon}
      title="Share your store"
      description="Make a QR card for Instagram, or send your store link on WhatsApp."
    />
  )
}

type Kit = ReturnType<typeof useShareKit>

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function Preview({ kit }: { kit: Kit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const { format } = kit.choices
  const { ready, render, prepareShare } = kit

  useEffect(() => {
    const canvas = canvasRef.current
    if (!ready || !canvas) return
    // Drawing is synchronous and takes a few ms at full size; one frame
    // later keeps typing in the caption field smooth.
    const frame = requestAnimationFrame(() => {
      try {
        render(canvas, format)
        // Have the PNG ready before the seller taps Share (see useShareKit).
        prepareShare(canvas, format)
        setFailed(false)
      } catch {
        setFailed(true)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, render, format, prepareShare])

  return (
    <div
      className={`relative mx-auto mt-4 w-full ${format === 'post' ? 'max-w-[400px]' : 'max-w-[300px]'}`}
    >
      <div
        className="overflow-hidden rounded-lg border border-line bg-surface-alt shadow-floating"
        style={{ aspectRatio: format === 'post' ? '1080 / 1350' : '1080 / 1920' }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Preview of your Instagram ${format}`}
          className={`block h-full w-full transition-opacity duration-200 ${ready && !failed ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
      {!ready && !failed && (
        <div role="status" aria-label="Preparing preview" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
          <div className="h-16 w-16 animate-pulse rounded-lg bg-line" />
          <div className="h-5 w-2/3 animate-pulse rounded-md bg-line" />
          <div className="aspect-square w-3/4 animate-pulse rounded-lg bg-line" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center p-4">
          <ErrorNote>We couldn’t draw your card. Refresh the page and try again.</ErrorNote>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-fg">{label}</legend>
      {hint && <p className="mb-2.5 text-sm text-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </fieldset>
  )
}

/** A segmented control built from radios — arrow keys move the choice. */
function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <Field label={legend}>
      <div
        role="radiogroup"
        aria-label={legend}
        className="grid gap-1 rounded-md bg-surface-alt p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="flex h-tap items-center justify-center rounded-sm px-2 text-center text-sm font-medium text-muted transition-colors peer-checked:bg-surface peer-checked:text-fg peer-checked:shadow-floating peer-focus-visible:ring-2 peer-focus-visible:ring-brand hover:text-fg">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </Field>
  )
}

function OptionTile({
  name,
  checked,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={onChange} />
      <span className="block h-full rounded-lg border border-line bg-surface p-2.5 transition-colors peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-brand hover:border-fg/30">
        {children}
      </span>
    </label>
  )
}

/**
 * A tiny schematic of each template — shape, not a second renderer. Painted
 * in the colour the card will actually use, so "Brand" previews the SHOP's
 * colour rather than UnieMax purple.
 */
function TemplateThumb({ template, accent }: { template: ShareTemplate; accent: string }) {
  const brand = template === 'brand'
  return (
    <span
      aria-hidden
      className={`flex h-20 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md border sm:h-24 ${
        brand ? 'border-transparent' : 'border-line bg-white'
      }`}
      style={brand ? { backgroundColor: accent } : undefined}
    >
      {template === 'product' ? (
        <span className="h-[30%] w-full" style={{ backgroundColor: `${accent}22` }} />
      ) : (
        <span className={`h-2.5 w-2.5 rounded-sm ${brand ? 'bg-white' : 'bg-fg/20'}`} />
      )}
      <span className={`h-1 w-1/2 rounded-full ${brand ? 'bg-white/80' : 'bg-fg/40'}`} />
      <span className="mt-0.5 grid h-[34%] aspect-square place-items-center rounded-sm border border-fg/10 bg-white">
        <QrCodeIcon className="h-3/4 w-3/4 text-fg/70" />
      </span>
      <span className={`h-1 w-1/3 rounded-full ${brand ? 'bg-white/60' : 'bg-fg/25'}`} />
    </span>
  )
}

/**
 * A pattern swatch: a scaled-down 1080×720 crop of the real card background —
 * same `drawPattern`, same layout (so Rings and Confetti sit where they will
 * on the card), with extra opacity so it still reads at thumbnail size.
 */
function PatternSwatch({
  pattern,
  template,
  palette,
  seed,
}: {
  pattern: SharePattern
  template: ShareTemplate
  palette: CardPalette
  seed: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { bg, ink } = cardBackground(template, palette)
    const k = canvas.width / 1080
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 1080, 720)
    drawPattern(ctx, pattern, { x: 0, y: 0, w: 1080, h: 720, unit: 1.8, color: ink, seed, emphasis: 1.8,
      accent: palette.accent, onAccent: template === 'brand' })
  }, [pattern, template, palette, seed])
  return (
    <canvas
      ref={ref}
      width={360}
      height={240}
      aria-hidden
      className="block aspect-[3/2] w-full rounded-md border border-line"
    />
  )
}

function ProductPicker({ kit }: { kit: Kit }) {
  const { products, productList, choices } = kit

  return (
    <Field label="Product" hint="Pick the photo to lead your card.">
      {products === null || products.status === 'loading' ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} rows={1} height="aspect-square" />
          ))}
        </div>
      ) : products.status === 'error' ? (
        <div className="rounded-lg border border-line">
          <ErrorState
            compact
            title="Couldn’t load your products"
            message="Check your connection and try again."
            onRetry={kit.retryProducts}
          />
        </div>
      ) : (
        <>
          {productList.length === 0 && (
            <p className="mb-2.5 rounded-lg bg-surface-alt px-4 py-3 text-sm text-muted">
              No live products with a photo yet, so your logo is used.{' '}
              <Link to="../products" relative="path" className="font-semibold text-brand underline underline-offset-2">
                Add a product
              </Link>
            </p>
          )}
          <div
            role="radiogroup"
            aria-label="Product"
            className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4"
          >
            <OptionTile name="product" checked={choices.productId === null} onChange={() => choices.setProductId(null)}>
              <span className="flex aspect-square w-full items-center justify-center rounded-md bg-brand-soft text-brand">
                <StoreIcon className="h-6 w-6" />
              </span>
              <span className="mt-1.5 block truncate text-caption font-medium text-fg">Logo only</span>
            </OptionTile>
            {productList.map((product) => (
              <OptionTile
                key={product.id}
                name="product"
                checked={choices.productId === product.id}
                onChange={() => choices.setProductId(product.id)}
              >
                <MediaImg
                  src={productCover(product)}
                  sizes="96px"
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-md bg-surface-alt object-cover"
                />
                <span className="mt-1.5 block truncate text-caption font-medium text-fg">{product.name}</span>
              </OptionTile>
            ))}
          </div>
        </>
      )}
    </Field>
  )
}

function CaptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId()
  const isPreset = (CAPTION_PRESETS as readonly string[]).includes(value)
  return (
    <Field label="Caption">
      <div role="radiogroup" aria-label="Caption presets" className="flex flex-wrap gap-2">
        {CAPTION_PRESETS.map((preset) => (
          <label key={preset} className="cursor-pointer">
            <input
              type="radio"
              name="caption"
              className="peer sr-only"
              checked={value === preset}
              onChange={() => onChange(preset)}
            />
            <span className="flex h-tap items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-sm font-medium text-fg transition-colors peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand hover:border-fg/30">
              {value === preset && <CheckIcon className="h-4 w-4" />}
              {preset}
            </span>
          </label>
        ))}
      </div>
      <label htmlFor={inputId} className="mt-3 mb-1.5 block text-sm text-muted">
        Or write your own
      </label>
      <input
        id={inputId}
        type="text"
        maxLength={CAPTION_MAX}
        value={isPreset ? '' : value}
        placeholder="e.g. Order on our website"
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass({})}
      />
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Share or download. On a phone that can hand files to the share sheet, the
 * main action is **Share image** (straight to Instagram / WhatsApp, no
 * gallery round-trip) and both downloads step down to secondary — one
 * primary per screen. Everywhere else the previewed format's download is
 * the primary, as before.
 */
function Downloads({ kit }: { kit: Kit }) {
  const { format } = kit.choices
  const disabled = !kit.ready
  // Touch devices only: desktop sellers file images, phones send them.
  const touch = useMediaQuery('(pointer: coarse)')
  const shareFirst = kit.shareImagesSupported && touch
  const card = (fmt: ShareFormat, label: string) => (
    <Button
      variant={fmt === format && !shareFirst ? 'primary' : 'secondary'}
      size="lg"
      full
      disabled={disabled || (kit.busy !== null && kit.busy !== fmt)}
      loading={kit.busy === fmt}
      onClick={() => void kit.downloadCard(fmt)}
    >
      {kit.busy !== fmt && <DownloadIcon className="h-5 w-5" />}
      {label}
    </Button>
  )
  return (
    <section aria-labelledby="share-downloads" className="space-y-3 border-t border-line pt-6">
      <h3 id="share-downloads" className="text-base font-semibold text-fg">
        {shareFirst ? 'Share or download' : 'Download'}
      </h3>
      {shareFirst && (
        <div>
          <Button
            variant="primary"
            size="lg"
            full
            disabled={disabled || (kit.busy !== null && kit.busy !== 'share')}
            loading={kit.busy === 'share'}
            onClick={kit.shareImage}
          >
            {kit.busy !== 'share' && <ShareIcon className="h-5 w-5" />}
            Share image
          </Button>
          <p className="mt-1.5 text-center text-sm text-muted">
            Sends your {format === 'post' ? 'post' : 'story'} to Instagram, WhatsApp and more.
          </p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {card('post', 'Instagram Post')}
        {card('story', 'Instagram Story')}
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className="mr-1 text-sm text-muted">QR code only:</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || kit.busy !== null}
          loading={kit.busy === 'qr-png'}
          onClick={() => void kit.downloadQrPng()}
        >
          PNG
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || kit.busy !== null}
          loading={kit.busy === 'qr-svg'}
          onClick={() => void kit.downloadQrSvg()}
        >
          SVG
        </Button>
      </div>
    </section>
  )
}

function ShareLinks({
  url,
  onCopy,
  onShare,
}: {
  url: string
  onCopy: () => Promise<void>
  onShare: () => Promise<void>
}) {
  return (
    <section aria-labelledby="share-link" className="space-y-3 border-t border-line pt-6">
      <h3 id="share-link" className="text-base font-semibold text-fg">
        Share your store link
      </h3>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-tap items-center gap-2 rounded-md border border-line bg-surface-alt px-3 text-sm text-muted transition-colors hover:text-fg"
      >
        <GlobeIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{url.replace(/^https?:\/\//, '')}</span>
      </a>
      <a
        href={whatsAppStoreMessageUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp text-base font-bold text-whatsapp-contrast transition hover:opacity-90"
      >
        <ChatIcon className="h-5 w-5" />
        Share on WhatsApp
      </a>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" full onClick={() => void onShare()}>
          <ShareIcon className="h-4 w-4" />
          Share store
        </Button>
        <Button variant="secondary" size="md" full onClick={() => void onCopy()}>
          <LinkIcon className="h-4 w-4" />
          Copy link
        </Button>
      </div>
    </section>
  )
}
