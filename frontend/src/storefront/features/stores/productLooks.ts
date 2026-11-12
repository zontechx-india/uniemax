/**
 * Photos per variant on the product page. A product owns a library of photos;
 * each variant keeps an ordered list of them (`mediaIds`, [0] = its main
 * photo). Lists may share photos — one photo can show Pink and Green — and
 * every size of a colour carries the same list. A photo no variant lists is
 * an "all colours" photo (size chart, fabric).
 */

interface Item {
  id: string
}

interface VariantPhotos {
  mediaIds: readonly string[]
}

/**
 * The gallery for the shopper's current variant: its photos in order, then
 * the "all colours" photos. Another colour's own photos are left out. With no
 * variant, or a variant without photos of its own, every photo shows.
 */
export function galleryFor<T extends Item>(
  media: readonly T[],
  variants: readonly VariantPhotos[],
  current: VariantPhotos | null | undefined,
): T[] {
  const mine = (current?.mediaIds ?? []).flatMap((id) => {
    const item = media.find((m) => m.id === id)
    return item ? [item] : []
  })
  if (mine.length === 0) return [...media]
  const listed = new Set(variants.flatMap((v) => v.mediaIds))
  return [...mine, ...media.filter((m) => !listed.has(m.id))]
}
