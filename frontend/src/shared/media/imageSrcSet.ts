import { http } from '../auth/http'
import type { ImageDelivery } from './mediaConfig'

const patterns = new Map<string, RegExp>()

/**
 * The `srcset` of a stored image: its sized copies plus the original, or
 * undefined for anything the server does not store (a local preview, an
 * outside URL), which is then shown as is.
 */
export function imageSrcSet(url: string, delivery: ImageDelivery): string | undefined {
  const source = delivery.sources.find((s) => url.startsWith(s.root))
  if (!source) return undefined
  const key = url.slice(source.root.length)
  let pattern = patterns.get(delivery.keyPattern)
  if (!pattern) {
    pattern = new RegExp(delivery.keyPattern)
    patterns.set(delivery.keyPattern, pattern)
  }
  if (!pattern.test(key)) return undefined

  const base = `${http.defaults.baseURL ?? ''}/api/v1/public/images/w`
  return [
    ...delivery.widths
      .filter((width) => width < source.maxWidth)
      .map((width) => `${base}/${width}/${source.bucket}/${key} ${width}w`),
    `${url} ${source.maxWidth}w`,
  ].join(', ')
}
