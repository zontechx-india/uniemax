import { formatPrice } from '../../features/stores/storesApi'
import type { StoreProduct } from '../../features/stores/storesApi'
import { MediaBoard } from './media/MediaBoard'
import { useLiveMedia } from './media/useLiveMedia'

/**
 * **Photos & video** panel of a product row.
 *
 * All of the UI lives in `MediaBoard`, which the Add Product form uses too —
 * the seller meets the same screen whether the product exists yet or not.
 * The only difference is the driver: here every action is an API call against
 * a real product, so `useLiveMedia` uploads immediately, reorders on the
 * server, and can attach a description to a media row.
 */
export function ProductMediaManager({
  storeId,
  product,
  onProductChange,
}: {
  storeId: string
  product: StoreProduct
  onProductChange: (product: StoreProduct) => void
}) {
  const driver = useLiveMedia(storeId, product, onProductChange)

  return (
    <div className="border-t border-line bg-surface-alt/40 px-4 py-4">
      <MediaBoard
        driver={driver}
        preview={{
          name: product.name,
          price: product.price === null ? null : formatPrice(product.price),
        }}
      />
    </div>
  )
}
