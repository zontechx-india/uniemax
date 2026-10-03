import { useSyncExternalStore } from 'react'
import { call, http } from '../auth/http'

/**
 * Upload rules (max sizes + allowed types) and image delivery (where sized
 * copies of stored images are served) as configured on the BACKEND —
 * fetched once from /api/v1/public/media-config so upload hints, pre-upload
 * validation and every `srcset` can never drift from what the server does.
 */

export interface MediaRule {
  maxMB: number
  contentTypes: string[]
}

/**
 * A stored image's URL is `root + key`; its copy `width` px wide is served
 * at `/api/v1/public/images/w/{width}/{bucket}/{key}` for keys matching
 * `keyPattern`. `maxWidth` is the `srcset` width of the original itself.
 */
export interface ImageDelivery {
  widths: number[]
  keyPattern: string
  sources: { bucket: string; root: string; maxWidth: number }[]
}

export interface MediaConfig {
  image: MediaRule
  video: MediaRule
  logo: MediaRule
  images: ImageDelivery
}

/** Mirror of the backend defaults — used only if the config fetch fails. */
const FALLBACK: MediaConfig = {
  image: {
    maxMB: 5,
    contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  },
  video: {
    maxMB: 50,
    contentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  logo: {
    maxMB: 2,
    contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  },
  // No sources: every image is shown as its plain original.
  images: { widths: [], keyPattern: '^$', sources: [] },
}

let cached: Promise<MediaConfig> | null = null
let loaded: MediaConfig | null = null
const listeners = new Set<() => void>()

/** Starts the one fetch (also kicked off at boot, beside the page's own data). */
export function getMediaConfig(): Promise<MediaConfig> {
  cached ??= call<MediaConfig>(http.get('/api/v1/public/media-config'))
    .catch(() => FALLBACK)
    .then((config) => {
      loaded = config
      listeners.forEach((notify) => notify())
      return config
    })
  return cached
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  void getMediaConfig()
  return () => {
    listeners.delete(notify)
  }
}

/**
 * The config, or null until the one fetch lands. Synchronous once loaded, so
 * components mounted later never render a loading pass.
 */
export function useMediaConfig(): MediaConfig | null {
  return useSyncExternalStore(subscribe, () => loaded)
}

/** Pre-upload validation — returns a user-facing error message, or null. */
export function validateFile(file: File, rule: MediaRule): string | null {
  const type = file.type.toLowerCase()
  if (!rule.contentTypes.includes(type)) {
    return `"${file.name}" is not a supported format. Use ${formatTypes(rule.contentTypes)}.`
  }
  if (file.size > rule.maxMB * 1024 * 1024) {
    return `"${file.name}" is too large — the maximum is ${rule.maxMB} MB.`
  }
  return null
}

/**
 * Sanity ceiling for a picked IMAGE file, before it is decoded and optimized.
 * Not the upload limit — decoding a 60 MP photo is what would hurt, and by the
 * time the browser has re-encoded it to WebP it is a small fraction of this.
 */
export const SOURCE_MAX_MB = 40

/**
 * Validation for an image the browser is about to OPTIMIZE (downscale +
 * WebP-encode) before uploading — every product photo and store logo.
 *
 * The format must be supported, but the file's own size is deliberately not
 * measured against `rule.maxMB`: a 12 MB phone photo lands well under the
 * server limit once re-encoded, and rejecting it up front would send the
 * seller off to find an image editor for no reason. The size that matters is
 * checked on the RESULT (`prepareImage`), which is the blob actually uploaded.
 */
export function validateImageSource(file: File, rule: MediaRule): string | null {
  const type = file.type.toLowerCase()
  if (!rule.contentTypes.includes(type)) {
    return `"${file.name}" is not a supported format. Use ${formatTypes(rule.contentTypes)}.`
  }
  if (file.size > SOURCE_MAX_MB * 1024 * 1024) {
    return `"${file.name}" is too large to open — keep photos under ${SOURCE_MAX_MB} MB.`
  }
  return null
}

const TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'video/mp4': 'MP4',
  'video/webm': 'WebM',
  'video/quicktime': 'MOV',
}

/** "image/jpeg,image/png" → "JPG, PNG" (for hint lines). */
export function formatTypes(types: string[]): string {
  return types.map((t) => TYPE_LABELS[t] ?? t).join(', ')
}

/** `accept` attribute value for a file input. */
export function acceptAttr(rule: MediaRule): string {
  return rule.contentTypes.join(',')
}

/** The standard hint line under an upload control. */
export function ruleHint(rule: MediaRule): string {
  return `${formatTypes(rule.contentTypes)} · max ${rule.maxMB} MB`
}
