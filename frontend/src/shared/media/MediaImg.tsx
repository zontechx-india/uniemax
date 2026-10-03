import type { ImgHTMLAttributes } from 'react'
import { imageSrcSet } from './imageSrcSet'
import { useMediaConfig } from './mediaConfig'

type MediaImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> & {
  src: string | null | undefined
  /**
   * How wide the image is drawn, as an HTML `sizes` value — `"48px"`, or
   * `"(min-width: 1024px) 25vw, 50vw"` for a grid. Required: the browser
   * picks which copy to download from it.
   */
  sizes: string
}

/**
 * Every stored image (product photo, logo, banner) is drawn with this, never
 * a bare `<img>`: the browser downloads the copy that fits how big it is
 * drawn instead of the full-size original.
 *
 * Until the media config arrives (one small request, started at boot) the
 * image has no `src`, so it is never downloaded twice — full size first,
 * then the right size.
 */
export function MediaImg({ src, sizes, ...rest }: MediaImgProps) {
  const config = useMediaConfig()
  if (!config || !src) return <img {...rest} />
  const srcSet = imageSrcSet(src, config.images)
  // srcSet/sizes before src: a browser that sees src first may start
  // fetching the original.
  return <img {...rest} srcSet={srcSet} sizes={srcSet ? sizes : undefined} src={src} />
}
