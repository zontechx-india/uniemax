import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shareOrCopy, copyToClipboard } from '../../../../shared/share'
import { publicStoreUrl, storeCatalogApi } from '../../../features/stores/storesApi'
import type { Store, StoreProduct } from '../../../features/stores/storesApi'
import { accentOptions, cardPalette } from '../../../features/shareKit/palette'
import type { AccentKey } from '../../../features/shareKit/palette'
import { encodeQr, qrSvg } from '../../../features/shareKit/qr'
import type { QrMatrix, QrStyle } from '../../../features/shareKit/qr'
import {
  FORMATS,
  drawShareCard,
  loadShareFonts,
  qrCenterImage,
} from '../../../features/shareKit/shareCard'
import type { ShareCardSpec, ShareFormat, ShareTemplate } from '../../../features/shareKit/shareCard'
import {
  canShareImages,
  canvasToBlob,
  downloadBlob,
  imageToDataUrl,
  loadCanvasImage,
} from '../../../features/shareKit/shareAssets'
import { displayUrl, instagramHandle, storeTagline } from '../../../features/shareKit/share'
import { drawQr } from '../../../features/shareKit/qr'
import type { SharePattern } from '../../../features/shareKit/patterns'
import { showToast } from '../ui/Toast'

export const CAPTION_PRESETS = ['Scan to Shop', 'Visit Our Store', 'Shop Now', 'Explore Store'] as const

export const CAPTION_MAX = 24

/** A product the Product template can use: live, finished, with a photo. */
export function productCover(product: StoreProduct): string | null {
  if (!product.isActive || product.isDraft) return null
  const image = [...product.media]
    .filter((m) => m.type === 'IMAGE' && m.url)
    .sort((a, b) => a.displayOrder - b.displayOrder)[0]
  return image?.url ?? null
}

type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }

/**
 * Everything the Share Kit page holds: the seller's choices, the images and
 * fonts the renderer needs, and the actions (download, share, copy).
 *
 * The spec is DERIVED on every render from the choices, so the preview never
 * needs a "Generate" step — the page redraws the canvas whenever it changes.
 */
export function useShareKit(store: Store) {
  const [template, setTemplate] = useState<ShareTemplate>('minimal')
  const [format, setFormat] = useState<ShareFormat>('post')
  const [qrStyle, setQrStyle] = useState<QrStyle>('brand')
  const [accentKey, setAccentKey] = useState<AccentKey>('primary')
  const [caption, setCaption] = useState<string>(CAPTION_PRESETS[0])
  const [showLogoInQr, setShowLogoInQr] = useState(true)
  // Glass by default: a flat card reads as unfinished in a busy feed.
  const [pattern, setPattern] = useState<SharePattern>('liquid')
  /** `undefined` = not chosen yet (the first product is used); `null` = logo only. */
  const [productId, setProductId] = useState<string | null | undefined>(undefined)

  const [fontsReady, setFontsReady] = useState(false)
  const [logo, setLogo] = useState<{ url: string | null; image: HTMLImageElement | null } | null>(null)
  const [products, setProducts] = useState<Loadable<StoreProduct[]> | null>(null)
  const [productImage, setProductImage] = useState<{ url: string; image: HTMLImageElement | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const url = store.slug ? publicStoreUrl(store.slug) : ''

  // ---- Assets ---------------------------------------------------------------

  useEffect(() => {
    let live = true
    void loadShareFonts().then(() => live && setFontsReady(true))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    void loadCanvasImage(store.logoUrl, 640).then((image) => {
      if (live) setLogo({ url: store.logoUrl, image })
    })
    return () => {
      live = false
    }
  }, [store.logoUrl])

  const fetchProducts = useCallback(
    () =>
      storeCatalogApi
        .listProducts(store.id)
        .then((list) => setProducts({ status: 'ready', value: list.filter((p) => productCover(p) !== null) }))
        .catch(() => setProducts({ status: 'error' })),
    [store.id],
  )
  const retryProducts = () => {
    setProducts({ status: 'loading' })
    void fetchProducts()
  }

  // Products are only fetched once the seller opens the Product template
  // (`null` = not asked yet, which the page shows as loading).
  const wantsProducts = template === 'product'
  const productsRequested = products !== null
  useEffect(() => {
    if (wantsProducts && !productsRequested) void fetchProducts()
  }, [wantsProducts, productsRequested, fetchProducts])

  const productList = products?.status === 'ready' ? products.value : []
  const selectedProduct =
    productId === null
      ? null
      : (productList.find((p) => p.id === productId) ?? (productId === undefined ? productList[0] : undefined) ?? null)
  const selectedCover = selectedProduct ? productCover(selectedProduct) : null

  useEffect(() => {
    if (!wantsProducts || !selectedCover) return
    let live = true
    void loadCanvasImage(selectedCover, 1280).then((image) => {
      if (live) setProductImage({ url: selectedCover, image })
    })
    return () => {
      live = false
    }
  }, [wantsProducts, selectedCover])

  // ---- Derived spec ---------------------------------------------------------

  const accents = useMemo(() => accentOptions(store.theme), [store.theme])
  const accent = (accents.find((a) => a.key === accentKey) ?? accents[0]!).color
  const palette = useMemo(() => cardPalette(accent, qrStyle), [accent, qrStyle])

  const matrix = useMemo<QrMatrix | null>(() => {
    if (!url) return null
    try {
      return encodeQr(url)
    } catch {
      return null
    }
  }, [url])

  const handle = instagramHandle(store.footer.social.instagram)
  const printedUrl = url ? displayUrl(url) + (handle ? `  ·  @${handle}` : '') : ''
  const trimmedCaption = caption.trim() || CAPTION_PRESETS[0]

  const specFor = useCallback(
    (fmt: ShareFormat): ShareCardSpec => ({
      template,
      format: fmt,
      qrStyle,
      palette,
      storeName: store.name,
      tagline: storeTagline(store.footer.info.about, 'Shop online with us'),
      caption: trimmedCaption,
      displayUrl: printedUrl,
      eyebrow: 'Shop now',
      showLogoInQr,
      pattern,
    }),
    [template, qrStyle, palette, store.name, store.footer.info.about, trimmedCaption, printedUrl, showLogoInQr, pattern],
  )

  const logoImage = logo?.url === store.logoUrl ? logo.image : null
  const productReady =
    !wantsProducts ||
    (products !== null && products.status !== 'loading' && (!selectedCover || productImage?.url === selectedCover))
  const ready = fontsReady && logo !== null && matrix !== null && productReady

  const assets = useMemo(
    () =>
      matrix
        ? {
            matrix,
            logo: logoImage,
            product: wantsProducts && productImage?.url === selectedCover ? productImage.image : null,
          }
        : null,
    [matrix, logoImage, wantsProducts, productImage, selectedCover],
  )

  /** Draw one format onto `canvas` at its real size. Throws on failure. */
  const render = useCallback(
    (canvas: HTMLCanvasElement, fmt: ShareFormat) => {
      if (!assets) throw new Error('QR unavailable')
      const { width, height } = FORMATS[fmt]
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      drawShareCard(ctx, specFor(fmt), assets)
    },
    [assets, specFor],
  )

  // ---- Actions --------------------------------------------------------------

  const slug = store.slug || 'store'

  const run = async (key: string, work: () => Promise<void>, failure: string) => {
    setBusy(key)
    try {
      await work()
    } catch {
      showToast(failure, 'danger')
    } finally {
      setBusy(null)
    }
  }

  const downloadCard = (fmt: ShareFormat) =>
    run(
      fmt,
      async () => {
        const canvas = document.createElement('canvas')
        render(canvas, fmt)
        downloadBlob(await canvasToBlob(canvas), `${slug}-instagram-${fmt}.png`)
        showToast(fmt === 'post' ? 'Instagram post downloaded' : 'Instagram story downloaded')
      },
      "We couldn't create the image. Please try again.",
    )

  const downloadQrPng = () =>
    run(
      'qr-png',
      async () => {
        if (!matrix) throw new Error('QR unavailable')
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1200
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        const center = qrCenterImage({ showLogoInQr, storeName: store.name, palette }, logoImage)
        drawQr(ctx, matrix, { x: 0, y: 0, size: 1200, style: qrStyle, color: palette.qr, logo: center ? { image: center } : null })
        downloadBlob(await canvasToBlob(canvas), `${slug}-qr-code.png`)
        showToast('QR code downloaded')
      },
      "We couldn't create the QR code. Please try again.",
    )

  const downloadQrSvg = () =>
    run(
      'qr-svg',
      async () => {
        if (!matrix) throw new Error('QR unavailable')
        const center = qrCenterImage({ showLogoInQr, storeName: store.name, palette }, logoImage)
        let logoData: string | null = null
        if (center instanceof HTMLImageElement) logoData = imageToDataUrl(center)
        else if (center instanceof HTMLCanvasElement) logoData = center.toDataURL('image/png')
        const svg = qrSvg(matrix, qrStyle, palette.qr, showLogoInQr ? logoData : null)
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slug}-qr-code.svg`)
        showToast('QR code downloaded')
      },
      "We couldn't create the QR code. Please try again.",
    )

  // ---- Share the image itself (phones) ---------------------------------------
  //
  // iOS Safari only opens the share sheet when `navigator.share` is called
  // INSIDE the tap — encoding a PNG first (tens to hundreds of ms) and then
  // sharing is refused with NotAllowedError. So the image is prepared ahead
  // of time: every time the preview is drawn, its canvas (which IS the
  // full-size image) is encoded shortly after the seller stops changing
  // things, and the tap shares that ready file synchronously.

  const [shareImagesSupported] = useState(canShareImages)
  const prepared = useRef<File | null>(null)
  const prepareToken = useRef(0)
  const prepareTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(prepareTimer.current), [])

  /** Called by the preview after each draw. */
  const prepareShare = useCallback(
    (canvas: HTMLCanvasElement, fmt: ShareFormat) => {
      if (!shareImagesSupported) return
      const token = ++prepareToken.current
      prepared.current = null
      window.clearTimeout(prepareTimer.current)
      prepareTimer.current = window.setTimeout(() => {
        canvasToBlob(canvas)
          .then((blob) => {
            if (token !== prepareToken.current) return
            prepared.current = new File([blob], `${slug}-instagram-${fmt}.png`, { type: 'image/png' })
          })
          .catch(() => {
            /* the tap will build it on demand instead */
          })
      }, 350)
    },
    [shareImagesSupported, slug],
  )

  const shareText = `${store.name} — shop online: ${url}`

  /** Hand one file to the share sheet; the outcome is reported, never thrown. */
  const sendFile = async (file: File) => {
    try {
      // No `url` field: several share targets drop the FILE when a URL is
      // present. The link rides in the text (WhatsApp uses it as the caption).
      await navigator.share({ files: [file], title: store.name, text: shareText })
    } catch (err) {
      const name = (err as DOMException | null)?.name
      if (name === 'AbortError') return // the seller closed the sheet
      if (name === 'NotAllowedError') {
        // Safari: the tap's permission expired while the image was being
        // made. It is ready now, so the next tap shares instantly.
        prepared.current = file
        showToast('Your image is ready. Tap Share image again.')
        return
      }
      downloadBlob(file, file.name)
      showToast("Couldn't open sharing, so the image was downloaded instead.")
    }
  }

  const shareImage = () => {
    const ready = prepared.current
    if (ready) {
      // Synchronous from the tap — the path every browser accepts.
      void sendFile(ready)
      return
    }
    // Tapped right after a change, before the background encode finished:
    // make it now (Chrome keeps the tap's permission across this).
    void run(
      'share',
      async () => {
        const canvas = document.createElement('canvas')
        render(canvas, format)
        const blob = await canvasToBlob(canvas)
        await sendFile(new File([blob], `${slug}-instagram-${format}.png`, { type: 'image/png' }))
      },
      "We couldn't create the image. Please try again.",
    )
  }

  const copyLink = async () => {
    try {
      await copyToClipboard(url)
      showToast('Link copied')
    } catch {
      showToast("Couldn't copy. Press and hold the link to copy it.", 'danger')
    }
  }

  const shareStore = async () => {
    const outcome = await shareOrCopy({ title: store.name, url })
    if (outcome === 'copied') showToast('Link copied')
    if (outcome === 'failed') showToast("Couldn't share. Press and hold the link to copy it.", 'danger')
  }

  return {
    url,
    choices: {
      template, setTemplate,
      format, setFormat,
      qrStyle, setQrStyle,
      accentKey, setAccentKey, accents,
      caption, setCaption,
      showLogoInQr, setShowLogoInQr,
      pattern, setPattern,
      productId: selectedProduct?.id ?? null, setProductId,
    },
    palette,
    products,
    productList,
    retryProducts,
    hasLogo: logoImage !== null,
    ready,
    qrAvailable: matrix !== null,
    render,
    prepareShare,
    shareImagesSupported,
    shareImage,
    busy,
    downloadCard,
    downloadQrPng,
    downloadQrSvg,
    copyLink,
    shareStore,
  }
}
