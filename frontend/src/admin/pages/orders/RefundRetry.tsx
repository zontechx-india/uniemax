import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import { Button } from '../../ui/primitives'

/**
 * "Try the refund again" under a failed refund on the order page. The server
 * makes a new refund and sends it to PaymentHub; the page then reloads and
 * shows where it stands. If it fails again, the reason is shown — the money
 * can always be sent back by hand from the PaymentHub dashboard, and this
 * page updates by itself when that goes through.
 */
export function RefundRetry({
  orderId,
  refundId,
  onDone,
}: {
  orderId: string
  refundId: string
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retry = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.retryRefund(orderId, refundId)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the refund')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2">
      <Button variant="secondary" disabled={busy} onClick={() => void retry()}>
        {busy ? 'Starting…' : 'Try the refund again'}
      </Button>
      <p className="mt-1 text-xs text-muted">
        Or refund it by hand from the PaymentHub dashboard — this page updates by itself.
      </p>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  )
}
