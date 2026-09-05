import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import type { ProductRow } from '../../features/adminApi'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { TextArea } from '../../ui/primitives'

/**
 * The one moderation lever the platform holds over a seller's listing:
 * hide it (or put it back). Lives in its own component because it is
 * reached from two places — the catalog table's row button and the
 * product's own detail dialog — and the two must ask the same question
 * the same way.
 *
 * Hiding always asks for a reason: the seller is told what happened the
 * moment it does, and "your product was hidden" with no explanation is a
 * support ticket by construction.
 */
export function ProductVisibilityDialog({
  product,
  onClose,
  onDone,
}: {
  /** The listing to act on; `null` keeps the dialog closed. */
  product: Pick<ProductRow, 'id' | 'name' | 'isActive' | 'store'> | null
  onClose: () => void
  /** Fired after the change lands, so the caller can refresh its view. */
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setReason('')
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!product) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.setProductVisibility(product.id, {
        isActive: !product.isActive,
        reason: reason.trim() || null,
      })
      setReason('')
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the product')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={product !== null}
      busy={busy}
      title={product?.isActive ? 'Hide this product?' : 'Restore this product?'}
      tone={product?.isActive ? 'danger' : 'neutral'}
      confirmLabel={product?.isActive ? 'Hide product' : 'Restore product'}
      description={
        <div className="space-y-3">
          <p>
            {product?.isActive ? (
              <>
                <strong className="text-fg">{product?.name}</strong> will disappear from{' '}
                {product?.store.name} immediately, and the seller will be notified.
              </>
            ) : (
              <>
                <strong className="text-fg">{product?.name}</strong> will be visible on{' '}
                {product?.store.name} again.
              </>
            )}
          </p>
          {product?.isActive ? (
            <TextArea
              label="Reason for the seller"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Listing images don't match the product"
              maxLength={300}
            />
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      }
      onCancel={close}
      onConfirm={() => void submit()}
    />
  )
}
